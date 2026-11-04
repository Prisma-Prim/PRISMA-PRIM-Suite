import { randomUUID } from 'node:crypto';
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
import type { ActorContext } from '../access/access.types.js';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import {
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import type { InvoiceInput } from './invoice-record.input.js';
import { prepareInvoiceRecordSource } from './invoice-record.proof-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const actions: InvoiceInput['action'][] = [
  'CREATE',
  'CORRECT',
  'WITHDRAW_ENTRY',
];

function deferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return {
    promise,
    resolve(value: T) {
      if (!resolve)
        throw new Error('The native ordering barrier was not initialized.');
      resolve(value);
    },
  };
}

withPostgres('Invoice Record established Actor label', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
  beforeAll(async () => {
    scanner = await openDocumentScannerFixture();
    fixture = await openEstimateOfferFixture({
      scannerEnvironment: scanner.environment,
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

  it.each(actions)(
    'freezes the established %s Actor label through a later native profile observation and exact replay',
    async (action) => {
      const source = await prepareInvoiceRecordSource(fixture);
      let recordId: string | undefined;
      if (action !== 'CREATE') {
        const created = await source.create();
        expect(created.status).toBe(201);
        recordId = responseString(
          responseRecord(await created.json()),
          'recordId',
        );
      }
      const capturedLabel = `Captured ${action} actor A`,
        laterLabel = `Later ${action} actor B`,
        replayLabel = `Replay ${action} actor C`,
        key = randomUUID(),
        established = deferred<ActorContext>(),
        release = deferred<void>(),
        resolveActor = AccessService.prototype.resolveActor;

      // Delay only the public authority participant after its real transaction
      // has established Actor A. Both identity observations, all access checks,
      // Invoice commands and stored facts still use native HTTP/PostgreSQL.
      const pause = vi
        .spyOn(AccessService.prototype, 'resolveActor')
        .mockImplementation(async function (
          this: AccessService,
          ...args: Parameters<AccessService['resolveActor']>
        ) {
          const actor = await resolveActor.call(this, ...args);
          if (
            args[0].displayName === capturedLabel &&
            actor.activeCompany?.id === source.companyId
          ) {
            established.resolve(actor);
            await release.promise;
          }
          return actor;
        });
      let body: unknown;
      switch (action) {
        case 'CREATE':
          body = source.createBody;
          break;
        case 'CORRECT':
          body = {
            action,
            expectedRevision: 1,
            values: { ...source.createBody.values, grossMinor: '125550' },
            reason: 'Keep the command Actor observation.',
          };
          break;
        case 'WITHDRAW_ENTRY':
          body = {
            action,
            expectedRevision: 1,
            reason: 'Withdraw with the established Actor label.',
          };
          break;
        default: {
          const unexpected: never = action;
          throw new Error(`Unknown native test action ${unexpected}`);
        }
      }
      const path =
        action === 'CREATE'
          ? '/invoice-records'
          : `/invoice-records/${recordId}/commands`;
      const dispatch = (displayName: string) =>
        fixture.post({
          ...source.target,
          headers: {
            ...source.target.headers,
            'x-test-display-name': displayName,
          },
          path,
          body,
          key,
        });
      const pending = dispatch(capturedLabel);
      try {
        const actor = await Promise.race([
          established.promise,
          pending.then(() => {
            throw new Error(
              'The native command missed its established-Actor barrier.',
            );
          }),
        ]);
        expect(actor.displayName).toBe(capturedLabel);
        expect(actor.workspaceMembershipId).toBe(source.membershipId);
        const updated = await fixture.request({
          ...source.target,
          headers: {
            ...source.target.headers,
            'x-test-display-name': laterLabel,
          },
          path: '/access/current-actor',
        });
        expect(updated.status).toBe(200);
        expect(
          responseString(responseRecord(await updated.json()), 'displayName'),
        ).toBe(laterLabel);
        release.resolve();
        const completed = await pending;
        expect(completed.status).toBe(201);
        const receipt = responseRecord(await completed.json());
        recordId = responseString(receipt, 'recordId');
        const history = await source.read(
          `/invoice-records/${recordId}/history`,
        );
        if (!Array.isArray(history.items))
          throw new Error('Expected native immutable Invoice history.');
        const fact = history.items
          .map(responseRecord)
          .find((item) => item.revision === receipt.revision);
        expect(fact).toMatchObject({
          action,
          actor: {
            membershipId: source.membershipId,
            displayName: capturedLabel,
          },
        });
        const replay = await dispatch(replayLabel);
        expect(replay.status).toBe(201);
        expect(await replay.json()).toEqual(receipt);
        expect(
          await source.read(`/invoice-records/${recordId}/history`),
        ).toEqual(history);
      } finally {
        release.resolve();
        pause.mockRestore();
        await Promise.allSettled([pending]);
      }
    },
  );
});
