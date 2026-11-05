import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  backendPid,
  waitForBlocked,
} from './offer-concurrency.test-support.js';
import {
  ESTIMATE_OFFER_READER,
  ESTIMATE_OFFER_WORKSPACE,
  openEstimateOfferFixture,
  responseRecord,
} from './offer-estimate-preparation.test-support.js';
import { prepareGeneratedOfferWorkflow } from './offer-model-generation.test-fixture.js';
import { readMessageOffer } from './offer-message-proof.test-support.js';
import { snapshotOfferMessageState } from './offer-message-snapshot.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Exact Offer message observation PostgreSQL lock ordering', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  beforeAll(async () => {
    fixture = await openEstimateOfferFixture({
      synchronizeIdentityProfile: false,
    });
  });
  beforeEach(async () => {
    await fixture.reset();
  });
  afterAll(async () => {
    await fixture?.close();
  });

  const consumed = [
    'company_offer_approver',
    'company_commercial_intake',
    'company_context_access',
  ];
  for (const bundle of consumed) {
    it.each(['revocation-first', 'observation-first'] as const)(
      `serializes ${bundle} in the %s order using real native row/table locks`,
      async (order) => {
        const ready = await prepareGeneratedOfferWorkflow(fixture, 'PENDING');
        const exact = await readMessageOffer(fixture, {
          base: ready.base,
          companyId: ready.source.companyId,
        });
        const request = {
          path: `${ready.base}/message-preparation?sourceHtmlSha256=${exact.digest}`,
          companyId: ready.source.companyId,
          headers: ESTIMATE_OFFER_READER,
        };
        const values = [
          ready.source.companyId,
          ready.source.readerMembershipId,
          bundle,
        ];
        const revoke = `UPDATE company_role_assignments SET revoked_at=now()
          WHERE company_id=$1 AND workspace_membership_id=$2
            AND bundle::text=$3 AND revoked_at IS NULL`;
        const barrier = await fixture.pool.connect();
        let pending: Promise<Response> | undefined;
        let mutation: Promise<unknown> | undefined;
        try {
          await barrier.query('BEGIN');
          const pid = await backendPid(barrier);
          if (order === 'revocation-first') {
            const locked = await barrier.query<{ id: string }>(
              `SELECT id FROM company_role_assignments
               WHERE company_id=$1 AND workspace_membership_id=$2
                 AND bundle::text=$3 AND revoked_at IS NULL FOR UPDATE`,
              values,
            );
            expect(locked.rows.length).toBe(1);
            pending = fixture.request(request);
            await waitForBlocked(fixture.pool, pid);
            await barrier.query(revoke, values);
            await barrier.query('COMMIT');
            const refused = await pending;
            expect(refused.status).toBe(403);
            expect(responseRecord(await refused.json())).not.toHaveProperty(
              'source',
            );
          } else {
            // Authorization/captured-authority locks precede the real Offer read.
            // Holding that source table exposes the ordering without service spies.
            await barrier.query('LOCK TABLE offers IN ACCESS EXCLUSIVE MODE');
            pending = fixture.request(request);
            await waitForBlocked(fixture.pool, pid);
            mutation = fixture.pool.query(revoke, values);
            await waitForBlocked(fixture.pool, pid, 2);
            await barrier.query('COMMIT');
            const observed = await pending;
            expect(observed.status).toBe(200);
            expect(responseRecord(await observed.json()).format).toBe(
              'offer-message-preparation.v1',
            );
            await mutation;
          }
          // The deliberate fixture revocation precedes this read-only interval.
          const before = await snapshotOfferMessageState(
            fixture.pool,
            ESTIMATE_OFFER_WORKSPACE,
          );
          const refused = await fixture.request(request);
          expect(refused.status).toBe(403);
          expect(responseRecord(await refused.json())).not.toHaveProperty(
            'source',
          );
          expect(
            await snapshotOfferMessageState(
              fixture.pool,
              ESTIMATE_OFFER_WORKSPACE,
            ),
          ).toEqual(before);
        } finally {
          await barrier.query('ROLLBACK');
          barrier.release();
          await Promise.allSettled([
            ...(pending ? [pending] : []),
            ...(mutation ? [mutation] : []),
          ]);
        }
      },
      30_000,
    );
  }
});
