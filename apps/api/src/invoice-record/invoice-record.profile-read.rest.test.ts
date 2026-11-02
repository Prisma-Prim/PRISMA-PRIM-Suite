import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AccessService } from '../access/access.service.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import type { ActorContext } from '../access/access.types.js';
import { revokeModelContractFixtureGrant } from '../contract/model-contract.test-fixture.js';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import {
  backendPid,
  waitForBlocked,
} from '../offer/offer-concurrency.test-support.js';
import {
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import {
  invoiceRecordEffects,
  prepareInvoiceRecordSource,
} from './invoice-record.proof-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
type ReadKind = 'inventory' | 'detail' | 'history' | 'sources' | 'download';
const reads: ReadKind[] = [
  'inventory',
  'detail',
  'history',
  'sources',
  'download',
];
const readCases: { kind: ReadKind; replaceCapture: boolean }[] = reads.map(
  (kind) => ({ kind, replaceCapture: false }),
);
readCases.push({ kind: 'inventory', replaceCapture: true });

function deferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return {
    promise,
    resolve(value: T) {
      if (!resolve)
        throw new Error('The public Actor barrier was not initialized.');
      resolve(value);
    },
  };
}

withPostgres(
  'Invoice Record snapshots through real concurrent identity-profile synchronization',
  () => {
    let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
    let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
    beforeAll(async () => {
      scanner = await openDocumentScannerFixture();
      fixture = await openEstimateOfferFixture({
        scannerEnvironment: scanner.environment,
        synchronizeIdentityProfile: true,
      });
    });
    beforeEach(async () => {
      await fixture.reset();
      scanner.reset();
    });
    afterAll(async () => {
      await fixture?.close();
      await scanner?.close();
    });

    it.each(readCases)(
      'revalidates $kind after native profile contention, equal-permission capture replacement: $replaceCapture',
      async ({ kind, replaceCapture }) => {
        const source = await prepareInvoiceRecordSource(fixture);
        const created = await source.create();
        expect(created.status).toBe(201);
        const recordId = responseString(
          responseRecord(await created.json()),
          'recordId',
        );
        expect(
          (
            await source.command({
              recordId,
              body: {
                action: 'CORRECT',
                expectedRevision: 1,
                values: { ...source.createBody.values, grossMinor: '125550' },
                reason:
                  'Keep the original declaration and its corrected transcription.',
              },
            })
          ).status,
        ).toBe(201);
        expect(
          (
            await source.command({
              recordId,
              body: {
                action: 'WITHDRAW_ENTRY',
                expectedRevision: 2,
                reason:
                  'Retain the withdrawn entry through an ordinary profile observation.',
              },
            })
          ).status,
        ).toBe(201);
        if (kind !== 'sources' && kind !== 'download')
          await revokeModelContractFixtureGrant(
            fixture,
            '/company-external-invoice-access-assignments',
            source.companyId,
            source.membershipId,
          );
        const paths = {
          inventory: '/invoice-records',
          detail: `/invoice-records/${recordId}`,
          history: `/invoice-records/${recordId}/history`,
          sources: '/invoice-records/sources',
          download: `/invoice-records/${recordId}/source`,
        } satisfies Record<ReadKind, string>;
        const path = paths[kind];
        const baseline = await source.request(path);
        expect(baseline.status).toBe(200);
        const before:
          | { kind: 'bytes'; value: Buffer }
          | { kind: 'json'; value: Record<string, unknown> } =
          kind === 'download'
            ? {
                kind: 'bytes',
                value: Buffer.from(await baseline.arrayBuffer()),
              }
            : { kind: 'json', value: responseRecord(await baseline.json()) };
        const effects = await invoiceRecordEffects(fixture);
        const established = deferred<ActorContext>(),
          releaseActor = deferred<void>();
        const readerLabel = 'Invoice snapshot reader A',
          observerLabel = 'Invoice profile observer B';
        const resolveActor = AccessService.prototype.resolveActor;
        const retryEntered = deferred<void>(),
          continueRetry = deferred<void>();
        let actorReleased = false;
        let authorityChecks = 0;
        const requireAccess =
          CompanyContextAuthorization.prototype.requireInvoiceRecordAccess;
        const access = vi
          .spyOn(
            CompanyContextAuthorization.prototype,
            'requireInvoiceRecordAccess',
          )
          .mockImplementation(async function (
            this: CompanyContextAuthorization,
            ...args: Parameters<
              CompanyContextAuthorization['requireInvoiceRecordAccess']
            >
          ) {
            if (
              replaceCapture &&
              actorReleased &&
              args[0].displayName === readerLabel
            ) {
              authorityChecks++;
              if (authorityChecks === 2) {
                retryEntered.resolve();
                await continueRetry.promise;
              }
            }
            return requireAccess.call(this, ...args);
          });
        const pause = vi
          .spyOn(AccessService.prototype, 'resolveActor')
          .mockImplementation(async function (
            this: AccessService,
            ...args: Parameters<AccessService['resolveActor']>
          ) {
            const actor = await resolveActor.call(this, ...args);
            if (
              args[0].displayName === readerLabel &&
              actor.activeCompany?.id === source.companyId
            ) {
              established.resolve(actor);
              await releaseActor.promise;
            }
            return actor;
          });
        const holder = await fixture.pool.connect();
        let reading: Promise<Response> | undefined;
        let updating: Promise<Response> | undefined;
        let result: Response | undefined;
        try {
          // The trigger delays only the real profile UPDATE inside the second
          // native HTTP request. No profile, business result or SQL response is faked.
          await fixture.pool.query(
            "CREATE FUNCTION pause_invoice_profile_observation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.display_name='Invoice profile observer B' THEN PERFORM pg_advisory_xact_lock(10306585); END IF; RETURN NEW; END $$",
          );
          await fixture.pool.query(
            'CREATE TRIGGER pause_invoice_profile_observation BEFORE UPDATE OF display_name ON internal_users FOR EACH ROW EXECUTE FUNCTION pause_invoice_profile_observation()',
          );
          await holder.query('BEGIN');
          const pid = await backendPid(holder);
          await holder.query('SELECT pg_advisory_xact_lock(10306585)');
          reading = fixture.request({
            ...source.target,
            headers: {
              ...source.target.headers,
              'x-test-display-name': readerLabel,
            },
            path,
          });
          const pendingRead = reading;
          const actor = await Promise.race([
            established.promise,
            pendingRead.then(() => {
              throw new Error(
                'The native copied read missed its established-Actor barrier.',
              );
            }),
          ]);
          expect(actor.workspaceMembershipId).toBe(source.membershipId);
          updating = fixture.request({
            ...source.target,
            headers: {
              ...source.target.headers,
              'x-test-display-name': observerLabel,
            },
            path: '/access/current-actor',
          });
          await waitForBlocked(fixture.pool, pid);
          actorReleased = true;
          releaseActor.resolve();
          // Profile B owns the User row; the snapshot read's actual authority query
          // is the second observed waiter in the native PostgreSQL blocking chain.
          await waitForBlocked(fixture.pool, pid, 2);
          await holder.query('COMMIT');
          const observed = await updating;
          expect(observed.status).toBe(200);
          expect(
            responseString(
              responseRecord(await observed.json()),
              'displayName',
            ),
          ).toBe(observerLabel);
          if (replaceCapture) {
            await Promise.race([
              retryEntered.promise,
              pendingRead.then(() => {
                throw new Error(
                  'The read did not revalidate authority on its new snapshot.',
                );
              }),
            ]);
            await revokeModelContractFixtureGrant(
              fixture,
              '/company-invoice-recorder-assignments',
              source.companyId,
              source.membershipId,
            );
            await fixture.grant({
              path: '/company-invoice-recorder-assignments',
              companyId: source.companyId,
              membershipId: source.membershipId,
            });
            continueRetry.resolve();
          }
          result = await pendingRead;
        } finally {
          releaseActor.resolve();
          continueRetry.resolve();
          await holder.query('ROLLBACK').catch(() => undefined);
          holder.release();
          pause.mockRestore();
          access.mockRestore();
          await Promise.allSettled([reading, updating]);
          await fixture.pool.query(
            'DROP TRIGGER IF EXISTS pause_invoice_profile_observation ON internal_users',
          );
          await fixture.pool.query(
            'DROP FUNCTION IF EXISTS pause_invoice_profile_observation()',
          );
        }
        if (!result)
          throw new Error('The native snapshot read did not complete.');
        if (replaceCapture) {
          expect(result.status).toBe(403);
          expect(authorityChecks).toBe(2);
          if (before.kind !== 'json')
            throw new Error(
              'The replacement control requires copied inventory.',
            );
          const fresh = await source.read(path);
          const { readCapture, ...facts } = fresh;
          const { readCapture: oldCapture, ...oldFacts } = before.value;
          expect(readCapture).not.toBe(oldCapture);
          expect(facts).toEqual(oldFacts);
          const after = await invoiceRecordEffects(fixture);
          for (const table of [
            'invoice_records',
            'invoice_record_commands',
            'invoice_record_history',
            'invoice_record_events',
            'invoice_record_cursor_keys',
            'document_pdfs',
            'document_versions',
            'document_representations',
          ]) {
            expect(effects[table]).toBeDefined();
            expect(after[table]).toEqual(effects[table]);
          }
          return;
        }
        expect(result.status).toBe(200);
        if (before.kind === 'bytes') {
          expect(Buffer.from(await result.arrayBuffer())).toEqual(before.value);
          expect(before.value).toEqual(source.bytes);
        } else expect(await result.json()).toEqual(before.value);
        expect(await invoiceRecordEffects(fixture)).toEqual(effects);
      },
    );
  },
);
