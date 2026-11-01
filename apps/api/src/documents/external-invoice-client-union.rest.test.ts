import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { revokeModelContractFixtureGrant } from '../contract/model-contract.test-fixture.js';
import {
  backendPid,
  waitForBlocked,
} from '../offer/offer-concurrency.test-support.js';
import {
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import { openDocumentScannerFixture } from './document-scanner.test-support.js';
import {
  externalInvoiceEffects,
  fictionalInvoicePdf,
  openExternalInvoiceDocument,
  prepareExternalInvoiceSource,
} from './external-invoice.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;

withPostgres(
  'External invoice original Client union and new-use fences',
  () => {
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

    async function legacyPair(
      f: Awaited<ReturnType<typeof prepareExternalInvoiceSource>>,
    ) {
      const originalClientId = f.f.ready.source.clientId;
      const command = (path: string, body: unknown) =>
        fixture.command({ ...f.target, path, body });
      const survivor = responseRecord(
        await command('/clients', {
          displayName: 'Fictional surviving Client',
          taxId: 'FICTIONAL-SURVIVOR-1020',
          address: 'Fictional survivor address',
        }),
      );
      const survivorId = responseString(survivor, 'id');
      const survivorDossier = responseRecord(
        await fixture.read({ ...f.target, path: `/clients/${survivorId}` }),
      );
      const survivorVersion = survivorDossier.version;
      if (
        typeof survivorVersion !== 'number' ||
        !Number.isSafeInteger(survivorVersion) ||
        survivorVersion < 1
      )
        throw new Error('Expected the current native Client dossier revision.');
      const original = responseRecord(
        await fixture.read({
          ...f.target,
          path: `/clients/${originalClientId}`,
        }),
      );
      const before = await externalInvoiceEffects(fixture);
      expect(
        (
          await fixture.post({
            ...f.target,
            path: '/clients',
            body: {
              displayName: 'Rejected duplicate fixture Client',
              taxId: original.taxId,
            },
          })
        ).status,
      ).toBe(409);
      expect(
        (
          await fixture.request({
            ...f.target,
            path: `/clients/${survivorId}`,
            init: {
              method: 'PATCH',
              headers: {
                'content-type': 'application/json',
                'idempotency-key': randomUUID(),
              },
              body: JSON.stringify({
                expectedVersion: survivorVersion,
                taxId: original.taxId,
              }),
            },
          })
        ).status,
      ).toBe(409);
      expect(await externalInvoiceEffects(fixture)).toEqual(before);
      // Explicitly permitted native Client-owner legacy-data seam: both synthetic
      // identities above were created publicly. Current commands cannot create
      // duplicate tax IDs; only this labeled historical-input preparation uses SQL.
      // Contract/declaration/party/grants/Documents and every union action stay native.
      await fixture.pool.query(
        "UPDATE client_accounts SET tax_id='FICTIONAL-LEGACY-UNION-1020' WHERE id=ANY($1::uuid[])",
        [[originalClientId, survivorId]],
      );
      const review = async () =>
        responseString(
          responseRecord(
            await command(`/clients/${originalClientId}/union-reviews`, {}),
          ),
          'reviewReference',
        );
      const confirmation = {
        canonicalClientId: survivorId,
        fields: {
          displayName: survivorId,
          taxId: originalClientId,
          address: survivorId,
          telephone: originalClientId,
          generalEmail: originalClientId,
          businessActivity: originalClientId,
        },
        companyIds: [f.companyId],
        reviewedDifferences: true,
        reason:
          'Fictional legacy duplicate reviewed; conserve both original identities',
      };
      const options = async () => ({
        ...f.target,
        path: `/client-union-reviews/${await review()}/confirm`,
        body: confirmation,
        key: randomUUID(),
      });
      const unite = async () =>
        responseRecord(await fixture.command(await options()));
      const reverse = (reference: string) =>
        fixture.post({
          ...f.target,
          path: `/client-union-operations/${reference}/reversal`,
          body: {
            companyIds: [f.companyId],
            reason:
              'Fictional mistaken union reversed while native fences still hold',
          },
        });
      return { originalClientId, survivorId, command, options, unite, reverse };
    }

    it.each([true, false])(
      'linearizes actual public legacy Client union and financial registration, Document first: %s',
      async (documentFirst) => {
        const f = await prepareExternalInvoiceSource(fixture);
        const pair = await legacyPair(f);
        const union = await pair.options();
        const table = documentFirst
          ? 'document_registration_events'
          : 'client_union_operations';
        const holder = await fixture.pool.connect();
        let first: Promise<Response> | undefined;
        let second: Promise<Response> | undefined;
        await fixture.pool.query(
          'CREATE FUNCTION pause_financial_union_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(10201021); RETURN NEW; END $$',
        );
        await fixture.pool.query(
          `CREATE TRIGGER pause_financial_union_order BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION pause_financial_union_order()`,
        );
        try {
          await holder.query('BEGIN');
          const pid = await backendPid(holder);
          await holder.query('SELECT pg_advisory_xact_lock(10201021)');
          first = documentFirst ? f.request() : fixture.post(union);
          await waitForBlocked(fixture.pool, pid);
          second = documentFirst ? fixture.post(union) : f.request();
          await waitForBlocked(fixture.pool, pid, 2);
          await holder.query('COMMIT');
          expect((await first).status).toBe(201);
          expect((await second).status).toBe(404);
          if (documentFirst) {
            const registered = responseRecord(await (await first).json());
            await pair.unite();
            const replay = await f.register();
            expect(replay).toMatchObject({
              id: registered.id,
              clientId: pair.originalClientId,
              clientDossierId: pair.survivorId,
              correction: 'read-only',
              externalInvoiceRelation: registered.externalInvoiceRelation,
            });
            const conserved = await externalInvoiceEffects(fixture);
            expect((await f.request(f.body, randomUUID())).status).toBe(404);
            expect(await externalInvoiceEffects(fixture)).toEqual(conserved);
          } else {
            const conserved = await externalInvoiceEffects(fixture);
            expect((await f.request()).status).toBe(404);
            expect(await externalInvoiceEffects(fixture)).toEqual(conserved);
            const list = await fixture.read({
              ...f.target,
              path: '/documents',
            });
            if (!Array.isArray(list))
              throw new Error('Expected native Document inventory.');
            expect(
              list
                .map(responseRecord)
                .filter((document) => document.type === 'external-invoice'),
            ).toEqual([]);
          }
        } finally {
          await holder.query('ROLLBACK').catch(() => undefined);
          holder.release();
          await first?.catch(() => undefined);
          await second?.catch(() => undefined);
          await fixture.pool.query(
            `DROP TRIGGER pause_financial_union_order ON ${table}`,
          );
          await fixture.pool.query(
            'DROP FUNCTION pause_financial_union_order()',
          );
        }
      },
    );

    it('conserves original party, metadata/history and exact bytes through public union and reversal while refusing superseded-original new use', async () => {
      const f = await openExternalInvoiceDocument(fixture);
      const originalRelation = f.document.externalInvoiceRelation;
      const versionId = responseString(
        responseRecord(f.document.version),
        'id',
      );
      const pdf = await fictionalInvoicePdf();
      const uploaded = await f.upload(versionId, 1, pdf);
      expect(uploaded.status).toBe(201);
      const representationId = responseString(
        responseRecord(await uploaded.json()),
        'representationId',
      );
      expect(
        (
          await f.mutate(`/versions/${versionId}/official-designation`, {
            expectedRevision: 2,
          })
        ).status,
      ).toBe(200);
      const versionsBefore = responseRecord(
        await (await f.call('/versions')).json(),
      );
      const uploadsBefore = await (
        await f.call(`/versions/${versionId}/content/history`)
      ).json();
      const correctionsBefore = await (
        await f.call('/correction-history')
      ).json();
      const pair = await legacyPair(f);
      const united = await pair.unite();
      const projectionReference = responseString(united, 'projectionReference');
      const afterUnion = responseRecord(await (await f.call('')).json());
      expect(afterUnion).toMatchObject({
        id: f.documentId,
        clientId: pair.originalClientId,
        clientDossierId: pair.survivorId,
        correction: 'read-only',
        externalInvoiceRelation: originalRelation,
      });
      expect(await (await f.call('/versions')).json()).toEqual({
        ...versionsBefore,
        mutable: false,
      });
      expect(
        await (await f.call(`/versions/${versionId}/content/history`)).json(),
      ).toEqual(uploadsBefore);
      expect(await (await f.call('/correction-history')).json()).toEqual(
        correctionsBefore,
      );
      expect(
        Buffer.from(
          await (
            await f.call(`/versions/${versionId}/content/${representationId}`)
          ).arrayBuffer(),
        ),
      ).toEqual(pdf);
      const beforeRefusals = await externalInvoiceEffects(fixture);
      expect((await f.request(f.body, randomUUID())).status).toBe(404);
      expect((await f.upload(versionId, 3, pdf)).status).toBe(404);
      expect(
        (await f.mutate('/versions', { expectedRevision: 3 })).status,
      ).toBe(404);
      expect(await externalInvoiceEffects(fixture)).toEqual(beforeRefusals);
      await revokeModelContractFixtureGrant(
        fixture,
        '/company-document-content-reader-assignments',
        f.companyId,
        f.membershipId,
      );
      const withoutContent = await f.call('');
      expect(withoutContent.status).toBe(200);
      expect(
        responseRecord(await withoutContent.json()).externalInvoiceRelation,
      ).toEqual(originalRelation);
      expect(
        (await f.call(`/versions/${versionId}/content/${representationId}`))
          .status,
      ).toBe(403);
      await fixture.grant({
        path: '/company-document-content-reader-assignments',
        companyId: f.companyId,
        membershipId: f.membershipId,
      });
      const reversed = await pair.reverse(projectionReference);
      expect(reversed.status).toBe(201);
      expect(await reversed.json()).toMatchObject({ outcome: 'reversed' });
      const detail = responseRecord(await (await f.call('')).json());
      expect(detail).toMatchObject({
        id: f.documentId,
        clientId: pair.originalClientId,
        externalInvoiceRelation: originalRelation,
      });
      expect(detail.clientDossierId).not.toBe(pair.survivorId);
      expect(
        await (await f.call(`/versions/${versionId}/content/history`)).json(),
      ).toEqual(uploadsBefore);
      expect(
        Buffer.from(
          await (
            await f.call(`/versions/${versionId}/content/${representationId}`)
          ).arrayBuffer(),
        ),
      ).toEqual(pdf);
      const successor = await f.mutate('/versions', { expectedRevision: 3 });
      expect(successor.status).toBe(201);
      const successorId = responseString(
        responseRecord(await successor.json()),
        'versionId',
      );
      expect(
        (
          await f.upload(
            successorId,
            4,
            await fictionalInvoicePdf('SYN-INV-AFTER-REVERSAL'),
          )
        ).status,
      ).toBe(201);
      const distinct = await f.request(f.body, randomUUID());
      expect(distinct.status).toBe(201);
      expect(await distinct.json()).toMatchObject({
        clientId: pair.originalClientId,
        externalInvoiceRelation: {
          access: 'granted',
          ...f.selection,
          recordedRecipient: responseRecord(originalRelation).recordedRecipient,
          sourceDescription: f.body.sourceDescription,
          receivedOn: f.body.receivedOn,
        },
      });
    });

    it('keeps an unrelated native family usable on the survivor and refuses reversal after that new operational reference', async () => {
      const f = await openExternalInvoiceDocument(fixture);
      const originalRelation = f.document.externalInvoiceRelation;
      const pair = await legacyPair(f);
      const united = await pair.unite();
      const ordinary = await pair.command('/documents', {
        type: 'questionnaire',
        clientId: pair.survivorId,
        title: 'Fictional ordinary survivor Document',
        purpose: 'Independent native family continuation',
        url: 'https://example.test/fictional-unverified-questionnaire',
      });
      expect(ordinary).toMatchObject({
        type: 'questionnaire',
        clientId: pair.survivorId,
      });
      const before = await externalInvoiceEffects(fixture);
      expect(
        (await pair.reverse(responseString(united, 'projectionReference')))
          .status,
      ).toBe(409);
      expect(await externalInvoiceEffects(fixture)).toEqual(before);
      expect(responseRecord(await (await f.call('')).json())).toMatchObject({
        id: f.documentId,
        clientId: pair.originalClientId,
        clientDossierId: pair.survivorId,
        externalInvoiceRelation: originalRelation,
      });
    });

    it.each([true, false])(
      'fences the native original Client archive-state boundary and registration, archive first: %s',
      async (archiveFirst) => {
        const f = await prepareExternalInvoiceSource(fixture);
        const clientId = f.f.ready.source.clientId;
        const before = await externalInvoiceEffects(fixture);
        const holder = await fixture.pool.connect();
        let pending: Promise<Response> | undefined;
        let archive: Promise<unknown> | undefined;
        try {
          await holder.query('BEGIN');
          const pid = await backendPid(holder);
          if (archiveFirst) {
            await holder.query(
              'SELECT id FROM client_accounts WHERE id=$1 FOR UPDATE',
              [clientId],
            );
            pending = f.request();
            await waitForBlocked(fixture.pool, pid);
            // Native lifecycle-state fixture; no public archive workflow is claimed.
            await holder.query(
              "UPDATE client_accounts SET status='archived' WHERE id=$1",
              [clientId],
            );
            await holder.query('COMMIT');
            expect((await pending).status).toBe(404);
            if (!Array.isArray(before.client_accounts))
              throw new Error('Expected conserved native Client rows.');
            const clients = before.client_accounts
              .map(responseRecord)
              .map((client) =>
                client.id === clientId
                  ? { ...client, status: 'archived' }
                  : client,
              );
            expect(await externalInvoiceEffects(fixture)).toEqual({
              ...before,
              client_accounts: clients,
            });
          } else {
            await fixture.pool.query(
              "CREATE FUNCTION pause_financial_archive_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS(SELECT 1 FROM working_documents WHERE id=NEW.document_id AND type='external-invoice') THEN PERFORM pg_advisory_xact_lock(10201022); END IF; RETURN NEW; END $$",
            );
            await fixture.pool.query(
              'CREATE TRIGGER pause_financial_archive_order BEFORE INSERT ON document_registration_events FOR EACH ROW EXECUTE FUNCTION pause_financial_archive_order()',
            );
            await holder.query('SELECT pg_advisory_xact_lock(10201022)');
            pending = f.request();
            await waitForBlocked(fixture.pool, pid);
            archive = fixture.pool.query(
              "UPDATE client_accounts SET status='archived' WHERE id=$1",
              [clientId],
            );
            await waitForBlocked(fixture.pool, pid, 2);
            await holder.query('COMMIT');
            expect((await pending).status).toBe(201);
            await archive;
            const conserved = await externalInvoiceEffects(fixture);
            expect((await f.request()).status).toBe(404);
            expect(await externalInvoiceEffects(fixture)).toEqual(conserved);
          }
        } finally {
          await holder.query('ROLLBACK').catch(() => undefined);
          holder.release();
          await pending?.catch(() => undefined);
          await archive?.catch(() => undefined);
          await fixture.pool.query(
            'DROP TRIGGER IF EXISTS pause_financial_archive_order ON document_registration_events',
          );
          await fixture.pool.query(
            'DROP FUNCTION IF EXISTS pause_financial_archive_order()',
          );
        }
      },
    );
  },
);
