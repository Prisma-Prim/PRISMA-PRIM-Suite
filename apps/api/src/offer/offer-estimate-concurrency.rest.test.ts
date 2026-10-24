import { setImmediate } from 'node:timers/promises';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ESTIMATE_OFFER_PREPARER,
  estimateOfferIntent,
  openEstimateOfferFixture,
  responseRecord,
} from './offer-estimate-preparation.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Internal Offer atomicity at the public REST boundary', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  beforeAll(async () => {
    fixture = await openEstimateOfferFixture();
  });
  beforeEach(async () => fixture.reset());
  afterAll(async () => fixture?.close());

  const changes = [
    {
      name: 'preparer revocation',
      lock: "SELECT id FROM company_role_assignments WHERE company_id = $1 AND workspace_membership_id = $2 AND bundle::text = 'company_offer_preparer' FOR UPDATE",
      change:
        "UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND workspace_membership_id = $2 AND bundle::text = 'company_offer_preparer'",
      status: 403,
    },
    {
      name: 'estimate-read revocation',
      lock: "SELECT id FROM company_role_assignments WHERE company_id = $1 AND workspace_membership_id = $2 AND bundle::text = 'company_profitability_contributor' FOR UPDATE",
      change:
        "UPDATE company_role_assignments SET revoked_at = now() WHERE company_id = $1 AND workspace_membership_id = $2 AND bundle::text = 'company_profitability_contributor'",
      status: 403,
    },
    {
      name: 'membership suspension',
      lock: 'SELECT id FROM workspace_memberships WHERE id = $2 AND workspace_id = (SELECT workspace_id FROM companies WHERE id = $1) FOR UPDATE',
      change:
        "UPDATE workspace_memberships SET status = 'inactive' WHERE id = $2 AND workspace_id = (SELECT workspace_id FROM companies WHERE id = $1)",
      status: 403,
    },
    {
      name: 'Client archiving',
      lock: 'SELECT id FROM client_accounts WHERE id = $2 AND workspace_id = (SELECT workspace_id FROM companies WHERE id = $1) FOR UPDATE',
      change:
        "UPDATE client_company_relationships SET status = 'archived' WHERE company_id = $1 AND client_account_id = $2",
      status: 404,
    },
  ];
  it.each(changes)(
    'refuses a new command behind committed $name without partial effects',
    async (change) => {
      const source = await fixture.prepare();
      const values = [
        source.companyId,
        change.name === 'Client archiving'
          ? source.clientId
          : source.preparerMembershipId,
      ];
      const before = await effects(fixture.pool);
      const barrier = await fixture.pool.connect();
      let pending: Promise<Response> | undefined;
      try {
        await barrier.query('BEGIN');
        const pid = await backendPid(barrier);
        await barrier.query(change.lock, values);
        pending = fixture.post({
          path: `/offers/opportunities/${source.opportunityId}/from-approved-estimate`,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          key: 'blocked-before-creation',
          body: estimateOfferIntent(source),
        });
        await waitForBlocked(fixture.pool, pid);
        await barrier.query(change.change, values);
        await barrier.query('COMMIT');
        const denied = await pending;
        expect(denied.status).toBe(change.status);
        expect(JSON.stringify(await denied.json())).not.toContain(
          source.estimateVersionId,
        );
        expect(await effects(fixture.pool)).toEqual(before);
      } finally {
        await barrier.query('ROLLBACK');
        barrier.release();
        if (pending) await Promise.allSettled([pending]);
      }
    },
  );

  it.each(changes)(
    'commits protected content before a queued $name, then denies replay',
    async (change) => {
      const source = await fixture.prepare();
      const values = [
        source.companyId,
        change.name === 'Client archiving'
          ? source.clientId
          : source.preparerMembershipId,
      ];
      const barrier = await fixture.pool.connect();
      let pending: Promise<Response> | undefined;
      let mutation: Promise<unknown> | undefined;
      const command = {
        path: `/offers/opportunities/${source.opportunityId}/from-approved-estimate`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        key: 'protected-before-change',
        body: estimateOfferIntent(source),
      };
      try {
        await fixture.pool
          .query(`CREATE FUNCTION test_pause_internal_offer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(842842); RETURN NEW; END $$;
        CREATE TRIGGER test_pause_internal_offer BEFORE INSERT ON offer_events FOR EACH ROW EXECUTE FUNCTION test_pause_internal_offer()`);
        await barrier.query('BEGIN');
        const pid = await backendPid(barrier);
        await barrier.query('SELECT pg_advisory_xact_lock(842842)');
        pending = fixture.post(command);
        await waitForBlocked(fixture.pool, pid);
        mutation = fixture.pool.query(change.change, values);
        await waitForBlocked(fixture.pool, pid, 2);
        await barrier.query('COMMIT');
        const created = await pending;
        expect(created.status).toBe(201);
        expect(responseRecord(await created.json()).version).toMatchObject({
          priceSource: { amount: '125.00' },
        });
        await mutation;
        expect((await fixture.post(command)).status).toBe(change.status);
        const state = await effects(fixture.pool);
        expect(state).toMatchObject({
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
          'DROP TRIGGER IF EXISTS test_pause_internal_offer ON offer_events; DROP FUNCTION IF EXISTS test_pause_internal_offer()',
        );
      }
    },
  );

  it.each(['first', 'successor'])(
    'rolls back the complete %s command on a final event fault and retries cleanly',
    async (mode) => {
      const source = await fixture.prepare();
      const path = `/offers/opportunities/${source.opportunityId}`;
      if (mode === 'successor')
        await fixture.command({
          path: `${path}/from-approved-estimate`,
          companyId: source.companyId,
          headers: ESTIMATE_OFFER_PREPARER,
          body: estimateOfferIntent(source),
        });
      const before = await effects(fixture.pool);
      const command = {
        path: `${path}/${mode === 'successor' ? 'versions/' : ''}from-approved-estimate`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        key: 'fault-and-exact-retry',
        body: {
          ...estimateOfferIntent(source),
          ...(mode === 'successor' ? { expectedOfferRevision: 1 } : {}),
        },
      };
      await fixture.pool
        .query(`CREATE FUNCTION test_fail_internal_offer() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'offer_version.created' THEN RAISE EXCEPTION 'Synthetic final write fault'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER test_fail_internal_offer BEFORE INSERT ON offer_events FOR EACH ROW EXECUTE FUNCTION test_fail_internal_offer()`);
      try {
        const failed = await fixture.post(command);
        expect({
          status: failed.status,
          body: await failed.json(),
        }).toMatchObject({
          status: 500,
          body: { code: 'OFFER_COMMAND_FAILED' },
        });
        expect(await effects(fixture.pool)).toEqual(before);
      } finally {
        await fixture.pool.query(
          'DROP TRIGGER test_fail_internal_offer ON offer_events; DROP FUNCTION test_fail_internal_offer()',
        );
      }
      const created = responseRecord(await fixture.command(command));
      expect(created).toMatchObject({
        illustrativeReference: 1,
        revision: mode === 'successor' ? 2 : 1,
        version: { versionNumber: mode === 'successor' ? 2 : 1 },
      });
      expect(await fixture.command(command)).toEqual(created);
    },
  );
  it('converges conflicting shared actor/Company keys across both source routes and different Opportunities', async () => {
    const source = await fixture.prepare();
    await fixture.command({
      path: `/offers/opportunities/${source.opportunityId}/from-approved-estimate`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: estimateOfferIntent(source),
    });
    const price = await fixture.illustrativeSnapshot(source);
    const catalogue = responseRecord(price.catalogue);
    const request = responseRecord(
      await fixture.command({
        path: '/commercial-intake/requests',
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          clientAccountId: source.clientId,
          originalText: 'Synthetic shared-key Request',
          opportunity: {
            title: 'Synthetic second Opportunity',
            nextAction: 'Prepare another Offer',
          },
        },
      }),
    );
    const opportunityId = responseRecord(request.initialOpportunity).id;
    if (typeof opportunityId !== 'string')
      throw new Error('Missing Opportunity.');
    const snapshot = responseRecord(
      await fixture.command({
        path: `/pricing/opportunities/${opportunityId}/snapshots`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        body: {
          pricingRuleVersionNumber: catalogue.ruleVersionNumber,
          lines: [
            {
              offeringId: catalogue.offeringId,
              tariffVersionNumber: catalogue.tariffVersionNumber,
              quantity: '1',
            },
          ],
        },
      }),
    );
    await fixture.command({
      path: `/offers/opportunities/${opportunityId}`,
      companyId: source.companyId,
      headers: ESTIMATE_OFFER_PREPARER,
      body: { pricingSnapshotId: snapshot.id, recipient: { kind: 'PRIMARY' } },
    });
    const barrier = await fixture.pool.connect();
    let legacy: Promise<Response> | undefined,
      internal: Promise<Response> | undefined;
    try {
      await barrier.query('BEGIN');
      const pid = await backendPid(barrier);
      await barrier.query(
        'SELECT id FROM client_accounts WHERE id=$1 FOR UPDATE',
        [source.clientId],
      );
      legacy = fixture.post({
        path: `/offers/opportunities/${opportunityId}/versions`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        key: 'shared-across-source-routes',
        body: {
          expectedOfferRevision: 1,
          pricingSnapshotId: snapshot.id,
          recipient: { kind: 'PRIMARY' },
        },
      });
      await waitForBlocked(fixture.pool, pid);
      internal = fixture.post({
        path: `/offers/opportunities/${source.opportunityId}/versions/from-approved-estimate`,
        companyId: source.companyId,
        headers: ESTIMATE_OFFER_PREPARER,
        key: 'shared-across-source-routes',
        body: { ...estimateOfferIntent(source), expectedOfferRevision: 1 },
      });
      await waitForBlocked(fixture.pool, pid, 2);
      await barrier.query('COMMIT');
      const results = await Promise.all([legacy, internal]);
      expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
      const conflict = results.find((result) => result.status === 409);
      expect(conflict ? await conflict.json() : null).toMatchObject({
        code: 'IDEMPOTENCY_CONFLICT',
      });
    } finally {
      await barrier.query('ROLLBACK');
      barrier.release();
      await Promise.allSettled([
        ...(legacy ? [legacy] : []),
        ...(internal ? [internal] : []),
      ]);
    }
  });
});

