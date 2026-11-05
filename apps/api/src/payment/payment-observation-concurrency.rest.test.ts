import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  backendPid,
  waitForBlocked,
} from '../offer/offer-concurrency.test-support.js';
import {
  createPaymentEvidenceFixture,
  paymentRecord,
  type PaymentEvidenceFixture,
  type PaymentEvidenceIdentity,
} from '../documents/payment-evidence.test-support.js';
import {
  authorSourceCreateBody,
  authorSourceJson,
  authorSourceReceipt,
  authorSourceRevision,
  prepareAuthorSource,
} from './payment-observation-author-source.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL,
  withPostgres = databaseUrl ? describe : describe.skip;
const authorities = [
  {
    action: 'CREATE',
    identity: 'reader',
    bundle: 'company_payment_recorder',
    path: '/company-payment-recorder-assignments',
  },
  {
    action: 'CONFIRM',
    identity: 'confirmer',
    bundle: 'company_payment_confirmer',
    path: '/company-payment-confirmer-assignments',
  },
  {
    action: 'REVERSE',
    identity: 'reverser',
    bundle: 'company_payment_reverser',
    path: '/company-payment-reverser-assignments',
  },
  {
    action: 'CREATE',
    identity: 'reader',
    bundle: 'company_director_client_access',
    path: '/company-director-client-assignments',
  },
  {
    action: 'CREATE',
    identity: 'reader',
    bundle: 'company_payment_evidence_access',
    path: '/company-payment-evidence-access-assignments',
  },
  {
    action: 'CREATE',
    identity: 'reader',
    bundle: 'company_document_registrar',
    path: '/company-document-registrar-assignments',
  },
  {
    action: 'CREATE',
    identity: 'reader',
    bundle: 'company_document_content_reader',
    path: '/company-document-content-reader-assignments',
  },
] satisfies {
  action: 'CREATE' | 'CONFIRM' | 'REVERSE';
  identity: PaymentEvidenceIdentity;
  bundle: string;
  path: string;
}[];
withPostgres('Payment exact authority revocation lock ordering', () => {
  let fixture: PaymentEvidenceFixture;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('Native PostgreSQL is required.');
    fixture = await createPaymentEvidenceFixture(databaseUrl);
  });
  afterAll(async () => {
    await fixture?.close();
  });
  describe.each(authorities)('$action / $bundle', (authority) => {
    let command: () => Promise<Response>;
    beforeEach(async () => {
      await fixture.reset();
      await authorSourceJson(
        await fixture.grant(
          '/company-payment-recorder-assignments',
          fixture.ready.membershipIds.reader,
        ),
        201,
      );
      const source = (await prepareAuthorSource(fixture)).source,
        key = randomUUID();
      if (authority.action === 'CREATE')
        command = () =>
          fixture.call('/payments', {
            method: 'POST',
            identity: authority.identity,
            key,
            body: authorSourceCreateBody(source),
          });
      else {
        const root = await authorSourceReceipt(
          await fixture.call('/payments', {
            method: 'POST',
            body: authorSourceCreateBody(source),
          }),
          { action: 'CREATE', revision: 1 },
        );
        if (authority.action === 'REVERSE')
          await authorSourceReceipt(
            await fixture.call(`/payments/${root.paymentId}/commands`, {
              method: 'POST',
              identity: 'confirmer',
              body: {
                action: 'CONFIRM',
                expectedRevision: 1,
                acknowledgeReviewedObservation: true,
                confirmationNote: 'Independent original confirmation',
              },
            }),
            { action: 'CONFIRM', revision: 2 },
          );
        const body =
          authority.action === 'CONFIRM'
            ? {
                action: 'CONFIRM',
                expectedRevision: 1,
                acknowledgeReviewedObservation: true,
                confirmationNote:
                  'Literal review under exact captured authority',
              }
            : {
                action: 'REVERSE',
                expectedRevision: 2,
                reason: 'Source-free independent reversal',
              };
        command = () =>
          fixture.call(`/payments/${root.paymentId}/commands`, {
            method: 'POST',
            identity: authority.identity,
            key,
            body,
          });
      }
    });
    async function effects() {
      return (
        await fixture.pool.query<{ snapshot: unknown }>(
          `SELECT jsonb_build_object('heads',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM payments p),'commands',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM payment_commands c),'history',(SELECT jsonb_agg(to_jsonb(h) ORDER BY h.payment_id,h.revision) FROM payment_history h),'events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.command_id) FROM payment_events e),'fences',(SELECT jsonb_agg(jsonb_build_array(id,version) ORDER BY id) FROM client_accounts)) snapshot`,
        )
      ).rows;
    }
    it('refuses without effects when the authority revocation obtains its lock first', async () => {
      const member = fixture.ready.membershipIds[authority.identity],
        before = await effects(),
        barrier = await fixture.pool.connect();
      let loss: Promise<Response> | undefined,
        write: Promise<Response> | undefined;
      try {
        await barrier.query('BEGIN');
        const pid = await backendPid(barrier);
        const row = await barrier.query(
          'SELECT id FROM company_role_assignments WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle::text=$3 AND revoked_at IS NULL FOR UPDATE',
          [fixture.ready.companyId, member, authority.bundle],
        );
        expect(row.rowCount).toBe(1);
        loss = fixture.revoke(authority.path, member);
        await waitForBlocked(fixture.pool, pid);
        write = command();
        await waitForBlocked(fixture.pool, pid, 2);
        await barrier.query('COMMIT');
        expect((await loss).status).toBe(200);
        expect((await write).status).toBe(403);
        expect(await effects()).toEqual(before);
      } finally {
        await barrier.query('ROLLBACK');
        barrier.release();
        await Promise.allSettled(
          [loss, write].filter((value) => value !== undefined),
        );
      }
    });
    it('commits the exact complete outcome when the command owns authority first, then refuses even its conserved replay after revocation', async () => {
      const member = fixture.ready.membershipIds[authority.identity],
        barrier = await fixture.pool.connect();
      let loss: Promise<Response> | undefined,
        write: Promise<Response> | undefined;
      try {
        await fixture.pool.query(
          'CREATE FUNCTION payment_proof_command_barrier() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(10471047); RETURN NEW; END $$',
        );
        await fixture.pool.query(
          'CREATE TRIGGER payment_proof_command_barrier BEFORE INSERT ON payment_events FOR EACH ROW EXECUTE FUNCTION payment_proof_command_barrier()',
        );
        await barrier.query('BEGIN');
        const pid = await backendPid(barrier);
        await barrier.query('SELECT pg_advisory_xact_lock(10471047)');
        write = command();
        await waitForBlocked(fixture.pool, pid);
        loss = fixture.revoke(authority.path, member);
        await waitForBlocked(fixture.pool, pid, 2);
        await barrier.query('COMMIT');
        const receipt = await authorSourceReceipt(await write, {
          action: authority.action,
          revision:
            authority.action === 'CREATE'
              ? 1
              : authority.action === 'CONFIRM'
                ? 2
                : 3,
        });
        expect((await loss).status).toBe(200);
        const current = await authorSourceJson(
          await fixture.call(`/payments/${receipt.paymentId}`),
        );
        expect(paymentRecord(current.payment)).toMatchObject({
          revision: receipt.body.revision,
          state:
            authority.action === 'CREATE'
              ? 'DRAFT'
              : authority.action === 'CONFIRM'
                ? 'CONFIRMED'
                : 'REVERSED',
        });
        expect(paymentRecord(current.history).items).toHaveLength(
          authorSourceRevision(receipt.body.revision),
        );
        const beforeReplay = await effects();
        expect((await command()).status).toBe(403);
        expect(await effects()).toEqual(beforeReplay);
      } finally {
        await barrier.query('ROLLBACK');
        barrier.release();
        await Promise.allSettled(
          [loss, write].filter((value) => value !== undefined),
        );
        await fixture.pool.query(
          'DROP TRIGGER IF EXISTS payment_proof_command_barrier ON payment_events',
        );
        await fixture.pool.query(
          'DROP FUNCTION IF EXISTS payment_proof_command_barrier()',
        );
      }
    });
  });
  describe.each(['SOURCE', 'PAYMENT'] as const)(
    'Client and Source Document lock order with %s first',
    (first) => {
      let prepared: Awaited<ReturnType<typeof prepareAuthorSource>>;
      let paymentId: string;
      let clientVersion: number;
      const review = {
        action: 'CONFIRM',
        expectedRevision: 1,
        acknowledgeReviewedObservation: true,
        confirmationNote: 'Independent review while Source starts a successor',
      };
      beforeEach(async () => {
        await fixture.reset();
        prepared = await prepareAuthorSource(fixture);
        paymentId = (
          await authorSourceReceipt(
            await fixture.call('/payments', {
              method: 'POST',
              body: authorSourceCreateBody(prepared.source),
            }),
            { action: 'CREATE', revision: 1 },
          )
        ).paymentId;
        const row = (
          await fixture.pool.query<{ version: number }>(
            'SELECT version FROM client_accounts WHERE id=$1',
            [fixture.ready.clientId],
          )
        ).rows[0];
        if (!row) throw new Error('The actual original Client is required.');
        clientVersion = row.version;
      });
      it('commits both native operations without a Client/Document cycle, preserving the exact original Source and receipt', async () => {
        const barrier = await fixture.pool.connect();
        const key = randomUUID();
        const source = () =>
          fixture.call(`/documents/${prepared.source.documentId}/versions`, {
            method: 'POST',
            body: { expectedRevision: prepared.workingRevision },
          });
        const payment = () =>
          fixture.call(`/payments/${paymentId}/commands`, {
            method: 'POST',
            identity: 'confirmer',
            key,
            body: review,
          });
        let sourceWrite: Promise<Response> | undefined,
          paymentWrite: Promise<Response> | undefined;
        try {
          await barrier.query('BEGIN');
          const pid = await backendPid(barrier);
          expect(
            (
              await barrier.query(
                'SELECT id FROM client_accounts WHERE id=$1 FOR UPDATE',
                [fixture.ready.clientId],
              )
            ).rowCount,
          ).toBe(1);
          if (first === 'SOURCE') sourceWrite = source();
          else paymentWrite = payment();
          await waitForBlocked(fixture.pool, pid);
          if (first === 'SOURCE') paymentWrite = payment();
          else sourceWrite = source();
          await waitForBlocked(fixture.pool, pid, 2);
          await barrier.query('COMMIT');
          if (!sourceWrite || !paymentWrite)
            throw new Error(
              'Both native operations must reach the Client barrier.',
            );
          const [sourceResponse, paymentResponse] = await Promise.all([
            sourceWrite,
            paymentWrite,
          ]);
          const successor = await authorSourceJson(sourceResponse, 201);
          expect(successor.versionNumber).toBe(2);
          const receipt = await authorSourceReceipt(paymentResponse, {
            action: 'CONFIRM',
            revision: 2,
          });
          const current = await authorSourceJson(
            await fixture.call(`/payments/${paymentId}`),
          );
          expect(paymentRecord(current.payment)).toMatchObject({
            state: 'CONFIRMED',
            revision: 2,
            confirmation: { note: review.confirmationNote },
          });
          expect(paymentRecord(current.liveSource)).toMatchObject({
            kind: 'AVAILABLE',
            documentVersionId: prepared.source.documentVersionId,
            versionNumber: 1,
          });
          const pdf = await fixture.call(`/payments/${paymentId}/source`);
          expect(pdf.status).toBe(200);
          expect(Buffer.from(await pdf.arrayBuffer())).toEqual(prepared.bytes);
          const beforeReplay = (
            await fixture.pool.query<{ version: number }>(
              'SELECT version FROM client_accounts WHERE id=$1',
              [fixture.ready.clientId],
            )
          ).rows;
          expect(beforeReplay).toEqual([{ version: clientVersion + 2 }]);
          expect(
            (
              await authorSourceReceipt(await payment(), {
                action: 'CONFIRM',
                revision: 2,
              })
            ).body,
          ).toEqual(receipt.body);
          expect(
            (
              await fixture.pool.query(
                'SELECT version FROM client_accounts WHERE id=$1',
                [fixture.ready.clientId],
              )
            ).rows,
          ).toEqual(beforeReplay);
        } finally {
          await barrier.query('ROLLBACK');
          barrier.release();
          await Promise.allSettled(
            [sourceWrite, paymentWrite].filter((value) => value !== undefined),
          );
        }
      });
    },
  );
});
