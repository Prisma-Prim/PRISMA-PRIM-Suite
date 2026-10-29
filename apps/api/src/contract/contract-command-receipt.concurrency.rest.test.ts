import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openEstimateOfferFixture } from '../offer/offer-estimate-preparation.test-support.js';
import {
  expectReceiptConflict,
  prepareReceiptScope,
  receiptCounts,
  receiptTargetEffects,
  waitForReceiptBarrier,
  waitForReceiptKey,
} from './contract-command-receipt.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Contract command receipt namespace through REST', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  beforeAll(async () => {
    // Access still resolves current status, membership, captured grants and
    // Company on each real request. Only the unrelated profile UPDATE is off,
    // using the same fixed-profile mode as the demonstration composition.
    fixture = await openEstimateOfferFixture({
      synchronizeIdentityProfile: false,
    });
  });
  beforeEach(async () => fixture.reset());
  afterAll(async () => fixture?.close());

  it.each([
    ['APPROVE', 'RECORD_SIGNATURE'],
    ['RECORD_SIGNATURE', 'APPROVE'],
    ['APPROVE', 'CREATE_VERSION'],
    ['CREATE_VERSION', 'APPROVE'],
    ['APPROVE', 'RUN_QUALITY_CHECKS'],
    ['RUN_QUALITY_CHECKS', 'APPROVE'],
    ['RECORD_SIGNATURE', 'CREATE_VERSION'],
    ['CREATE_VERSION', 'RECORD_SIGNATURE'],
    ['RECORD_SIGNATURE', 'RUN_QUALITY_CHECKS'],
    ['RUN_QUALITY_CHECKS', 'RECORD_SIGNATURE'],
  ] as const)(
    'serializes %s before %s across independent Client/Opportunity/Contract locks',
    async (firstKind, secondKind) => {
      const scope = await prepareReceiptScope(fixture);
      const first = await scope.target(firstKind);
      const second = await scope.target(secondKind);
      expect(first.clientId).not.toBe(second.clientId);
      expect(first.opportunityId).not.toBe(second.opportunityId);
      expect(first.contractId).not.toBe(second.contractId);
      const loserBefore = await receiptTargetEffects(fixture, second);
      const before = await receiptCounts(fixture);
      const key = 'receipt-collision';
      const barrier = await fixture.pool.connect();
      let winner: Promise<Response> | undefined;
      let loser: Promise<Response> | undefined;
      try {
        await barrier.query('SELECT pg_advisory_lock(914979,1)');
        await fixture.pool
          .query(`CREATE FUNCTION hold_receipt_write() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.idempotency_key='receipt-collision' THEN
          PERFORM pg_advisory_xact_lock(914979,1);
        END IF; RETURN NEW; END; $$;
        CREATE TRIGGER hold_receipt_write BEFORE INSERT ON contract_commands
          FOR EACH ROW EXECUTE FUNCTION hold_receipt_write()`);
        winner = first.send(key);
        const holderPid = await waitForReceiptBarrier(fixture);
        loser = second.send(key);
        await waitForReceiptKey(fixture, {
          companyId: scope.source.companyId,
          membershipId: scope.source.preparerMembershipId,
          key,
          holderPid,
        });
        await barrier.query('SELECT pg_advisory_unlock(914979,1)');
        expect((await winner).status).toBe(201);
        await expectReceiptConflict(await loser, secondKind);
      } finally {
        await barrier.query('SELECT pg_advisory_unlock_all()');
        barrier.release();
        await Promise.allSettled([winner, loser]);
        await fixture.pool.query(
          'DROP TRIGGER IF EXISTS hold_receipt_write ON contract_commands; DROP FUNCTION IF EXISTS hold_receipt_write()',
        );
      }
      expect(
        (
          await fixture.pool.query<{
            kind: string;
            result_contract_id: string;
          }>(
            'SELECT kind,result_contract_id FROM contract_commands WHERE idempotency_key=$1',
            [key],
          )
        ).rows,
      ).toEqual([{ kind: firstKind, result_contract_id: first.contractId }]);
      expect(await receiptTargetEffects(fixture, second)).toEqual(loserBefore);
      expect(await receiptCounts(fixture)).toEqual({
        receipts: before.receipts + 1,
        events: before.events + (firstKind === 'RUN_QUALITY_CHECKS' ? 0 : 1),
        quality: before.quality + (firstKind === 'CREATE_VERSION' ? 0 : 1),
        decisions: before.decisions + (firstKind === 'APPROVE' ? 1 : 0),
        signatures:
          before.signatures + (firstKind === 'RECORD_SIGNATURE' ? 1 : 0),
        versions: before.versions + (firstKind === 'CREATE_VERSION' ? 1 : 0),
        revisions:
          before.revisions + (firstKind === 'RUN_QUALITY_CHECKS' ? 0 : 1),
      });
    },
  );
});
