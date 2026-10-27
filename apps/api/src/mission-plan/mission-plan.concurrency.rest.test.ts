import { content } from './mission-plan.test-fixtures.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPilotPlanFixture,
  object,
  text,
  objects,
} from '../project-template/project-pilot-plan.test-support.js';
const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Company mission-plan live authorization serialization', () => {
  let f: Awaited<ReturnType<typeof createPilotPlanFixture>>;
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error('Missing disposable database');
    f = await createPilotPlanFixture(url, {
      serverClock: { now: () => new Date('2026-10-27T12:00:00.000Z') },
    });
  });
  beforeEach(async () => f.reset());
  afterAll(async () => f?.close());
  async function setup() {
    await f.grant('/company-mission-plan-configuration-assignments');
    await f.grant('/company-mission-plan-user-assignments');
    return object(
      (await f.command('/mission-plans', content, { key: 'first' })).version,
    );
  }
  function creation(
    v: Record<string, unknown>,
    fields: Record<string, unknown> = {},
  ) {
    return {
      title: 'Synthetic configurable mission',
      clientAccountId: f.clientId,
      planId: v.planId,
      versionId: v.id,
      versionNumber: v.versionNumber,
      ...fields,
    };
  }
  it.each([
    ['revoke', 'denial_first'],
    ['revoke', 'create_first'],
    ['suspend', 'denial_first'],
    ['suspend', 'create_first'],
  ])(
    'serializes custom-plan creation against %s with %s',
    async (kind, order) => {
      const version = await setup();
      const subject = 'pilot-colleague',
        member = text(
          (
            await f.read('/access/current-actor', {
              subject,
              companyId: '',
            })
          ).workspaceMembershipId,
        );
      for (const path of [
        '/company-director-client-assignments',
        '/company-project-assignments',
        '/company-task-manager-assignments',
        '/company-mission-plan-user-assignments',
      ])
        await f.grant(path, member);
      const create = () =>
        f.request('/projects/from-mission-plan', {
          method: 'POST',
          body: creation(version),
          subject,
        });
      const deny = () =>
        kind === 'revoke'
          ? f.request(
              `/company-mission-plan-user-assignments/${member}/${f.companyId}`,
              { method: 'DELETE' },
            )
          : f.request('/workspace-membership-suspensions', {
              method: 'POST',
              body: { workspaceMembershipId: member },
            });
      async function waitForQuery(pattern: string) {
        const deadline = Date.now() + 2000;
        do {
          const rows = await f.harness.pool.query<{ count: string }>(
            'SELECT count(DISTINCT activity.pid)::text count FROM pg_locks waiting JOIN pg_stat_activity activity ON activity.pid=waiting.pid WHERE NOT waiting.granted AND activity.datname=current_database() AND activity.query ILIKE $1',
            [pattern],
          );
          if (Number(rows.rows[0]?.count) >= 1) return;
          await new Promise<void>((resolve) => setImmediate(resolve));
        } while (Date.now() < deadline);
        throw new Error(`Missing observed waiter ${pattern}`);
      }
      const barrier = await f.harness.pool.connect();
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
          second = create();
          await waitForQuery('%update "internal_users"%');
        } else {
          await barrier.query(
            'SELECT id FROM client_accounts WHERE id=$1 FOR SHARE',
            [f.clientId],
          );
          first = create();
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
      expect((await create()).status).toBe(403);
      const expected = order === 'create_first' ? 1 : 0;
      expect(
        (
          await f.harness.pool.query(
            'SELECT (SELECT count(*)::int FROM tasks) tasks,(SELECT count(*)::int FROM mission_plan_task_copies) copies,(SELECT count(*)::int FROM task_events) events,(SELECT count(*)::int FROM mission_plan_instances) plans,(SELECT count(*)::int FROM project_creation_events) projects',
          )
        ).rows,
      ).toEqual([
        {
          tasks: expected,
          copies: expected,
          events: expected,
          plans: expected ? 1 : 0,
          projects: expected ? 1 : 0,
        },
      ]);
    },
  );
  it.each([
    ['revoke', 'denial_first'],
    ['revoke', 'create_first'],
    ['suspend', 'denial_first'],
    ['suspend', 'create_first'],
  ])(
    'serializes source publication against %s with %s',
    async (kind, order) => {
      const version = await setup();
      const subject = 'pilot-colleague',
        member = text(
          (
            await f.read('/access/current-actor', {
              subject,
              companyId: '',
            })
          ).workspaceMembershipId,
        );
      for (const path of [
        '/company-context-assignments',
        '/company-mission-plan-configuration-assignments',
      ])
        await f.grant(path, member);
      const create = () =>
        f.request(`/mission-plans/${text(version.planId)}/versions`, {
          method: 'POST',
          body: { ...content, expectedHeadVersion: 1 },
          subject,
        });
      const deny = () =>
        kind === 'revoke'
          ? f.request(
              `/company-mission-plan-configuration-assignments/${member}/${f.companyId}`,
              { method: 'DELETE' },
            )
          : f.request('/workspace-membership-suspensions', {
              method: 'POST',
              body: { workspaceMembershipId: member },
            });
      async function waitForQuery(pattern: string) {
        const deadline = Date.now() + 2000;
        do {
          const rows = await f.harness.pool.query<{ count: string }>(
            'SELECT count(DISTINCT activity.pid)::text count FROM pg_locks waiting JOIN pg_stat_activity activity ON activity.pid=waiting.pid WHERE NOT waiting.granted AND activity.datname=current_database() AND activity.query ILIKE $1',
            [pattern],
          );
          if (Number(rows.rows[0]?.count) >= 1) return;
          await new Promise<void>((resolve) => setImmediate(resolve));
        } while (Date.now() < deadline);
        throw new Error(`Missing observed waiter ${pattern}`);
      }
      const barrier = await f.harness.pool.connect();
      let first: Promise<Response> | undefined,
        second: Promise<Response> | undefined;
      try {
        await barrier.query('BEGIN');
        if (order === 'denial_first') {
          if (kind === 'revoke')
            await barrier.query(
              "SELECT id FROM company_role_assignments WHERE workspace_membership_id=$1 AND bundle='company_mission_plan_configuration' FOR SHARE",
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
          second = create();
          await waitForQuery('%update "internal_users"%');
        } else {
          await barrier.query(
            'SELECT id FROM mission_plans WHERE id=$1 FOR SHARE',
            [version.planId],
          );
          first = create();
          await waitForQuery('%from "mission_plans"%for update%');
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
      expect((await create()).status).toBe(403);
      expect(
        objects(
          (await f.read(`/mission-plans/${text(version.planId)}/versions`))
            .items,
        ),
      ).toHaveLength(order === 'create_first' ? 2 : 1);
    },
  );
});
