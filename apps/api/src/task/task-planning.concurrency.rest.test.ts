import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPilotPlanFixture,
  json,
  object,
  objects,
  type PilotPlanFixture,
} from '../project-template/project-pilot-plan.test-support.js';
import {
  eligiblePlanningColleague,
  planningEffects,
  preparePlanning,
} from './task-planning.test-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Grouped Task planning serialized public commands', () => {
  let f: PilotPlanFixture;
  beforeAll(async () => {
    const url = process.env.TEST_DATABASE_URL;
    if (!url) throw new Error('Disposable PostgreSQL required.');
    f = await createPilotPlanFixture(url);
  });
  beforeEach(async () => f.reset());
  afterAll(async () => f?.close());

  async function waitForQuery(patterns: string[], count = 1) {
    const deadline = Date.now() + 2000;
    do {
      const result = await f.harness.pool.query<{ count: string }>(
        'SELECT count(DISTINCT activity.pid)::text count FROM pg_locks waiting JOIN pg_stat_activity activity ON activity.pid=waiting.pid WHERE NOT waiting.granted AND activity.datname=current_database() AND activity.query ILIKE ANY($1::text[])',
        [patterns],
      );
      if (Number(result.rows[0]?.count) >= count) return;
      await new Promise<void>((resolve) => setImmediate(resolve));
    } while (Date.now() < deadline);
    const observed = await f.harness.pool.query<{
      query: string;
      wait_event: string | null;
    }>(
      'SELECT activity.query, activity.wait_event FROM pg_locks waiting JOIN pg_stat_activity activity ON activity.pid=waiting.pid WHERE NOT waiting.granted AND activity.datname=current_database()',
    );
    throw new Error(
      'Missing observed PostgreSQL planning waiter: ' +
        patterns.join(', ') +
        '; actual blocked statements: ' +
        JSON.stringify(observed.rows),
    );
  }

  it.each(['individual_first', 'group_first', 'overlapping_group'])(
    'serializes %s at the native Client barrier without partial changes',
    async (order) => {
      const s = await preparePlanning(f, 2),
        row = s.body.tasks[0];
      if (!row) throw new Error('Native Task required.');
      const colleague = await eligiblePlanningColleague(f);
      // Distinct actors reach the Client barrier independently of their own identity-update locks.
      const individual = (asColleague = false) =>
        f.request(`/tasks/${row.taskId}`, {
          method: 'PATCH',
          body: {
            expectedVersion: 1,
            title: 'Separate native edit',
            description: 'Separate native instructions\r\n  Ș / Я / 😀',
          },
          ...(asColleague
            ? { subject: colleague.subject, workspaceId: f.workspaceId }
            : {}),
        });
      const overlapping = () =>
        s.plan({
          key: 'different-group',
          body: { tasks: [...s.body.tasks].reverse() },
          subject: colleague.subject,
          workspaceId: f.workspaceId,
        });
      const barrier = await f.harness.pool.connect();
      let first: Promise<Response> | undefined,
        second: Promise<Response> | undefined;
      try {
        await barrier.query('BEGIN');
        await barrier.query(
          'SELECT id FROM client_accounts WHERE id=$1 FOR SHARE',
          [f.clientId],
        );
        first =
          order === 'individual_first'
            ? individual()
            : s.plan({ key: 'ordered-group' });
        await waitForQuery(['%from "client_accounts"%for update%']);
        second =
          order === 'overlapping_group'
            ? overlapping()
            : order === 'individual_first'
              ? s.plan({
                  key: 'ordered-group',
                  subject: colleague.subject,
                  workspaceId: f.workspaceId,
                })
              : individual(true);
        await waitForQuery(['%from "client_accounts"%for update%'], 2);
        await barrier.query('COMMIT');
        expect([(await first).status, (await second).status]).toEqual([
          order === 'individual_first' ? 200 : 201,
          409,
        ]);
      } finally {
        await barrier.query('ROLLBACK');
        barrier.release();
        await first?.catch(() => undefined);
        await second?.catch(() => undefined);
      }
      const tasks = objects(
        (await f.read(`/projects/${s.projectId}/tasks`)).tasks,
      );
      expect(tasks.find((task) => task.id === row.taskId)).toMatchObject({
        version: 2,
        title:
          order === 'individual_first'
            ? 'Separate native edit'
            : s.originals[0]?.title,
        description:
          order === 'individual_first'
            ? 'Separate native instructions\r\n  Ș / Я / 😀'
            : null,
      });
      const other = s.body.tasks[1];
      if (!other) throw new Error('Second Task required.');
      expect(
        object((await f.read(`/tasks/${other.taskId}`)).task),
      ).toMatchObject({
        version: order === 'individual_first' ? 1 : 2,
        dueDate: order === 'individual_first' ? null : '2026-11-09',
      });
    },
  );

  const races = (['actor', 'assignee'] as const).flatMap((target) =>
    (['revoke', 'suspend'] as const).flatMap((kind) =>
      (['denial_first', 'planning_first'] as const).map((order) => ({
        target,
        kind,
        order,
      })),
    ),
  );
  it.each(races)(
    'serializes $target $kind with $order using observed PostgreSQL locks',
    async ({ target, kind, order }) => {
      const s = await preparePlanning(f, 2),
        colleague = await eligiblePlanningColleague(f);
      const body = {
        tasks: s.body.tasks.map((task) => ({
          ...task,
          assigneeMembershipId: target === 'assignee' ? colleague.member : null,
        })),
      };
      const plan = () =>
        s.plan({
          body,
          key: 'serialized-planning',
          ...(target === 'actor'
            ? { subject: colleague.subject, workspaceId: f.workspaceId }
            : {}),
        });
      const deny = () =>
        kind === 'revoke'
          ? f.request(
              `/company-task-manager-assignments/${colleague.member}/${f.companyId}`,
              { method: 'DELETE' },
            )
          : f.request('/workspace-membership-suspensions', {
              method: 'POST',
              body: { workspaceMembershipId: colleague.member },
            });
      const barrier = await f.harness.pool.connect();
      const clientBarrier = await f.harness.pool.connect();
      let first: Promise<Response> | undefined,
        second: Promise<Response> | undefined;
      try {
        await barrier.query('BEGIN');
        await clientBarrier.query('BEGIN');
        if (target === 'assignee' && order === 'denial_first')
          await clientBarrier.query(
            'SELECT id FROM client_accounts WHERE id=$1 FOR SHARE',
            [f.clientId],
          );
        if (order === 'denial_first') {
          if (kind === 'revoke')
            await barrier.query(
              "SELECT id FROM company_role_assignments WHERE workspace_membership_id=$1 AND bundle='company_task_manager' FOR SHARE",
              [colleague.member],
            );
          else
            await barrier.query(
              'LOCK TABLE workspace_membership_suspension_commands IN SHARE MODE',
            );
          first = deny();
          await waitForQuery([
            kind === 'revoke'
              ? '%update "company_role_assignments"%'
              : '%insert into "workspace_membership_suspension_commands"%',
          ]);
          second = plan();
          await waitForQuery([
            '%update "internal_users"%',
            '%from "workspace_memberships"%',
            '%from "client_accounts"%for update%',
            '%insert into "workspaces"%',
          ]);
        } else {
          // The final insert follows every Task write and eligibility lock, so denial is forced behind the whole group.
          await barrier.query('LOCK TABLE task_commands IN SHARE MODE');
          first = plan();
          await waitForQuery(['%insert into "task_commands"%']);
          second = deny();
          await waitForQuery([
            '%update "company_role_assignments"%',
            '%from "workspaces"%for update%',
            '%from "workspace_memberships"%for update%',
            '%update "internal_users"%',
          ]);
        }
        await barrier.query('COMMIT');
        // Revocation waiting on its own row does not exclude another compatible share reader.
        // Keep fresh Task writes behind the Client barrier until denial actually commits.
        if (target === 'assignee' && order === 'denial_first') await first;
        await clientBarrier.query('COMMIT');
        expect([(await first).status, (await second).status]).toEqual(
          order === 'denial_first'
            ? [kind === 'revoke' ? 200 : 201, target === 'actor' ? 403 : 400]
            : [201, kind === 'revoke' ? 200 : 201],
        );
      } finally {
        await barrier.query('ROLLBACK');
        barrier.release();
        await clientBarrier.query('ROLLBACK');
        clientBarrier.release();
        await first?.catch(() => undefined);
        await second?.catch(() => undefined);
      }
      const tasks = objects(
        (await f.read(`/projects/${s.projectId}/tasks`)).tasks,
      );
      expect(tasks.map((task) => task.version)).toEqual(
        order === 'denial_first' ? [1, 1] : [2, 2],
      );
      const baseline = await planningEffects(f);
      const replay = await plan();
      expect(replay.status).toBe(
        target === 'actor' ? 403 : order === 'denial_first' ? 400 : 201,
      );
      if (target === 'assignee' && order === 'planning_first')
        expect(objects((await json(replay)).tasks)).toHaveLength(2);
      expect(await planningEffects(f)).toEqual(baseline);
    },
  );
});
