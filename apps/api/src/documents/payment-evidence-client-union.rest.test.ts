import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  backendPid,
  waitForBlocked,
} from '../offer/offer-concurrency.test-support.js';
import {
  openPaymentEvidenceUnionFixture,
  paymentUnionRejectionEffects,
  type PaymentEvidenceUnionFixture,
} from './payment-evidence-client-union.test-support.js';
import {
  paymentJson,
  paymentNoticePdf,
  paymentRecord,
  paymentSourceRegistration,
  paymentText,
} from './payment-evidence.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

withPostgres(
  'Payment Evidence Source with genuine historical PRIMARY-only Client duplicates',
  () => {
    let fixture: PaymentEvidenceUnionFixture;
    beforeEach(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      fixture = await openPaymentEvidenceUnionFixture(databaseUrl);
    });
    afterEach(async () => {
      await fixture?.close();
    });

    it('normally upgrades the authentic0013 pair, conserves public receipts and refreshes Director v1 through the native v2 lifecycle', async () => {
      const { sourceClientId, targetClientId, membershipId, companyId } =
        fixture.ids;
      const beforeCompany = paymentRecord(fixture.beforeActor.activeCompany);
      const afterCompany = paymentRecord(fixture.afterActor.activeCompany);
      expect(beforeCompany.clientPermissionSetVersion).toBe('v1');
      expect(afterCompany).toMatchObject({
        id: companyId,
        clientPermissionSetVersion: 'v2',
        clientPermissionAssignmentId: fixture.refreshed.id,
        documentPermissionSetVersion: 'v3',
      });
      expect(afterCompany.clientPermissions).toContain(
        'client.duplicate.resolve',
      );
      expect(fixture.refreshed.id).not.toBe(fixture.revoked.id);
      expect(fixture.refreshed.workspaceMembershipId).toBe(membershipId);
      if (!Array.isArray(fixture.context.publicCalls))
        throw new Error('Expected authentic public receipts.');
      const calls: unknown[] = fixture.context.publicCalls;
      for (const clientId of [sourceClientId, targetClientId]) {
        const original = calls
          .map(paymentRecord)
          .find(
            (call) =>
              call.method === 'GET' && call.path === `/clients/${clientId}`,
          );
        if (!original)
          throw new Error('Missing authentic native dossier read.');
        const dossier = await fixture.call(`/clients/${clientId}`);
        expect(dossier.status).toBe(200);
        expect(await paymentJson(dossier)).toMatchObject(
          paymentRecord(original.response),
        );
        const entities = await fixture.call(
          `/clients/${clientId}/legal-entities`,
        );
        expect(entities.status).toBe(200);
        expect(await paymentJson(entities)).toEqual({
          clientVersion: 1,
          legalEntities: [],
        });
      }
      for (const key of ['legacy-primary-A-1045', 'legacy-primary-B-1045']) {
        const original = calls
          .map(paymentRecord)
          .find(
            (call) =>
              call.method === 'POST' &&
              call.path === '/clients' &&
              call.key === key,
          );
        if (!original)
          throw new Error('Missing authentic native registration receipt.');
        const replay = await fixture.call('/clients', {
          method: 'POST',
          key,
          body: original.body,
        });
        expect(replay.status).toBe(201);
        expect(await paymentJson(replay)).toEqual(original.response);
      }
      const beforeRestart = await fixture.call('/clients');
      expect(beforeRestart.status).toBe(200);
      const clients = await beforeRestart.json();
      await fixture.restart();
      const afterRestart = await fixture.call('/clients');
      expect(afterRestart.status).toBe(200);
      expect(await afterRestart.json()).toEqual(clients);
    });

    it('preserves original A, its frozen payer and exact PDF through a fresh current union to B without retargeting new source use', async () => {
      const { sourceClientId } = fixture.ids;
      const body = paymentSourceRegistration(sourceClientId);
      const key = 'legacy-source-before-native-union';
      const registered = await fixture.call('/documents', {
        method: 'POST',
        body,
        key,
      });
      expect(registered.status, await registered.clone().text()).toBe(201);
      const original = await paymentJson(registered);
      const documentId = paymentText(original.id);
      const versionId = paymentText(paymentRecord(original.version).id);
      const source = paymentRecord(original.paymentEvidenceSource);
      expect(source.payer).toEqual({
        kind: 'AVAILABLE',
        party: {
          kind: 'PRIMARY',
          legalName: 'Fictional Historical Payer A',
          taxId: 'PAYMENT-LEGACY-PRIMARY-1045',
          legalAddress: null,
        },
      });
      const pdf = await paymentNoticePdf('historical original A');
      const upload = await fixture.upload({
        documentId,
        versionId,
        revision: 1,
        bytes: pdf,
      });
      expect(upload.status).toBe(201);
      const representationId = paymentText(
        (await paymentJson(upload)).representationId,
      );
      expect(
        (
          await fixture.call(
            `/documents/${documentId}/versions/${versionId}/official-designation`,
            { method: 'POST', body: { expectedRevision: 2 } },
          )
        ).status,
      ).toBe(200);
      const versionsBefore = await paymentJson(
        await fixture.call(`/documents/${documentId}/versions`),
      );
      const uploadsBefore = await paymentJson(
        await fixture.call(
          `/documents/${documentId}/versions/${versionId}/content/history`,
        ),
      );
      const review = await fixture.review();
      expect(review.outcome).toBe('comparison');
      for (const privateFact of [
        documentId,
        versionId,
        representationId,
        body.sourceDescription,
      ])
        expect(JSON.stringify(review)).not.toContain(privateFact);
      const beforeBasis = await paymentUnionRejectionEffects(fixture.pool);
      expect(
        (
          await fixture.call(`/clients/${sourceClientId}/union-reviews`, {
            method: 'POST',
            body: { documentId },
          })
        ).status,
      ).toBe(400);
      expect(await paymentUnionRejectionEffects(fixture.pool)).toEqual(
        beforeBasis,
      );
      const united = await fixture.confirm(paymentText(review.reviewReference));
      expect(united.status, await united.clone().text()).toBe(201);
      const projectionReference = paymentText(
        (await paymentJson(united)).projectionReference,
      );
      expect(projectionReference).not.toBe(paymentText(review.reviewReference));
      const read = await fixture.call(`/documents/${documentId}`);
      expect(read.status).toBe(200);
      const frozenDetail = await paymentJson(read);
      expect(frozenDetail).toMatchObject({
        id: documentId,
        clientId: sourceClientId,
        correction: 'read-only',
        paymentEvidenceSource: source,
      });
      expect(frozenDetail).not.toHaveProperty('clientDossierId');
      expect(
        await paymentJson(
          await fixture.call(`/documents/${documentId}/versions`),
        ),
      ).toEqual({ ...versionsBefore, mutable: false });
      expect(
        await paymentJson(
          await fixture.call(
            `/documents/${documentId}/versions/${versionId}/content/history`,
          ),
        ),
      ).toEqual(uploadsBefore);
      const replay = await fixture.call('/documents', {
        method: 'POST',
        body,
        key,
      });
      expect(replay.status).toBe(201);
      expect(await paymentJson(replay)).toMatchObject({
        id: documentId,
        clientId: sourceClientId,
        paymentEvidenceSource: source,
      });
      const beforeRefusals = await paymentUnionRejectionEffects(fixture.pool);
      expect(
        (await fixture.call('/documents', { method: 'POST', body })).status,
      ).toBe(404);
      expect(
        (
          await fixture.upload({
            documentId,
            versionId,
            revision: 3,
            bytes: pdf,
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await fixture.call(`/documents/${documentId}`, {
            method: 'PATCH',
            body: {
              expectedRevision: 3,
              title: 'Must not retarget a historical Source',
            },
          })
        ).status,
      ).toBe(404);
      expect(
        (
          await fixture.call(`/documents/${documentId}/versions`, {
            method: 'POST',
            body: { expectedRevision: 3 },
          })
        ).status,
      ).toBe(404);
      expect(await paymentUnionRejectionEffects(fixture.pool)).toEqual(
        beforeRefusals,
      );
      await fixture.restart();
      const exact = await fixture.call(
        `/documents/${documentId}/versions/${versionId}/content/${representationId}`,
      );
      expect(exact.status).toBe(200);
      expect(Buffer.from(await exact.arrayBuffer())).toEqual(pdf);
      expect(
        paymentRecord(
          (await paymentJson(await fixture.call(`/documents/${documentId}`)))
            .paymentEvidenceSource,
        ),
      ).toEqual(source);
    });

    it.each([true, false])(
      'serializes Source registration and native union with Source first: %s',
      async (sourceFirst) => {
        const body = paymentSourceRegistration(fixture.ids.sourceClientId);
        const key = 'ordered-original-source-registration';
        const review = await fixture.review();
        const reviewReference = paymentText(review.reviewReference);
        const table = sourceFirst
          ? 'document_registration_events'
          : 'client_union_operations';
        const holder = await fixture.pool.connect();
        let first: Promise<Response> | undefined;
        let second: Promise<Response> | undefined;
        await fixture.pool.query(
          'CREATE FUNCTION pause_payment_source_union() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(10451045); RETURN NEW; END $$',
        );
        await fixture.pool.query(
          `CREATE TRIGGER pause_payment_source_union BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION pause_payment_source_union()`,
        );
        try {
          await holder.query('BEGIN');
          const pid = await backendPid(holder);
          await holder.query('SELECT pg_advisory_xact_lock(10451045)');
          const register = () =>
            fixture.call('/documents', { method: 'POST', body, key });
          first = sourceFirst ? register() : fixture.confirm(reviewReference);
          await waitForBlocked(fixture.pool, pid);
          second = sourceFirst ? fixture.confirm(reviewReference) : register();
          await waitForBlocked(fixture.pool, pid, 2);
          await holder.query('COMMIT');
          expect((await first).status).toBe(201);
          expect((await second).status).toBe(404);
          if (sourceFirst) {
            const document = await paymentJson(await first);
            const currentReview = await fixture.review();
            expect(
              (
                await fixture.confirm(
                  paymentText(currentReview.reviewReference),
                )
              ).status,
            ).toBe(201);
            const replay = await fixture.call('/documents', {
              method: 'POST',
              body,
              key,
            });
            expect(replay.status).toBe(201);
            expect(await paymentJson(replay)).toMatchObject({
              id: document.id,
              clientId: fixture.ids.sourceClientId,
              paymentEvidenceSource: document.paymentEvidenceSource,
            });
          } else {
            const beforeRefusal = await paymentUnionRejectionEffects(
              fixture.pool,
            );
            expect((await register()).status).toBe(404);
            expect(await paymentUnionRejectionEffects(fixture.pool)).toEqual(
              beforeRefusal,
            );
            const inventory = await fixture.call('/documents');
            expect(inventory.status).toBe(200);
            expect(await inventory.json()).toEqual([]);
          }
        } finally {
          await holder.query('ROLLBACK').catch(() => undefined);
          holder.release();
          await first?.catch(() => undefined);
          await second?.catch(() => undefined);
          await fixture.pool.query(
            `DROP TRIGGER pause_payment_source_union ON ${table}`,
          );
          await fixture.pool.query(
            'DROP FUNCTION pause_payment_source_union()',
          );
        }
      },
    );

    it('refuses a scanned upload after union wins while the scanner holds no database transaction', async () => {
      const body = paymentSourceRegistration(fixture.ids.sourceClientId);
      const registered = await fixture.call('/documents', {
        method: 'POST',
        body,
      });
      expect(registered.status).toBe(201);
      const document = await paymentJson(registered);
      const documentId = paymentText(document.id);
      const versionId = paymentText(paymentRecord(document.version).id);
      const review = await fixture.review();
      const pdf = await paymentNoticePdf('scan held across union');
      const barrier = fixture.scanner.holdNextScan();
      const pending = fixture.upload({
        documentId,
        versionId,
        revision: 1,
        bytes: pdf,
      });
      try {
        await Promise.race([
          barrier.reached,
          pending.then(() => {
            throw new Error('Upload missed the scanner barrier.');
          }),
        ]);
        const union = await fixture.confirm(
          paymentText(review.reviewReference),
        );
        expect(union.status, await union.clone().text()).toBe(201);
        const beforeRejection = await paymentUnionRejectionEffects(
          fixture.pool,
        );
        barrier.release();
        expect((await pending).status).toBe(404);
        expect(await paymentUnionRejectionEffects(fixture.pool)).toEqual(
          beforeRejection,
        );
        const versions = await fixture.call(
          `/documents/${documentId}/versions`,
        );
        expect(versions.status).toBe(200);
        expect(await paymentJson(versions)).toMatchObject({
          workingRevision: 1,
          mutable: false,
          versions: [
            { id: versionId, status: 'draft', pdfContent: { state: 'absent' } },
          ],
        });
        const detail = await fixture.call(`/documents/${documentId}`);
        expect(detail.status).toBe(200);
        expect(await paymentJson(detail)).toMatchObject({
          clientId: fixture.ids.sourceClientId,
          paymentEvidenceSource: document.paymentEvidenceSource,
        });
        expect(fixture.scanner.scanCount).toBe(1);
      } finally {
        barrier.release();
        await pending.catch(() => undefined);
      }
    });
  },
);
