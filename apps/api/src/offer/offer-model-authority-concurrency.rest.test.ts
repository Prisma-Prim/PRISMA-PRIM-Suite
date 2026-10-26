import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  backendPid,
  effects,
  waitForBlocked,
} from './offer-concurrency.test-support.js';
import {
  ESTIMATE_OFFER_PREPARER,
  ESTIMATE_OFFER_READER,
  openEstimateOfferFixture,
} from './offer-estimate-preparation.test-support.js';
import {
  generatedOfferIntent,
  prepareGeneratedOfferSource,
  prepareGeneratedOfferWorkflow,
} from './offer-model-generation.test-fixture.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const changes = [
  {
    name: 'preparer revocation',
    subject: 'MEMBER',
    lock: "SELECT id FROM company_role_assignments WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_offer_preparer' FOR UPDATE",
    change:
      "UPDATE company_role_assignments SET revoked_at=now() WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_offer_preparer'",
    status: 403,
  },
  {
    name: 'economic-read revocation',
    subject: 'MEMBER',
    lock: "SELECT id FROM company_role_assignments WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_profitability_contributor' FOR UPDATE",
    change:
      "UPDATE company_role_assignments SET revoked_at=now() WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_profitability_contributor'",
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
withPostgres('Generated-model Offer live authority fences', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  beforeAll(async () => {
    fixture = await openEstimateOfferFixture();
  });
  beforeEach(async () => fixture.reset());
  afterAll(async () => fixture?.close());
  it.each(changes)(
    'refuses creation queued behind committed $name without partial effects',
    async (change) => {
      const source = await prepareGeneratedOfferSource(fixture);
      const values = await changeValues(source, change.subject);
      const before = await effects(fixture.pool);
      const barrier = await fixture.pool.connect();
      let pending: Promise<Response> | undefined;
      try {
        await barrier.query('BEGIN');
        const pid = await backendPid(barrier);
        await barrier.query(change.lock, values);
        pending = fixture.post({
          path: `/offers/opportunities/${source.opportunityId}/from-approved-model`,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          body: generatedOfferIntent(source),
        });
        await waitForBlocked(fixture.pool, pid);
        await barrier.query(change.change, values);
        await barrier.query('COMMIT');
        const result = await pending;
        expect(result.status).toBe(change.status);
        expect(await effects(fixture.pool)).toEqual(before);
      } finally {
        await barrier.query('ROLLBACK');
        barrier.release();
        await Promise.allSettled(pending ? [pending] : []);
      }
    },
  );
  it.each(changes)(
    'retains authority through commit before a queued $name and denies its later replay',
    async (change) => {
      const source = await prepareGeneratedOfferSource(fixture);
      const values = await changeValues(source, change.subject);
      const command = {
        path: `/offers/opportunities/${source.opportunityId}/from-approved-model`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        key: 'model-live-fence-replay',
        body: generatedOfferIntent(source),
      };
      const barrier = await fixture.pool.connect();
      let pending: Promise<Response> | undefined,
        mutation: Promise<unknown> | undefined;
      try {
        await fixture.pool.query(
          'CREATE FUNCTION pause_model_authority() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(852852); RETURN NEW; END $$',
        );
        await fixture.pool.query(
          'CREATE TRIGGER pause_model_authority BEFORE INSERT ON offer_events FOR EACH ROW EXECUTE FUNCTION pause_model_authority()',
        );
        await barrier.query('BEGIN');
        const pid = await backendPid(barrier);
        await barrier.query('SELECT pg_advisory_xact_lock(852852)');
        pending = fixture.post(command);
        await waitForBlocked(fixture.pool, pid);
        mutation = fixture.pool.query(change.change, values);
        await waitForBlocked(fixture.pool, pid, 2);
        await barrier.query('COMMIT');
        expect((await pending).status).toBe(201);
        await mutation;
        expect((await fixture.post(command)).status).toBe(change.status);
        expect(await effects(fixture.pool)).toMatchObject({
          offers: 1,
          versions: 1,
          commands: 1,
          events: 2,
        });
      } finally {
        await barrier.query('ROLLBACK');
        barrier.release();
        await Promise.allSettled([
          ...(pending ? [pending] : []),
          ...(mutation ? [mutation] : []),
        ]);
        await fixture.pool.query(
          'DROP TRIGGER IF EXISTS pause_model_authority ON offer_events',
        );
        await fixture.pool.query(
          'DROP FUNCTION IF EXISTS pause_model_authority()',
        );
      }
    },
  );
  it.each(['context-first', 'check-first'] as const)(
    'requires independent Company context for a cost-free check in the %s order',
    async (order) => {
      const ready = await prepareGeneratedOfferWorkflow(fixture, 'PENDING');
      const before = await effects(fixture.pool);
      const command = {
        path: `${ready.base}/quality-checks`,
        companyId: ready.source.companyId,
        headers: ESTIMATE_OFFER_READER,
        key: 'model-check-context-replay',
        body: {},
      };
      const values = [ready.source.companyId, ready.source.readerMembershipId];
      const mutationSql =
        "UPDATE company_role_assignments SET revoked_at=now() WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_context_access'";
      const barrier = await fixture.pool.connect();
      let pending: Promise<Response> | undefined,
        mutation: Promise<unknown> | undefined;
      try {
        await barrier.query('BEGIN');
        const pid = await backendPid(barrier);
        if (order === 'context-first') {
          await barrier.query(
            "SELECT id FROM company_role_assignments WHERE company_id=$1 AND workspace_membership_id=$2 AND bundle='company_context_access' FOR UPDATE",
            values,
          );
          pending = fixture.post(command);
          await waitForBlocked(fixture.pool, pid);
          await barrier.query(mutationSql, values);
          await barrier.query('COMMIT');
          expect((await pending).status).toBe(403);
          expect(await effects(fixture.pool)).toEqual(before);
        } else {
          await fixture.pool.query(
            'CREATE FUNCTION pause_model_quality_context() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(852853); RETURN NEW; END $$',
          );
          await fixture.pool.query(
            'CREATE TRIGGER pause_model_quality_context BEFORE INSERT ON offer_quality_runs FOR EACH ROW EXECUTE FUNCTION pause_model_quality_context()',
          );
          await barrier.query('SELECT pg_advisory_xact_lock(852853)');
          pending = fixture.post(command);
          await waitForBlocked(fixture.pool, pid);
          mutation = fixture.pool.query(mutationSql, values);
          await waitForBlocked(fixture.pool, pid, 2);
          await barrier.query('COMMIT');
          expect((await pending).status).toBe(201);
          await mutation;
          expect((await fixture.post(command)).status).toBe(403);
        }
      } finally {
        await barrier.query('ROLLBACK');
        barrier.release();
        await Promise.allSettled([
          ...(pending ? [pending] : []),
          ...(mutation ? [mutation] : []),
        ]);
        await fixture.pool.query(
          'DROP TRIGGER IF EXISTS pause_model_quality_context ON offer_quality_runs',
        );
        await fixture.pool.query(
          'DROP FUNCTION IF EXISTS pause_model_quality_context()',
        );
      }
    },
  );
  async function changeValues(
    source: Awaited<ReturnType<typeof prepareGeneratedOfferSource>>,
    subject: (typeof changes)[number]['subject'],
  ) {
    switch (subject) {
      case 'MEMBER':
        return [source.companyId, source.preparerMembershipId];
      case 'CLIENT':
        return [source.companyId, source.clientId];
      case 'COMPANY':
        return [source.companyId, source.companyId];
      case 'USER': {
        const { rows } = await fixture.pool.query<{ id: string }>(
          'SELECT internal_user_id AS id FROM workspace_memberships WHERE id=$1',
          [source.preparerMembershipId],
        );
        const user = rows[0];
        if (!user) throw new Error('Missing public fixture actor.');
        return [source.companyId, user.id];
      }
      default: {
        const exhaustive: never = subject;
        return exhaustive;
      }
    }
  }
});
