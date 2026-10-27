import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { openEstimateOfferFixture } from '../offer/offer-estimate-preparation.test-support.js';
import {
  prepareContractMissionPlan,
  contractMissionEffects,
} from './contract-mission-plan.test-support.js';
const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Configured Contract mission live authority serialization', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  beforeAll(async () => {
    fixture = await openEstimateOfferFixture();
  });
  beforeEach(async () => fixture.reset());
  afterAll(async () => fixture?.close());
  it.each([
    ['revoke', 'denial_first'],
    ['revoke', 'create_first'],
    ['suspend', 'denial_first'],
    ['suspend', 'create_first'],
  ])(
    'serializes %s with %s using observed PostgreSQL barriers',
    async (kind, order) => {
      const f = await prepareContractMissionPlan(fixture),
        member = f.ready.source.preparerMembershipId;
      const deny = () =>
        kind === 'revoke'
          ? fixture.request({
              path: `/company-mission-plan-user-assignments/${member}/${f.target.companyId}`,
              init: {
                method: 'DELETE',
                headers: { 'idempotency-key': 'configured-revoke' },
              },
            })
          : fixture.post({
              path: '/workspace-membership-suspensions',
              body: { workspaceMembershipId: member },
            });
      async function waitForQuery(pattern: string) {
        const deadline = Date.now() + 2000;
        do {
          const result = await fixture.pool.query<{ count: string }>(
            'SELECT count(DISTINCT activity.pid)::text count FROM pg_locks waiting JOIN pg_stat_activity activity ON activity.pid=waiting.pid WHERE NOT waiting.granted AND activity.datname=current_database() AND activity.query ILIKE $1',
            [pattern],
          );
          if (Number(result.rows[0]?.count) >= 1) return;
          await new Promise<void>((resolve) => setImmediate(resolve));
        } while (Date.now() < deadline);
        throw new Error('Missing observed PostgreSQL waiter ' + pattern);
      }
      const barrier = await fixture.pool.connect();
      let first: Promise<Response> | undefined,
        second: Promise<Response> | undefined;
      try {
        await barrier.query('BEGIN');
        if (order === 'denial_first') {
          if (kind === 'revoke')
            await barrier.query(
              "SELECT id FROM company_role_assignments WHERE workspace_membership_id=$1 AND bundle='company_mission_plan_user' FOR SHARE",
              [member],
            );
          else
            await barrier.query(
              'LOCK TABLE workspace_membership_suspension_commands IN SHARE MODE',
            );
          first = deny();
          await waitForQuery(
            kind === 'revoke'
              ? '%update "company_role_assignments"%'
              : '%insert into "workspace_membership_suspension_commands"%',
          );
          second = f.create();
          await waitForQuery('%update "internal_users"%');
        } else {
          await barrier.query(
            'SELECT id FROM client_accounts WHERE id=$1 FOR SHARE',
            [f.ready.source.clientId],
          );
          first = f.create();
          await waitForQuery('%from "client_accounts"%for update%');
          second = deny();
          await waitForQuery(
            kind === 'revoke'
              ? '%update "company_role_assignments"%'
              : '%from "workspaces"%for update%',
          );
        }
        await barrier.query('COMMIT');
        expect([(await first).status, (await second).status]).toEqual(
          order === 'denial_first'
            ? [kind === 'revoke' ? 200 : 201, 403]
            : [201, kind === 'revoke' ? 200 : 201],
        );
      } finally {
        await barrier.query('ROLLBACK');
        barrier.release();
        await first?.catch(() => undefined);
        await second?.catch(() => undefined);
      }
      expect((await f.create()).status).toBe(403);
      const copies = order === 'create_first' ? 1 : 0;
      expect(await contractMissionEffects(fixture)).toMatchObject([
        {
          projects: copies,
          tasks: copies * 2,
          instances: copies,
          copies: copies * 2,
          links: copies,
          project_events: copies,
          task_events: copies * 2,
        },
      ]);
    },
  );
});
