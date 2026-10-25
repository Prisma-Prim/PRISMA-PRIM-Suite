import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  backendPid,
  waitForBlocked,
} from '../offer/offer-concurrency.test-support.js';
import {
  ESTIMATE_OFFER_PREPARER,
  openEstimateOfferFixture,
  responseRecord,
} from '../offer/offer-estimate-preparation.test-support.js';
import { prepareModelContractSource } from './model-contract.test-fixture.js';
import { modelContractEffects } from './model-contract.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const changes = [
  {
    name: 'preparation capture revocation',
    subject: 'MEMBER',
    lock: "SELECT id FROM company_role_assignments WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_contract_preparer' FOR UPDATE",
    change:
      "UPDATE company_role_assignments SET revoked_at=now() WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_contract_preparer'",
    status: 403,
  },
  {
    name: 'source-read revocation',
    subject: 'MEMBER',
    lock: "SELECT id FROM company_role_assignments WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_offer_preparer' FOR UPDATE",
    change:
      "UPDATE company_role_assignments SET revoked_at=now() WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_offer_preparer'",
    status: 403,
  },
  {
    name: 'membership suspension',
    subject: 'MEMBER',
    lock: 'SELECT id FROM workspace_memberships WHERE id=$2 AND workspace_id=(SELECT workspace_id FROM companies WHERE id=$1) FOR UPDATE',
    change:
      "UPDATE workspace_memberships SET status='inactive' WHERE id=$2 AND workspace_id=(SELECT workspace_id FROM companies WHERE id=$1)",
    status: 403,
  },
  {
    name: 'Company inactivation',
    subject: 'COMPANY',
    lock: 'SELECT id FROM companies WHERE id=$1 AND id=$2 FOR UPDATE',
    change: "UPDATE companies SET status='inactive' WHERE id=$1 AND id=$2",
    status: 403,
  },
  {
    name: 'Internal User inactivation',
    subject: 'USER',
    lock: 'SELECT id FROM internal_users WHERE id=$2 AND EXISTS(SELECT 1 FROM workspace_memberships m JOIN companies c ON c.workspace_id=m.workspace_id WHERE c.id=$1 AND m.internal_user_id=internal_users.id) FOR UPDATE',
    change:
      "UPDATE internal_users SET status='inactive' WHERE id=$2 AND EXISTS(SELECT 1 FROM workspace_memberships m JOIN companies c ON c.workspace_id=m.workspace_id WHERE c.id=$1 AND m.internal_user_id=internal_users.id)",
    status: 403,
  },
  {
    name: 'Client relationship archiving',
    subject: 'CLIENT',
    lock: 'SELECT id FROM client_accounts WHERE id=$2 AND workspace_id=(SELECT workspace_id FROM companies WHERE id=$1) FOR UPDATE',
    change:
      "UPDATE client_company_relationships SET status='archived' WHERE company_id=$1 AND client_account_id=$2",
    status: 404,
  },
] as const;

withPostgres(
  'Model Contract holds current independent authority and Client fences through commit',
  () => {
    let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
    beforeAll(async () => {
      fixture = await openEstimateOfferFixture();
    });
    beforeEach(async () => {
      await fixture.reset();
    });
    afterAll(async () => {
      await fixture?.close();
    });
    it.each(changes)(
      'serializes both orders of $name and consumption, and denies later receipt disclosure',
      async (change) => {
        for (const changeFirst of [true, false]) {
          if (!changeFirst) await fixture.reset();
          const ready = await prepareModelContractSource(fixture);
          const user = await fixture.pool.query<{ id: string }>(
            'SELECT internal_user_id AS id FROM workspace_memberships WHERE id=$1',
            [ready.source.preparerMembershipId],
          );
          const subject =
            change.subject === 'CLIENT'
              ? ready.source.clientId
              : change.subject === 'COMPANY'
                ? ready.source.companyId
                : change.subject === 'USER'
                  ? user.rows[0]?.id
                  : ready.source.preparerMembershipId;
          if (!subject)
            throw new Error('Missing scoped synthetic authority subject.');
          const values = [ready.source.companyId, subject];
          const command = {
            path: ready.path + '/from-approved-model',
            companyId: ready.source.companyId,
            headers: ESTIMATE_OFFER_PREPARER,
            key: 'live-contract-authority',
            body: ready.intent,
          };
          const before = responseRecord(
            await modelContractEffects(fixture.pool),
          );
          const barrier = await fixture.pool.connect();
          let pending: Promise<Response> | undefined,
            mutation: Promise<unknown> | undefined;
          try {
            await barrier.query('BEGIN');
            const pid = await backendPid(barrier);
            if (changeFirst) {
              await barrier.query(change.lock, values);
              pending = fixture.post(command);
              await waitForBlocked(fixture.pool, pid);
              await barrier.query(change.change, values);
              await barrier.query('COMMIT');
              expect((await pending).status).toBe(change.status);
              const after = responseRecord(
                await modelContractEffects(fixture.pool),
              );
              // The external invalidation itself may change the relationship; no
              // Contract effect or Client reference-use/version may be committed.
              const { relationships: oldRelationships, ...oldEffects } = before;
              const { relationships: newRelationships, ...newEffects } = after;
              expect(oldRelationships).toBeDefined();
              expect(newRelationships).toBeDefined();
              expect(newEffects).toEqual(oldEffects);
            } else {
              await fixture.pool.query(
                'CREATE FUNCTION pause_model_contract_authority() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(868868); RETURN NEW; END $$',
              );
              await fixture.pool.query(
                'CREATE TRIGGER pause_model_contract_authority BEFORE INSERT ON contract_events FOR EACH ROW EXECUTE FUNCTION pause_model_contract_authority()',
              );
              await barrier.query('SELECT pg_advisory_xact_lock(868868)');
              pending = fixture.post(command);
              await waitForBlocked(fixture.pool, pid);
              mutation = fixture.pool.query(change.change, values);
              await waitForBlocked(fixture.pool, pid, 2);
              await barrier.query('COMMIT');
              expect((await pending).status).toBe(201);
              await mutation;
              const committed = await modelContractEffects(fixture.pool);
              expect((await fixture.post(command)).status).toBe(
                change.subject === 'CLIENT' ? 201 : change.status,
              );
              expect(await modelContractEffects(fixture.pool)).toEqual(
                committed,
              );
              const facts = responseRecord(committed);
              expect(facts.contracts).toEqual([expect.anything()]);
              expect(facts.versions).toEqual([expect.anything()]);
              expect(facts.receipts).toEqual([expect.anything()]);
              expect(facts.events).toHaveLength(2);
            }
          } finally {
            await barrier.query('ROLLBACK');
            barrier.release();
            await Promise.allSettled([
              ...(pending ? [pending] : []),
              ...(mutation ? [mutation] : []),
            ]);
            await fixture.pool.query(
              'DROP TRIGGER IF EXISTS pause_model_contract_authority ON contract_events',
            );
            await fixture.pool.query(
              'DROP FUNCTION IF EXISTS pause_model_contract_authority()',
            );
          }
        }
      },
      30_000,
    );
  },
);
