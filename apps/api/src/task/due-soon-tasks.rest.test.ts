import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ServerClock } from '../clock/server-clock.js';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const workspaceId = '00000000-0000-4000-8000-000000000721';
const OPERATIONAL_INSTANT = '2026-09-26T21:30:00.000Z';
let serverInstant = OPERATIONAL_INSTANT;
const serverClock: ServerClock = {
  now: () => new Date(serverInstant),
};
const assignments = {
  context: '/company-context-assignments',
  client: '/company-director-client-assignments',
  project: '/company-project-assignments',
  task: '/company-task-manager-assignments',
};
type Grant = keyof typeof assignments;
const members = ['upcoming-colleague', 'upcoming-projects'] as const;
type Member = (typeof members)[number];

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected an object.');
  return Object.fromEntries(Object.entries(value));
}
function objects(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Expected an array.');
  const rows: unknown[] = value;
  return rows.map(object);
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected text.');
  return value;
}
async function body(response: Response): Promise<unknown> {
  return response.json();
}

describe.skipIf(!databaseUrl)(
  'Personal upcoming deadlines REST contract',
  () => {
    let database: IsolatedPostgresTestDatabase;
    let harness: PostgresRestTestHarness;
    let companyA = '';
    let ownerMembershipId = '';

    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      database = await createIsolatedPostgresTestDatabase({
        baseDatabaseUrl: databaseUrl,
        namePrefix: 'due_soon',
      });
      harness = await createPostgresRestTestHarness({
        databaseUrl: database.targetUrl,
        serverClock,
        environment: {
          NODE_ENV: 'test',
          ACCESS_IDENTITY_MODE: 'test',
          ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
          ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'upcoming-owner',
          ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
          ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Operational Home Attention',
          ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
            members.map((subject) => ({
              provider: 'deterministic-test',
              subject,
              workspaceId,
            })),
          ),
        },
      });
    });
    afterAll(async () => {
      await harness?.close();
      await database?.close();
    });
    beforeEach(async () => {
      serverInstant = OPERATIONAL_INSTANT;
      await harness.pool.query(
        'TRUNCATE activity_log_events, workspaces, internal_users CASCADE',
      );
      companyA = text(
        object(
          await command(
            '/companies',
            { displayName: 'PRISMA-PRIM' },
            { company: '' },
          ),
        ).id,
      );
      ownerMembershipId = text(
        object(await read('/access/current-actor')).workspaceMembershipId,
      );
    });

    function request(
      path: string,
      options: {
        method?: string;
        value?: unknown;
        company?: string;
        subject?: Member | 'upcoming-owner';
      } = {},
    ) {
      const {
        method = 'GET',
        value,
        company = companyA,
        subject = 'upcoming-owner',
      } = options;
      return fetch(`${harness.origin}/api${path}`, {
        method,
        headers: {
          'x-test-external-provider': 'deterministic-test',
          'x-test-external-subject': subject,
          'x-test-display-name': subject,
          'x-test-email': `${subject}@example.test`,
          ...(company ? { 'x-company-context-id': company } : {}),
          ...(method === 'GET' ? {} : { 'idempotency-key': randomUUID() }),
          'content-type': 'application/json',
        },
        ...(value === undefined ? {} : { body: JSON.stringify(value) }),
      });
    }
    async function read(
      path: string,
      options: Parameters<typeof request>[1] = {},
    ): Promise<unknown> {
      const response = await request(path, options);
      expect(response.status).toBe(200);
      return body(response);
    }
    async function command(
      path: string,
      value: unknown,
      options: Parameters<typeof request>[1] = {},
    ): Promise<unknown> {
      const response = await request(path, {
        ...options,
        method: 'POST',
        value,
      });
      expect(response.status).toBe(201);
      return body(response);
    }
    type AssignmentFixture = {
      kind: Grant;
      workspaceMembershipId: string;
      companyId?: string;
    };
    function grant({
      kind,
      workspaceMembershipId,
      companyId = companyA,
    }: AssignmentFixture) {
      return command(assignments[kind], {
        workspaceMembershipId,
        companyId,
      });
    }
    async function revoke({
      kind,
      workspaceMembershipId,
      companyId = companyA,
    }: AssignmentFixture) {
      const response = await request(
        `${assignments[kind]}/${workspaceMembershipId}/${companyId}`,
        { method: 'DELETE' },
      );
      expect(response.status).toBe(200);
    }
    async function member(subject: Member, grants: Grant[]) {
      const membershipId = text(
        object(await read('/access/current-actor', { subject, company: '' }))
          .workspaceMembershipId,
      );
      for (const kind of grants)
        await grant({ kind, workspaceMembershipId: membershipId });
      return membershipId;
    }
    async function client({
      displayName,
      companyId = companyA,
    }: {
      displayName: string;
      companyId?: string;
    }) {
      return text(
        object(
          await command('/clients', { displayName }, { company: companyId }),
        ).id,
      );
    }
    async function project({
      title,
      clientAccountId,
      companyId = companyA,
    }: {
      title: string;
      clientAccountId: string;
      companyId?: string;
    }) {
      return text(
        object(
          await command(
            '/projects',
            { title, clientAccountId },
            { company: companyId },
          ),
        ).id,
      );
    }
    async function task({
      projectId,
      title,
      dueDate,
      assigneeMembershipId = ownerMembershipId,
      companyId = companyA,
      priority = 'normal',
    }: {
      projectId: string;
      title: string;
      dueDate: string | null;
      assigneeMembershipId?: string;
      companyId?: string;
      priority?: 'normal' | 'important' | 'critical';
    }) {
      return text(
        object(
          await command(
            `/projects/${projectId}/tasks`,
            {
              title,
              dueDate,
              assigneeMembershipId,
              priority,
            },
            { company: companyId },
          ),
        ).id,
      );
    }
    async function taskCommand(
      id: string,
      action: 'complete' | 'status' | 'cancel',
      value: Record<string, unknown>,
    ) {
      const version = object(object(await read(`/tasks/${id}`)).task).version;
      await command(`/tasks/${id}/${action}`, {
        expectedVersion: version,
        ...value,
      });
    }
    async function prepareReads() {
      for (const kind of ['client', 'project', 'task'] satisfies Grant[])
        await grant({ kind, workspaceMembershipId: ownerMembershipId });
    }
    it('pages the complete own open due-soon set using the server calendar, not attention matches', async () => {
      await prepareReads();
      const projectId = await project({
        title: 'Preparation',
        clientAccountId: await client({ displayName: 'Literal Client' }),
      });
      await task({
        projectId,
        title: 'Yesterday critical',
        dueDate: '2026-09-26',
        priority: 'critical',
      });
      const template = await task({
        projectId,
        title: 'Undated volume template',
        dueDate: null,
      });
      const ids: string[] = [];
      // Bounded volume fixtures copy one public creation's valid ownership/attribution.
      // Dates and tie facts are deliberately supplied, independently of the read query.
      for (let index = 0; index < 26; index++) {
        const id = `${index < 13 ? 'ffffffff-ffff-4fff-8fff' : '00000000-0000-4000-8000'}-${String(index).padStart(12, '0')}`;
        ids.push(id);
        await harness.pool.query(
          `INSERT INTO tasks
          (id,workspace_id,company_id,project_id,client_account_id,title,
           assignee_membership_id,assignee_display_label,due_date,priority,
           created_by_internal_user_id,created_by_membership_id,created_by_display_name,
           created_at,updated_at)
          SELECT $1,workspace_id,company_id,project_id,client_account_id,$2,
           assignee_membership_id,assignee_display_label,DATE '2026-09-27',priority,
           created_by_internal_user_id,created_by_membership_id,created_by_display_name,
           date_trunc('milliseconds',created_at) + ($3::integer * interval '1 microsecond'),
           date_trunc('milliseconds',created_at) + ($3::integer * interval '1 microsecond') FROM tasks WHERE id=$4`,
          [
            id,
            `Due today ${String(index).padStart(2, '0')}`,
            index < 13 ? 1 : 2,
            template,
          ],
        );
      }
      const lastId = await task({
        projectId,
        title: 'Inclusive last day',
        dueDate: '2026-10-04',
      });
      ids.push(lastId);
      await task({
        projectId,
        title: 'Outside window',
        dueDate: '2026-10-05',
        priority: 'critical',
      });
      await task({
        projectId,
        title: 'Undated critical',
        dueDate: null,
        priority: 'critical',
      });
      // Two sub-millisecond groups have reversed identifier prefixes; each also has exact ties.
      // The second group spans page25, while public ISO dates round both groups alike.
      const expectedIds = [
        ...ids.slice(0, 13).sort(),
        ...ids.slice(13, 26).sort(),
        lastId,
      ];
      const page = object(await read('/due-soon-tasks'));
      // Runnable route returning the old full assigned set must fail here by behaviour.
      expect(objects(page.tasks).map((row) => row.id)).toEqual(
        expectedIds.slice(0, 25),
      );
      expect(objects(page.tasks).map((row) => row.title)).toEqual(
        expectedIds
          .slice(0, 25)
          .map((id) => `Due today ${String(ids.indexOf(id)).padStart(2, '0')}`),
      );
      expect(
        new Set(objects(page.tasks).map((row) => row.createdAt)).size,
      ).toBe(1);
      expect(page).toMatchObject({
        companyId: companyA,
        today: '2026-09-27',
        throughDate: '2026-10-04',
        total: 27,
        offset: 0,
        pageSize: 25,
      });
      const last = object(await read('/due-soon-tasks?offset=25'));
      expect(objects(last.tasks).map((row) => row.id)).toEqual(
        expectedIds.slice(25),
      );
      expect(last).toMatchObject({ total: 27, offset: 25, pageSize: 25 });
      expect(object(await read('/due-soon-tasks?offset=50')).tasks).toEqual([]);
      const tiedFirst = objects(object(await read('/due-soon-tasks')).tasks);
      const tiedLast = objects(
        object(await read('/due-soon-tasks?offset=25')).tasks,
      );
      const traversed = [...tiedFirst, ...tiedLast].map((row) => row.id);
      expect(traversed).toEqual(expectedIds);
      expect(new Set(traversed).size).toBe(27);
    }, 30_000);
    it('preserves exact Task eligibility across states, assignments, Projects, Companies and current changes without writes', async () => {
      await prepareReads();
      const colleague = await member('upcoming-colleague', [
        'context',
        'client',
        'project',
        'task',
      ]);
      const clientId = await client({ displayName: 'Visible original' });
      const projectId = await project({
        title: 'Visible Project',
        clientAccountId: clientId,
      });
      const blocked = await task({
        projectId,
        title: 'Blocked within range',
        dueDate: '2026-09-28',
      });
      await taskCommand(blocked, 'status', {
        status: 'blocked',
        reason: 'Waiting',
      });
      const progress = await task({
        projectId,
        title: 'In progress within range',
        dueDate: '2026-09-29',
      });
      await taskCommand(progress, 'status', { status: 'in_progress' });
      const completed = await task({
        projectId,
        title: 'Completed',
        dueDate: '2026-09-27',
      });
      await taskCommand(completed, 'complete', {});
      const cancelled = await task({
        projectId,
        title: 'Cancelled',
        dueDate: '2026-09-27',
      });
      await taskCommand(cancelled, 'cancel', { reason: 'Withdrawn' });
      await task({
        projectId,
        title: 'Colleague',
        dueDate: '2026-09-27',
        assigneeMembershipId: colleague,
      });
      const unassigned = await task({
        projectId,
        title: 'Unassigned',
        dueDate: '2026-09-27',
      });
      await request(`/tasks/${unassigned}`, {
        method: 'PATCH',
        value: { expectedVersion: 1, assigneeMembershipId: null },
      }).then((response) => expect(response.status).toBe(200));
      const hiddenClient = await client({
        displayName: 'Archived relationship',
      });
      await task({
        projectId: await project({
          title: 'Hidden',
          clientAccountId: hiddenClient,
        }),
        title: 'Hidden Task',
        dueDate: '2026-09-27',
      });
      await harness.pool.query(
        "UPDATE client_company_relationships SET status='archived' WHERE client_account_id=$1",
        [hiddenClient],
      );
      const closedProject = await project({
        title: 'Completed Project',
        clientAccountId: clientId,
      });
      const preserved = await task({
        projectId: closedProject,
        title: 'Task in completed Project',
        dueDate: '2026-09-30',
      });
      await harness.pool.query(
        "UPDATE projects SET status='completed', lifecycle_revision=1 WHERE id=$1",
        [closedProject],
      );
      const companyB = text(
        object(await command('/companies', { displayName: 'BIC' })).id,
      );
      for (const kind of ['project', 'task'] satisfies Grant[])
        await grant({
          kind,
          workspaceMembershipId: ownerMembershipId,
          companyId: companyB,
        });
      await task({
        projectId: await project({
          title: 'Other Company',
          clientAccountId: await client({
            displayName: 'Other Client',
            companyId: companyB,
          }),
          companyId: companyB,
        }),
        title: 'Other Company Task',
        dueDate: '2026-09-27',
        companyId: companyB,
      });
      const before = await snapshot();
      const result = object(await read('/due-soon-tasks'));
      expect(objects(result.tasks).map((row) => row.id)).toEqual([
        blocked,
        progress,
        preserved,
      ]);
      expect(result.total).toBe(3);
      const measured = await harness.measureApplicationQueries(() =>
        read('/due-soon-tasks?offset=25'),
      );
      expect(object(measured.value).tasks).toEqual([]);
      expect(measured.queries.join('\n')).toContain('repeatable read');
      expect(await snapshot()).toEqual(before);
      await command(`/tasks/${completed}/reopen`, { expectedVersion: 2 });
      expect(
        objects(object(await read('/due-soon-tasks')).tasks).map(
          (row) => row.id,
        ),
      ).toEqual([completed, blocked, progress, preserved]);
      await taskCommand(completed, 'cancel', { reason: 'No longer needed' });
      expect(object(await read('/due-soon-tasks')).total).toBe(3);
      const version = object(
        object(await read(`/tasks/${blocked}`)).task,
      ).version;
      expect(
        (
          await request(`/tasks/${blocked}`, {
            method: 'PATCH',
            value: { expectedVersion: version, dueDate: '2026-10-05' },
          })
        ).status,
      ).toBe(200);
      expect(object(await read('/due-soon-tasks')).total).toBe(2);
      const current = object(
        object(await read(`/tasks/${progress}`)).task,
      ).version;
      expect(
        (
          await request(`/tasks/${progress}`, {
            method: 'PATCH',
            value: {
              expectedVersion: current,
              assigneeMembershipId: colleague,
            },
          })
        ).status,
      ).toBe(200);
      expect(
        objects(object(await read('/due-soon-tasks')).tasks).map(
          (row) => row.id,
        ),
      ).toEqual([preserved]);
    }, 30_000);

    async function snapshot() {
      const tables = [
        'activity_log_events',
        'task_events',
        'task_commands',
        'tasks',
        'client_company_relationships',
      ];
      return Promise.all(
        tables.map(
          async (table) =>
            (
              await harness.pool.query(
                `SELECT coalesce(jsonb_agg(to_jsonb(entry) ORDER BY to_jsonb(entry)::text),'[]'::jsonb) AS data FROM ${table} entry`,
              )
            ).rows,
        ),
      );
    }

    it('rejects unsupported or unsafe pagination, omitted authority and foreign selections without leakage', async () => {
      await prepareReads();
      const projectId = await project({
        title: 'Read permission',
        clientAccountId: await client({ displayName: 'Permission Client' }),
      });
      await task({
        projectId,
        title: 'Protected deadline',
        dueDate: '2026-09-27',
      });
      await member('upcoming-projects', ['context']);
      const before = await snapshot();
      for (const query of [
        'offset=-1',
        'offset=1.5',
        'offset=9007199254740992',
        'offset=1&offset=2',
        'offset[]=0',
        'offset=',
        'scope=all',
        'assignee=x',
        'today=2026-09-27',
        'pageSize=100',
      ]) {
        const response = await request(`/due-soon-tasks?${query}`);
        expect(response.status).toBe(400);
        expect(JSON.stringify(await body(response))).not.toContain(
          'Protected deadline',
        );
      }
      expect(
        object(await read('/due-soon-tasks?offset=9007199254740991')).tasks,
      ).toEqual([]);
      expect((await fetch(`${harness.origin}/api/due-soon-tasks`)).status).toBe(
        401,
      );
      for (const options of [
        { company: '' },
        { company: randomUUID() },
        { subject: 'upcoming-projects' },
      ] satisfies Parameters<typeof request>[1][]) {
        const response = await request('/due-soon-tasks', options);
        expect(response.status).toBe(403);
        expect(JSON.stringify(await body(response))).not.toContain(
          'Protected deadline',
        );
      }
      expect(await snapshot()).toEqual(before);
    }, 30_000);

    it('rechecks every captured read bundle and inactive identity on the next read', async () => {
      await prepareReads();
      const projectId = await project({
        title: 'Current authority',
        clientAccountId: await client({ displayName: 'Current Client' }),
      });
      await task({
        projectId,
        title: 'Protected deadline',
        dueDate: '2026-09-27',
      });
      const reader = await member('upcoming-colleague', [
        'context',
        'client',
        'project',
        'task',
      ]);
      await task({
        projectId,
        title: 'Member deadline',
        dueDate: '2026-09-27',
        assigneeMembershipId: reader,
      });
      for (const kind of ['task', 'project', 'client'] satisfies Grant[]) {
        await revoke({ kind, workspaceMembershipId: reader });
        expect(
          (await request('/due-soon-tasks', { subject: 'upcoming-colleague' }))
            .status,
        ).toBe(403);
        await grant({ kind, workspaceMembershipId: reader });
        expect(
          object(
            await read('/due-soon-tasks', { subject: 'upcoming-colleague' }),
          ).total,
        ).toBe(1);
      }
      const user = text(
        object(await read('/access/current-actor')).internalUserId,
      );
      await harness.pool.query(
        "UPDATE workspace_memberships SET status='inactive' WHERE id=$1",
        [ownerMembershipId],
      );
      expect((await request('/due-soon-tasks')).status).toBe(403);
      await harness.pool.query(
        "UPDATE workspace_memberships SET status='active' WHERE id=$1",
        [ownerMembershipId],
      );
      await harness.pool.query(
        "UPDATE internal_users SET status='inactive' WHERE id=$1",
        [user],
      );
      expect((await request('/due-soon-tasks')).status).toBe(403);
    }, 30_000);

    it('returns a genuine empty set and samples a new inclusive calendar range on the next read', async () => {
      await prepareReads();
      expect(await read('/due-soon-tasks')).toEqual({
        companyId: companyA,
        today: '2026-09-27',
        throughDate: '2026-10-04',
        total: 0,
        offset: 0,
        pageSize: 25,
        tasks: [],
      });
      const projectId = await project({
        title: 'Date rollover',
        clientAccountId: await client({ displayName: 'Calendar Client' }),
      });
      await task({ projectId, title: 'Old today', dueDate: '2026-09-27' });
      await task({
        projectId,
        title: 'New inclusive end',
        dueDate: '2026-10-05',
      });
      serverInstant = '2026-09-27T21:30:00.000Z';
      expect(object(await read('/due-soon-tasks'))).toMatchObject({
        today: '2026-09-28',
        throughDate: '2026-10-05',
        total: 1,
        tasks: [{ title: 'New inclusive end' }],
      });
    });
  },
);
