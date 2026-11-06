import {
  backendPid,
  waitForBlocked,
} from '../offer/offer-concurrency.test-support.js';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPaymentEvidenceFixture,
  paymentRecord,
  paymentSourceRegistration,
  paymentNoticePdf,
  paymentText,
  type PaymentEvidenceFixture,
} from '../documents/payment-evidence.test-support.js';
import {
  authorSourceCreateBody,
  authorSourceItems,
  authorSourceJson,
  authorSourceReceipt,
  prepareAuthorSource,
} from './payment-observation-author-source.test-support.js';
import {
  paymentHistoryRevision,
  paymentReceipt,
  paymentSnapshot,
} from './payment.representation.js';
const url = process.env.TEST_DATABASE_URL;
(url ? describe : describe.skip)(
  'Payment native integrity boundary and closed stored representations',
  () => {
    let fixture: PaymentEvidenceFixture,
      body: ReturnType<typeof authorSourceCreateBody>,
      id: string;
    beforeAll(async () => {
      if (!url) throw new Error('Native PostgreSQL is required.');
      fixture = await createPaymentEvidenceFixture(url);
    });
    beforeEach(async () => {
      await fixture.reset();
      body = authorSourceCreateBody(
        (await prepareAuthorSource(fixture)).source,
      );
      id = (
        await authorSourceReceipt(
          await fixture.call('/payments', { method: 'POST', body }),
          { action: 'CREATE', revision: 1 },
        )
      ).paymentId;
    });
    afterAll(async () => {
      await fixture?.close();
    });
    async function snapshot() {
      return (
        await fixture.pool.query<{ facts: unknown }>(
          `SELECT jsonb_build_object('root',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM payments p),'commands',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM payment_commands c),'history',(SELECT jsonb_agg(to_jsonb(h) ORDER BY command_id) FROM payment_history h),'events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY command_id) FROM payment_events e),'clients',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM client_accounts c),'activity',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM activity_log_events a)) facts`,
        )
      ).rows;
    }
    async function nativeCommand() {
      const row = (
        await fixture.pool.query<{ command: unknown }>(
          'SELECT to_jsonb(c) command FROM payment_commands c WHERE payment_id=$1',
          [id],
        )
      ).rows[0];
      if (!row) throw new Error('An actual native command is required.');
      const command = paymentRecord(row.command),
        paymentId = randomUUID();
      return {
        ...command,
        id: randomUUID(),
        payment_id: paymentId,
        idempotency_key: randomUUID(),
        intent: { ...paymentRecord(command.intent), paymentId },
      };
    }
    it('rejects a prepared receipt envelope and a spoofed native author without reserving a key or changing any effect', async () => {
      const before = await snapshot();
      for (const prepared of [true, false]) {
        const candidate = await nativeCommand(),
          command = prepared
            ? candidate
            : {
                ...candidate,
                revision: 0,
                response: {},
                actor_display_name: 'Forged native human',
              };
        const transaction = await fixture.pool.connect();
        try {
          await transaction.query('BEGIN');
          await expect(
            transaction.query(
              'INSERT INTO payment_commands SELECT (jsonb_populate_record(NULL::payment_commands,$1::jsonb)).*',
              [JSON.stringify(command)],
            ),
          ).rejects.toMatchObject({
            code: '23514',
            constraint: prepared
              ? 'payment_native_intent'
              : 'payment_native_authority',
          });
        } finally {
          await transaction.query('ROLLBACK');
          transaction.release();
        }
      }
      expect(await snapshot()).toEqual(before);
    });
    it.each(['history', 'event', 'lineage'])(
      'rejects a closed %s forgery at the native deferred commit after all command/head/history/event rows exist',
      async (seam) => {
        const before = await snapshot(),
          candidate = await nativeCommand(),
          command = { ...candidate, revision: 0, response: {} };
        const target =
          seam === 'history'
            ? 'payment_history'
            : seam === 'event'
              ? 'payment_events'
              : 'payments';
        const tamper =
          seam === 'history'
            ? `NEW.fact=jsonb_set(NEW.fact,'{actor,displayName}','"Forged public actor"');`
            : seam === 'event'
              ? `NEW.action='payment.confirmed';`
              : `NEW.replaces_closed_payment_id='${id}'::uuid;`;
        await fixture.pool.query(
          `CREATE FUNCTION payment_proof_closed_forgery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${tamper} RETURN NEW; END $$; CREATE TRIGGER zz_payment_proof_closed_forgery BEFORE INSERT ON ${target} FOR EACH ROW EXECUTE FUNCTION payment_proof_closed_forgery()`,
        );
        const transaction = await fixture.pool.connect();
        try {
          await transaction.query('BEGIN');
          await transaction.query(
            'INSERT INTO payment_commands SELECT (jsonb_populate_record(NULL::payment_commands,$1::jsonb)).*',
            [JSON.stringify(command)],
          );
          await transaction.query(
            `INSERT INTO payment_events(workspace_id,company_id,payment_id,revision,command_id,actor_membership_id,actor_internal_user_id,occurred_at,action,metadata) SELECT workspace_id,company_id,payment_id,revision,id,actor_membership_id,actor_internal_user_id,created_at,'payment.observation.recorded',jsonb_build_object('revision',revision) FROM payment_commands WHERE id=$1`,
            [command.id],
          );
          expect(
            (
              await transaction.query<{
                commands: number;
                roots: number;
                history: number;
                events: number;
              }>(
                `SELECT (SELECT count(*)::int FROM payment_commands WHERE id=$1) commands,(SELECT count(*)::int FROM payments WHERE id=$2) roots,(SELECT count(*)::int FROM payment_history WHERE command_id=$1) history,(SELECT count(*)::int FROM payment_events WHERE command_id=$1) events`,
                [command.id, command.payment_id],
              )
            ).rows,
          ).toEqual([{ commands: 1, roots: 1, history: 1, events: 1 }]);
          await expect(transaction.query('COMMIT')).rejects.toMatchObject({
            code: '23514',
            constraint: 'payment_native_coupling',
          });
        } finally {
          await transaction.query('ROLLBACK');
          transaction.release();
          await fixture.pool.query(
            `DROP TRIGGER zz_payment_proof_closed_forgery ON ${target}; DROP FUNCTION payment_proof_closed_forgery()`,
          );
        }
        expect(await snapshot()).toEqual(before);
      },
    );
    describe('independent Company context keeps copied and source-free owners', () => {
      beforeEach(async () => {
        await authorSourceJson(
          await fixture.grant(
            '/company-payment-recorder-assignments',
            fixture.ready.membershipIds.ordinary,
          ),
          201,
        );
      });
      it.each([
        '/company-director-client-assignments',
        '/company-payment-evidence-access-assignments',
        '/company-document-registrar-assignments',
        '/company-document-content-reader-assignments',
      ])(
        'preserves the exact Payment capture through %s loss and replacement under its independent Company context',
        async (path) => {
          for (const identity of [
            'reader',
            'ordinary',
            'confirmer',
            'reverser',
          ] as const) {
            const beforeActor = await authorSourceJson(
                await fixture.call('/access/current-actor', { identity }),
              ),
              beforeCompany = paymentRecord(beforeActor.activeCompany),
              before = await authorSourceJson(
                await fixture.call(`/payments/${id}`, { identity }),
              );
            expect(typeof beforeCompany.paymentObservationReadCapture).toBe(
              'string',
            );
            await authorSourceJson(
              await fixture.revoke(path, fixture.ready.membershipIds[identity]),
            );
            const afterActor = await authorSourceJson(
                await fixture.call('/access/current-actor', { identity }),
              ),
              after = await authorSourceJson(
                await fixture.call(`/payments/${id}`, { identity }),
              );
            expect(
              paymentRecord(afterActor.activeCompany)
                .paymentObservationReadCapture,
            ).toBe(beforeCompany.paymentObservationReadCapture);
            expect(
              paymentRecord(afterActor.activeCompany)
                .paymentObservationContextCapture,
            ).toBe(beforeCompany.paymentObservationContextCapture);
            expect(after.readCapture).toBe(before.readCapture);
            expect(after.payment).toEqual(before.payment);
            expect(after.history).toEqual(before.history);
            await authorSourceJson(
              await fixture.grant(path, fixture.ready.membershipIds[identity]),
              201,
            );
            const restored = await authorSourceJson(
              await fixture.call('/access/current-actor', { identity }),
            );
            expect(
              paymentRecord(restored.activeCompany)
                .paymentObservationReadCapture,
            ).toBe(beforeCompany.paymentObservationReadCapture);
          }
        },
      );
    });
    it('publishes a different consumed Company context when the selected admission is revoked and replaced, retaining every copied fact', async () => {
      for (const identity of ['reader', 'confirmer', 'reverser'] as const) {
        const member = fixture.ready.membershipIds[identity];
        const actor = await authorSourceJson(
          await fixture.call('/access/current-actor', { identity }),
        );
        const original = paymentRecord(
          actor.activeCompany,
        ).paymentObservationContextCapture;
        const before = await authorSourceJson(
          await fixture.call(`/payments/${id}`, { identity }),
        );
        expect(original).toMatch(
          /^payment-observation-context\.v1\.[a-f0-9]{64}$/u,
        );
        expect(
          (await fixture.revoke('/company-context-assignments', member)).status,
        ).toBe(200);
        const changed = await authorSourceJson(
          await fixture.call('/access/current-actor', { identity }),
        );
        const fallback = paymentRecord(
          changed.activeCompany,
        ).paymentObservationContextCapture;
        expect(fallback).toMatch(
          /^payment-observation-context\.v1\.[a-f0-9]{64}$/u,
        );
        expect(fallback).not.toBe(original);
        const after = await authorSourceJson(
          await fixture.call(`/payments/${id}`, { identity }),
        );
        expect(after.payment).toEqual(before.payment);
        expect(after.history).toEqual(before.history);
        await authorSourceJson(
          await fixture.grant('/company-context-assignments', member),
          201,
        );
        const restored = await authorSourceJson(
          await fixture.call('/access/current-actor', { identity }),
        );
        const replacement = paymentRecord(
          restored.activeCompany,
        ).paymentObservationContextCapture;
        expect(replacement).not.toBe(original);
        expect(replacement).not.toBe(fallback);
      }
    });
    describe.each([
      { action: 'CORRECT_DRAFT', identity: 'ordinary' },
      { action: 'CONFIRM', identity: 'confirmer' },
    ] as const)(
      'independent action $action does not consume an additional Reader',
      ({ action, identity }) => {
        let before: Record<string, unknown>;
        beforeEach(async () => {
          const member = fixture.ready.membershipIds[identity];
          if (identity === 'ordinary')
            await authorSourceJson(
              await fixture.grant(
                '/company-payment-recorder-assignments',
                member,
              ),
              201,
            );
          await authorSourceJson(
            await fixture.grant('/company-payment-reader-assignments', member),
            201,
          );
          before = await authorSourceJson(
            await fixture.call('/access/current-actor', { identity }),
          );
          await fixture.pool.query(
            'CREATE FUNCTION payment_reader_replacement_barrier() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(10471049); RETURN NEW; END $$',
          );
          await fixture.pool.query(
            'CREATE TRIGGER payment_reader_replacement_barrier BEFORE INSERT ON payment_events FOR EACH ROW EXECUTE FUNCTION payment_reader_replacement_barrier()',
          );
        });
        it('allows Reader replacement while its own exact native authority owns the final event', async () => {
          const member = fixture.ready.membershipIds[identity];
          const barrier = await fixture.pool.connect();
          let write: Promise<Response> | undefined;
          try {
            await barrier.query('BEGIN');
            const pid = await backendPid(barrier);
            await barrier.query('SELECT pg_advisory_xact_lock(10471049)');
            const key = randomUUID();
            const command =
              action === 'CONFIRM'
                ? {
                    action,
                    expectedRevision: 1,
                    acknowledgeReviewedObservation: true,
                    confirmationNote: 'Independent role remains current',
                  }
                : {
                    action,
                    expectedRevision: 1,
                    values: { ...body.values, amountMinor: '125551' },
                    reason: 'Independent Recorder remains current',
                  };
            write = fixture.call(`/payments/${id}/commands`, {
              method: 'POST',
              identity,
              key,
              body: command,
            });
            await waitForBlocked(fixture.pool, pid);
            // Reader is unrelated to this command: revoke and replace it BEFORE
            // releasing the final event. Selecting Reader would block here.
            expect(
              (
                await fixture.revoke(
                  '/company-payment-reader-assignments',
                  member,
                )
              ).status,
            ).toBe(200);
            await authorSourceJson(
              await fixture.grant(
                '/company-payment-reader-assignments',
                member,
              ),
              201,
            );
            await barrier.query('COMMIT');
            const receipt = await authorSourceReceipt(await write, {
              action,
              revision: 2,
            });
            const after = await authorSourceJson(
              await fixture.call('/access/current-actor', { identity }),
            );
            const oldCompany = paymentRecord(before.activeCompany),
              newCompany = paymentRecord(after.activeCompany);
            expect(newCompany.paymentObservationReadCapture).not.toBe(
              oldCompany.paymentObservationReadCapture,
            );
            expect(newCompany.paymentObservationContextCapture).toBe(
              oldCompany.paymentObservationContextCapture,
            );
            expect(newCompany.paymentEvidenceContextCapture).toBe(
              oldCompany.paymentEvidenceContextCapture,
            );
            expect(newCompany.paymentEvidenceReferenceReadCapture).toBe(
              oldCompany.paymentEvidenceReferenceReadCapture,
            );
            expect(
              (
                await authorSourceReceipt(
                  await fixture.call(`/payments/${id}/commands`, {
                    method: 'POST',
                    identity,
                    key,
                    body: command,
                  }),
                  { action, revision: 2 },
                )
              ).body,
            ).toEqual(receipt.body);
            const current = await authorSourceJson(
              await fixture.call(`/payments/${id}`, { identity }),
            );
            expect(current.readCapture).toBe(
              newCompany.paymentObservationReadCapture,
            );
            expect(paymentRecord(current.payment).revision).toBe(2);
          } finally {
            await barrier.query('ROLLBACK');
            barrier.release();
            await Promise.allSettled(write ? [write] : []);
            await fixture.pool.query(
              'DROP TRIGGER payment_reader_replacement_barrier ON payment_events; DROP FUNCTION payment_reader_replacement_barrier()',
            );
          }
        });
      },
    );
    describe('one actor Workspace key across receiving Companies', () => {
      let company: string,
        foreignBody: ReturnType<typeof authorSourceCreateBody>;
      beforeEach(async () => {
        company = paymentText(
          (
            await authorSourceJson(
              await fixture.call('/companies', {
                method: 'POST',
                company: null,
                body: {
                  displayName: 'Fictional second Payment receiving Company',
                },
              }),
              201,
            )
          ).id,
        );
        for (const path of [
          '/company-context-assignments',
          '/company-director-client-assignments',
          '/company-document-registrar-assignments',
          '/company-document-approver-assignments',
          '/company-document-content-reader-assignments',
          '/company-document-content-uploader-assignments',
          '/company-payment-recorder-assignments',
          '/company-payment-evidence-access-assignments',
        ])
          await authorSourceJson(
            await fixture.call(path, {
              method: 'POST',
              company: null,
              body: {
                companyId: company,
                workspaceMembershipId: fixture.ready.membershipIds.owner,
              },
            }),
            201,
          );
        const client = await authorSourceJson(
          await fixture.call('/clients', {
            method: 'POST',
            company,
            body: {
              displayName: 'Fictional second conserved payer',
              taxId: null,
              address: null,
            },
          }),
          201,
        );
        const document = await authorSourceJson(
            await fixture.call('/documents', {
              method: 'POST',
              company,
              body: paymentSourceRegistration(paymentText(client.id)),
            }),
            201,
          ),
          documentId = paymentText(document.id),
          documentVersionId = paymentText(paymentRecord(document.version).id);
        const uploaded = await authorSourceJson(
          await fixture.upload({
            company,
            documentId,
            versionId: documentVersionId,
            revision: 1,
            bytes: await paymentNoticePdf('Second receiving Company'),
          }),
          201,
        );
        await authorSourceJson(
          await fixture.call(
            `/documents/${documentId}/versions/${documentVersionId}/official-designation`,
            { method: 'POST', company, body: { expectedRevision: 2 } },
          ),
        );
        foreignBody = authorSourceCreateBody({
          documentId,
          documentVersionId,
          representationId: paymentText(uploaded.representationId),
        });
      });
      it('conflicts under the same Workspace key despite complete native authority and eligible Source in both Companies, while each exact replay stays effect-free', async () => {
        const key = randomUUID(),
          foreignKey = randomUUID(),
          first = await authorSourceReceipt(
            await fixture.call('/payments', { method: 'POST', key, body }),
            { action: 'CREATE', revision: 1 },
          );
        const foreign = await authorSourceReceipt(
          await fixture.call('/payments', {
            method: 'POST',
            key: foreignKey,
            company,
            body: foreignBody,
          }),
          { action: 'CREATE', revision: 1 },
        );
        expect(foreign.paymentId).not.toBe(first.paymentId);
        const before = await snapshot();
        expect(
          (
            await fixture.call('/payments', {
              method: 'POST',
              key,
              company,
              body: foreignBody,
            })
          ).status,
        ).toBe(409);
        expect(
          await authorSourceJson(
            await fixture.call('/payments', { method: 'POST', key, body }),
            201,
          ),
        ).toEqual(first.body);
        expect(
          await authorSourceJson(
            await fixture.call('/payments', {
              method: 'POST',
              key: foreignKey,
              company,
              body: foreignBody,
            }),
            201,
          ),
        ).toEqual(foreign.body);
        expect(await snapshot()).toEqual(before);
      });
    });
    it('reconstructs a coupled forged confirmation against the immutable human intent at commit and rolls back every effect', async () => {
      const before = await snapshot(),
        key = randomUUID(),
        review = {
          action: 'CONFIRM',
          expectedRevision: 1,
          acknowledgeReviewedObservation: true,
          confirmationNote: 'Actual independent review',
        };
      await fixture.pool.query(
        `CREATE SEQUENCE payment_proof_forgery_visits; CREATE FUNCTION payment_proof_forgery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM nextval('payment_proof_forgery_visits'); IF TG_TABLE_NAME='payments' THEN NEW.confirmation=jsonb_set(NEW.confirmation,'{note}','"Coupled forged review"'); ELSE NEW.fact=jsonb_set(NEW.fact,'{after,confirmation,note}','"Coupled forged review"'); END IF; RETURN NEW; END $$; CREATE TRIGGER zz_payment_proof_forgery BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION payment_proof_forgery(); CREATE TRIGGER zz_payment_proof_forgery BEFORE INSERT ON payment_history FOR EACH ROW EXECUTE FUNCTION payment_proof_forgery();`,
      );
      try {
        expect(
          (
            await fixture.call(`/payments/${id}/commands`, {
              method: 'POST',
              identity: 'confirmer',
              key,
              body: review,
            })
          ).status,
        ).toBe(503);
        expect(
          (
            await fixture.pool.query(
              'SELECT last_value::int,is_called FROM payment_proof_forgery_visits',
            )
          ).rows,
        ).toEqual([{ last_value: 2, is_called: true }]);
        expect(await snapshot()).toEqual(before);
      } finally {
        await fixture.pool.query(
          'DROP TRIGGER zz_payment_proof_forgery ON payments; DROP TRIGGER zz_payment_proof_forgery ON payment_history; DROP FUNCTION payment_proof_forgery(); DROP SEQUENCE payment_proof_forgery_visits',
        );
      }
      await authorSourceReceipt(
        await fixture.call(`/payments/${id}/commands`, {
          method: 'POST',
          identity: 'confirmer',
          key,
          body: review,
        }),
        { action: 'CONFIRM', revision: 2 },
      );
    });
    it('rejects a closed but forged conserved payer against the exact native Source and preserves the unreserved CREATE key', async () => {
      const before = await snapshot(),
        key = randomUUID();
      await fixture.pool.query(
        `CREATE FUNCTION payment_proof_source_forgery() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.source_snapshot=jsonb_set(NEW.source_snapshot,'{copiedContext,payer,legalName}','"Forged frozen Source payer"'); RETURN NEW; END $$; CREATE TRIGGER zz_payment_proof_source_forgery BEFORE INSERT ON payments FOR EACH ROW EXECUTE FUNCTION payment_proof_source_forgery();`,
      );
      try {
        expect(
          (await fixture.call('/payments', { method: 'POST', key, body }))
            .status,
        ).toBe(503);
        expect(await snapshot()).toEqual(before);
      } finally {
        await fixture.pool.query(
          'DROP TRIGGER zz_payment_proof_source_forgery ON payments; DROP FUNCTION payment_proof_source_forgery()',
        );
      }
      await authorSourceReceipt(
        await fixture.call('/payments', { method: 'POST', key, body }),
        { action: 'CREATE', revision: 1 },
      );
    });
    it('refuses an exhausted expected revision without effects and fails closed on corrupt or unknown stored formats', async () => {
      const before = await snapshot();
      expect(
        (
          await fixture.call(`/payments/${id}/commands`, {
            method: 'POST',
            body: {
              action: 'WITHDRAW_DRAFT',
              expectedRevision: 2147483647,
              reason: 'Explicit exhausted revision',
            },
          })
        ).status,
      ).toBe(409);
      expect(await snapshot()).toEqual(before);
      const current = await authorSourceJson(
          await fixture.call(`/payments/${id}`),
        ),
        fact = authorSourceItems(paymentRecord(current.history).items)[0];
      if (!fact) throw new Error('Native history is required.');
      expect(() =>
        paymentHistoryRevision({ ...fact, format: 'PAYMENT_REVISION/2' }),
      ).toThrow();
      expect(() => paymentHistoryRevision({ ...fact, before: {} })).toThrow();
      const stored = (
        await fixture.pool.query<{
          response: unknown;
          source_snapshot: unknown;
        }>(
          'SELECT c.response,p.source_snapshot FROM payment_commands c JOIN payments p ON p.id=c.payment_id WHERE p.id=$1',
          [id],
        )
      ).rows[0];
      if (!stored)
        throw new Error('A native stored representation is required.');
      expect(() =>
        paymentReceipt({
          ...paymentRecord(stored.response),
          extra: 'forbidden',
        }),
      ).toThrow();
      expect(() =>
        paymentSnapshot({
          ...paymentRecord(stored.source_snapshot),
          format: 'unknown',
        }),
      ).toThrow();
    });
  },
);
