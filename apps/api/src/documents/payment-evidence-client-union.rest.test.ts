import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  backendPid,
  waitForBlocked,
} from '../offer/offer-concurrency.test-support.js';
import {
  openPaymentEvidenceUnionFixture,
  PAYMENT_UNION_TAX_ID,
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
import {
  authorSourceCreateBody,
  authorSourceReceipt,
} from '../payment/payment-observation-author-source.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

withPostgres(
  'Payment Evidence Source across a union of PRIMARY-only Client duplicates',
  () => {
    let fixture: PaymentEvidenceUnionFixture;
    beforeEach(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      fixture = await openPaymentEvidenceUnionFixture(databaseUrl);
    });
    afterEach(async () => {
      await fixture?.close();
    });

    it('refreshes a captured Director v1 to v2 through revoke and regrant, adding duplicate resolution', async () => {
      const { membershipId, companyId } = fixture.ids;
      const beforeCompany = paymentRecord(fixture.beforeActor.activeCompany);
      const afterCompany = paymentRecord(fixture.afterActor.activeCompany);
      expect(beforeCompany.clientPermissionSetVersion).toBe('v1');
      expect(beforeCompany.clientPermissions).not.toContain(
        'client.duplicate.resolve',
      );
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
    });

    it('keeps a DRAFT Payment readable and withdrawable for its Recorder after the original Client is superseded by a union', async () => {
      const { sourceClientId } = fixture.ids;
      const registered = await fixture.call('/documents', {
        method: 'POST',
        body: paymentSourceRegistration(sourceClientId),
        key: 'draft-source-before-union',
      });
      expect(registered.status, await registered.clone().text()).toBe(201);
      const document = await paymentJson(registered);
      const documentId = paymentText(document.id);
      const documentVersionId = paymentText(paymentRecord(document.version).id);
      const upload = await fixture.upload({
        documentId,
        versionId: documentVersionId,
        revision: 1,
        bytes: await paymentNoticePdf('draft source before union'),
      });
      expect(upload.status).toBe(201);
      const representationId = paymentText(
        (await paymentJson(upload)).representationId,
      );
      expect(
        (
          await fixture.call(
            `/documents/${documentId}/versions/${documentVersionId}/official-designation`,
            { method: 'POST', body: { expectedRevision: 2 } },
          )
        ).status,
      ).toBe(200);
      const { paymentId } = await authorSourceReceipt(
        await fixture.call('/payments', {
          method: 'POST',
          body: authorSourceCreateBody({
            documentId,
            documentVersionId,
            representationId,
          }),
        }),
        { action: 'CREATE', revision: 1 },
      );
      const before = await fixture.call(`/payments/${paymentId}`);
      expect(before.status).toBe(200);
      const facts = paymentRecord(await paymentJson(before)).payment;

      const review = await fixture.review();
      const united = await fixture.confirm(paymentText(review.reviewReference));
      expect(united.status, await united.clone().text()).toBe(201);

      const after = await fixture.call(`/payments/${paymentId}`);
      expect(after.status, await after.clone().text()).toBe(200);
      const detail = paymentRecord(await paymentJson(after));
      expect(detail.payment).toEqual(facts);
      expect(detail.capabilities).toMatchObject({
        canWithdraw: true,
        canCorrect: false,
        canConfirm: false,
      });
      await authorSourceReceipt(
        await fixture.call(`/payments/${paymentId}/commands`, {
          method: 'POST',
          body: {
            action: 'WITHDRAW_DRAFT',
            expectedRevision: 1,
            reason: 'Mistaken declaration after the Client union',
          },
        }),
        { action: 'WITHDRAW_DRAFT', revision: 2 },
      );
    });

    it('preserves original A, its frozen payer and exact PDF through a fresh current union to B without retargeting new source use', async () => {
      const { sourceClientId } = fixture.ids;
      const body = paymentSourceRegistration(sourceClientId);
      const key = 'source-before-union';
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
          legalName: 'Fictional Payer A',
          taxId: PAYMENT_UNION_TAX_ID,
          legalAddress: null,
        },
      });
      const pdf = await paymentNoticePdf('original A');
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