async function effects(pool: Pool) {
  const result = await pool.query<{
    offers: number;
    versions: number;
    commands: number;
    events: number;
    references: unknown;
    heads: unknown;
    clientVersions: unknown;
  }>(`SELECT
    (SELECT count(*)::int FROM offers) AS offers, (SELECT count(*)::int FROM offer_versions) AS versions,
    (SELECT count(*)::int FROM offer_commands) AS commands, (SELECT count(*)::int FROM offer_events) AS events,
    (SELECT jsonb_agg(to_jsonb(c) ORDER BY company_id) FROM offer_reference_counters c) AS references,
    (SELECT jsonb_agg(jsonb_build_array(id,revision) ORDER BY id) FROM offers) AS heads,
    (SELECT jsonb_agg(jsonb_build_array(id,version) ORDER BY id) FROM client_accounts) AS "clientVersions"`);
  const row = result.rows[0];
  if (!row) throw new Error('Missing effect counters.');
  return row;
}
async function backendPid(client: { query: Pool['query'] }): Promise<number> {
  const result = await client.query<{ pid: number }>(
    'SELECT pg_backend_pid() AS pid',
  );
  const pid = result.rows[0]?.pid;
  if (!pid) throw new Error('Missing barrier pid.');
  return pid;
}
async function waitForBlocked(pool: Pool, pid: number, count = 1) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    const result = await pool.query<{ count: number }>(
      `WITH RECURSIVE waiting AS (
      SELECT pid, pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'
    ), chain AS (
      SELECT pid FROM waiting WHERE $1 = ANY(blockers)
      UNION SELECT w.pid FROM waiting w JOIN chain c ON c.pid = ANY(w.blockers)
    ) SELECT count(*)::int AS count FROM chain`,
      [pid],
    );
    if ((result.rows[0]?.count ?? 0) >= count) return;
    await setImmediate();
  }
  throw new Error(
    `Expected ${count} requests at the deterministic lock barrier.`,
  );
}
