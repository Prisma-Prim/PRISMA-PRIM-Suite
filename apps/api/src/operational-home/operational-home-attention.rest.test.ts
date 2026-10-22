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
const workspaceId = '00000000-0000-4000-8000-000000000416';
const OPERATIONAL_INSTANT = '2026-09-26T21:30:00.000Z';
let serverInstant = OPERATIONAL_INSTANT;
let clockSamples = 0;
const serverClock: ServerClock = {
  now: () => {
    clockSamples++;
    return new Date(serverInstant);
  },
};
const assignments = {
  context: '/company-context-assignments',
  client: '/company-director-client-assignments',
  project: '/company-project-assignments',
  task: '/company-task-manager-assignments',
};
type Grant = keyof typeof assignments;
const members = ['attention-colleague', 'attention-projects'] as const;
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
  'Operational home My attention REST contract',
  () => {
    let database: IsolatedPostgresTestDatabase;
    let harness: PostgresRestTestHarness;
    let companyA = '';
    let ownerMembershipId = '';

    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      database = await createIsolatedPostgresTestDatabase({
        baseDatabaseUrl: databaseUrl,
        namePrefix: 'home_attention',
      });
      harness = await createPostgresRestTestHarness({
        databaseUrl: database.targetUrl,
        serverClock,
        environment: {
          NODE_ENV: 'test',
          ACCESS_IDENTITY_MODE: 'test',
          ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
          ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'attention-owner',
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
      clockSamples = 0;
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
        subject?: Member | 'attention-owner';
      } = {},
    ) {
      const {
        method = 'GET',
        value,
        company = companyA,
        subject = 'attention-owner',
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
    function grant(kind: Grant, target: string, company = companyA) {
      return command(assignments[kind], {
        workspaceMembershipId: target,
        companyId: company,
      });
    }
    async function revoke(kind: Grant, target: string, company = companyA) {
      const response = await request(
        `${assignments[kind]}/${target}/${company}`,
        { method: 'DELETE' },
      );
      expect(response.status).toBe(200);
    }
    async function member(subject: Member, grants: Grant[]) {
      const membershipId = text(
        object(await read('/access/current-actor', { subject, company: '' }))
          .workspaceMembershipId,
      );
      for (const kind of grants) await grant(kind, membershipId);
      return membershipId;
    }
    async function client(displayName: string, company = companyA) {
      return text(
        object(await command('/clients', { displayName }, { company })).id,
      );
    }
    async function project(
      title: string,
      clientAccountId: string,
      company = companyA,
    ) {
      return text(
        object(
          await command('/projects', { title, clientAccountId }, { company }),
        ).id,
      );
    }
    async function task(
      projectId: string,
      title: string,
      dueDate: string | null,
      options: {
        assignee?: string;
        company?: string;
        priority?: 'normal' | 'important' | 'critical';
      } = {},
    ) {
      const {
        assignee = ownerMembershipId,
        company = companyA,
        priority = 'normal',
      } = options;
      return text(
        object(
          await command(
            `/projects/${projectId}/tasks`,
            {
              title,
              dueDate,
              assigneeMembershipId: assignee,
              priority,
            },
            { company },
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
        await grant(kind, ownerMembershipId);
    }
    async function home(options: Parameters<typeof request>[1] = {}) {
      return object(await read('/operational-home', options));
    }

    it('returns only the reader open readable matches with exact rules, signed days, order and no side effects', async () => {
      await prepareReads();
      const colleague = await member('attention-colleague', [
        'context',
        'client',
        'project',
        'task',
      ]);
      const companyB = text(
        object(await command('/companies', { displayName: 'BIC' })).id,
      );
      for (const kind of ['project', 'task'] satisfies Grant[])
        await grant(kind, ownerMembershipId, companyB);
      const clientA = await client('GRUP Demo SA');
      const hiddenClient = await client('Arhivat Demo SRL');
      const clientB = await client('Doar BIC SRL', companyB);
      const projectA = await project('ISO 9001 — GRUP Demo SA', clientA);
      const hiddenProject = await project(
        'Arhivă — Arhivat Demo SRL',
        hiddenClient,
      );
      const projectB = await project(
        'ISO 22000 — Doar BIC SRL',
        clientB,
        companyB,
      );

      await task(projectA, 'Collect procedures', '2026-09-20');
      await task(projectA, 'Critical and overdue', '2026-09-26', {
        priority: 'critical',
      });
      const blocked = await task(projectA, 'Obtain client signature', null);
      await taskCommand(blocked, 'status', {
        status: 'blocked',
        reason: 'Waiting for the Client.',
      });
      await task(projectA, 'Approve audit plan', null, {
        priority: 'critical',
      });
      await task(projectA, 'Plan internal audit', '2026-09-27');
      await task(projectA, 'Send training invitations', '2026-10-04');
      await task(projectA, 'Order materials', '2026-10-05');
      const done = await task(projectA, 'Done and overdue', '2026-09-01');
      await taskCommand(done, 'complete', {});
      const cancelled = await task(
        projectA,
        'Cancelled and overdue',
        '2026-09-02',
      );
      await taskCommand(cancelled, 'cancel', { reason: 'No longer needed.' });
      await task(projectA, 'Colleague overdue', '2026-09-03', {
        assignee: colleague,
      });
      await task(hiddenProject, 'Unreadable overdue', '2026-09-04');
      await task(projectB, 'Other Company overdue', '2026-09-05', {
        company: companyB,
      });
      await harness.pool.query(
        "UPDATE client_company_relationships SET status='archived' WHERE client_account_id=$1 AND company_id=$2",
        [hiddenClient, companyA],
      );

      const tables = [
        'activity_log_events',
        'task_events',
        'task_commands',
        'tasks',
        'client_company_relationships',
      ];
      const snapshot = async () =>
        Object.fromEntries(
          await Promise.all(
            tables.map(async (table) => [
              table,
              Number(
                (
                  await harness.pool.query(
                    `SELECT count(*) AS count FROM ${table}`,
                  )
                ).rows[0]?.count,
              ),
            ]),
          ),
        );
      const before = await snapshot();
      const view = await home();
      expect(view.today).toBe('2026-09-27');
      const attention = object(view.attention);
      expect(attention.matchingCount).toBe(6);
      expect(
        objects(attention.tasks).map((row) => ({
          title: row.title,
          rules: row.rules,
          dueInDays: row.dueInDays,
          priority: row.priority,
          status: row.status,
          project: object(row.project).title,
          client: object(row.project).clientDisplayName,
        })),
      ).toEqual([
        {
          title: 'Collect procedures',
          rules: ['overdue'],
          dueInDays: -7,
          priority: 'normal',
          status: 'todo',
          project: 'ISO 9001 — GRUP Demo SA',
          client: 'GRUP Demo SA',
        },
        {
          title: 'Critical and overdue',
          rules: ['overdue', 'critical'],
          dueInDays: -1,
          priority: 'critical',
          status: 'todo',
          project: 'ISO 9001 — GRUP Demo SA',
          client: 'GRUP Demo SA',
        },
        {
          title: 'Approve audit plan',
          rules: ['critical'],
          dueInDays: null,
          priority: 'critical',
          status: 'todo',
          project: 'ISO 9001 — GRUP Demo SA',
          client: 'GRUP Demo SA',
        },
        {
          title: 'Obtain client signature',
          rules: ['blocked'],
          dueInDays: null,
          priority: 'normal',
          status: 'blocked',
          project: 'ISO 9001 — GRUP Demo SA',
          client: 'GRUP Demo SA',
        },
        {
          title: 'Plan internal audit',
          rules: ['due_soon'],
          dueInDays: 0,
          priority: 'normal',
          status: 'todo',
          project: 'ISO 9001 — GRUP Demo SA',
          client: 'GRUP Demo SA',
        },
        {
          title: 'Send training invitations',
          rules: ['due_soon'],
          dueInDays: 7,
          priority: 'normal',
          status: 'todo',
          project: 'ISO 9001 — GRUP Demo SA',
          client: 'GRUP Demo SA',
        },
      ]);
      expect(JSON.stringify(attention)).not.toMatch(
        /Order materials|Done and overdue|Cancelled and overdue|Colleague overdue|Unreadable overdue|Other Company overdue/u,
      );
      expect(await snapshot()).toEqual(before);
    });

    it('bounds eleven matches at ten and applies priority, creation and identifier tie-breaks', async () => {
      await prepareReads();
      const clientId = await client('Tie Client');
      const projectId = await project('Tie Project', clientId);
      await task(projectId, 'Excluded template', '2026-10-05');
      const rows = [
        [
          '00000000-0000-4000-8000-000000416001',
          'critical',
          '2026-09-19T08:00:00Z',
        ],
        [
          '00000000-0000-4000-8000-000000416002',
          'critical',
          '2026-09-19T09:00:00Z',
        ],
        [
          '00000000-0000-4000-8000-000000416003',
          'important',
          '2026-09-19T08:00:00Z',
        ],
        [
          '00000000-0000-4000-8000-000000416004',
          'important',
          '2026-09-19T09:00:00Z',
        ],
        [
          '00000000-0000-4000-8000-000000416005',
          'normal',
          '2026-09-19T08:00:00Z',
        ],
        [
          '00000000-0000-4000-8000-000000416006',
          'normal',
          '2026-09-19T08:00:00Z',
        ],
        [
          '00000000-0000-4000-8000-000000416007',
          'normal',
          '2026-09-19T09:00:00Z',
        ],
        [
          '00000000-0000-4000-8000-000000416008',
          'normal',
          '2026-09-19T10:00:00Z',
        ],
        [
          '00000000-0000-4000-8000-000000416009',
          'normal',
          '2026-09-19T11:00:00Z',
        ],
        [
          '00000000-0000-4000-8000-000000416010',
          'normal',
          '2026-09-19T12:00:00Z',
        ],
        [
          '00000000-0000-4000-8000-000000416011',
          'normal',
          '2026-09-19T13:00:00Z',
        ],
      ] satisfies ReadonlyArray<
        readonly [string, 'normal' | 'important' | 'critical', string]
      >;
      for (const [id, priority, createdAt] of rows)
        await harness.pool.query(
          `INSERT INTO tasks
          (id, workspace_id, company_id, project_id, client_account_id, title,
           assignee_membership_id, assignee_display_label, due_date, priority,
           created_by_internal_user_id, created_by_membership_id,
           created_by_display_name, created_at, updated_at)
         SELECT $2::uuid, workspace_id, company_id, project_id, client_account_id,
                $3, assignee_membership_id, assignee_display_label,
                DATE '2026-09-20', $4, created_by_internal_user_id,
                created_by_membership_id, created_by_display_name,
                $5::timestamptz, $5::timestamptz
         FROM tasks WHERE title='Excluded template' AND project_id=$1`,
          [projectId, id, `Tie ${id.slice(-3)}`, priority, createdAt],
        );

      const attention = object((await home()).attention);
      expect(attention.matchingCount).toBe(11);
      expect(objects(attention.tasks)).toHaveLength(10);
      expect(objects(attention.tasks).map((row) => row.id)).toEqual(
        rows.slice(0, 10).map(([id]) => id),
      );
    });

    it('omits attention without Task read and restores it only after live authority returns', async () => {
      await prepareReads();
      const clientId = await client('Access Client');
      const projectId = await project('Access Project', clientId);
      await task(projectId, 'Access overdue', '2026-09-20');
      const projectReader = await member('attention-projects', [
        'context',
        'client',
        'project',
      ]);

      expect(await home({ subject: 'attention-projects' })).not.toHaveProperty(
        'attention',
      );
      await revoke('task', ownerMembershipId);
      expect(await home()).not.toHaveProperty('attention');
      await grant('task', projectReader);
      expect(
        object((await home({ subject: 'attention-projects' })).attention)
          .matchingCount,
      ).toBe(0);
    });
    it('pages the complete attention set with every rule, full ordering and the unchanged Home prefix without writes', async () => {
      await prepareReads();
      const projectId = await project(
        'Complete attention Project',
        await client('Literal {Client} — Știință / Имя'),
      );
      const templateId = await task(
        projectId,
        'Excluded volume source',
        '2026-10-05',
      );
      const overdueIds: string[] = [];
      // Two microsecond groups have reversed identifier prefixes, with exact ties
      // inside each group. The second group spans the page boundary.
      for (let index = 0; index < 26; index++) {
        const id = `${index < 13 ? 'ffffffff-ffff-4fff-8fff' : '00000000-0000-4000-8000'}-${String(764000 + index).padStart(12, '0')}`;
        overdueIds.push(id);
        await harness.pool.query(
          `INSERT INTO tasks
          (id,workspace_id,company_id,project_id,client_account_id,title,
           assignee_membership_id,assignee_display_label,due_date,priority,
           created_by_internal_user_id,created_by_membership_id,created_by_display_name,
           created_at,updated_at)
          SELECT $1,workspace_id,company_id,project_id,client_account_id,$2,
           assignee_membership_id,assignee_display_label,DATE '2026-09-20',priority,
           created_by_internal_user_id,created_by_membership_id,created_by_display_name,
           date_trunc('milliseconds',created_at) + ($3::integer * interval '1 microsecond'),
           date_trunc('milliseconds',created_at) + ($3::integer * interval '1 microsecond') FROM tasks WHERE id=$4`,
          [
            id,
            `Overdue tie ${String(index).padStart(2, '0')}`,
            index < 13 ? 1 : 2,
            templateId,
          ],
        );
      }
      const allThree = await task(
        projectId,
        'Overdue critical blocked',
        '2026-09-20',
        { priority: 'critical' },
      );
      await taskCommand(allThree, 'status', {
        status: 'blocked',
        reason: 'Literal blocker',
      });
      const criticalToday = await task(
        projectId,
        'Critical due today',
        '2026-09-27',
        { priority: 'critical' },
      );
      const criticalLater = await task(
        projectId,
        'Critical beyond upcoming',
        '2026-11-01',
        { priority: 'critical' },
      );
      const criticalUndated = await task(projectId, 'Undated critical', null, {
        priority: 'critical',
      });
      const blockedLater = await task(
        projectId,
        'Blocked beyond upcoming',
        '2026-11-02',
      );
      await taskCommand(blockedLater, 'status', {
        status: 'blocked',
        reason: 'Waiting beyond seven days',
      });
      const blockedUndated = await task(projectId, 'Undated blocked', null);
      await taskCommand(blockedUndated, 'status', {
        status: 'blocked',
        reason: 'Waiting without a date',
      });
      const dueSoon = await task(
        projectId,
        'Inclusive seventh day',
        '2026-10-04',
      );
      // Known literal first-rule/date/priority/creation/id order, independent of
      // the implementation: overdue group, critical group, blocked group, due soon.
      const expectedIds = [
        allThree,
        ...overdueIds,
        criticalToday,
        criticalLater,
        criticalUndated,
        blockedLater,
        blockedUndated,
        dueSoon,
      ];
      const snapshot = async () =>
        Promise.all(
          [
            'activity_log_events',
            'task_events',
            'task_commands',
            'tasks',
            'client_accounts',
            'client_company_relationships',
          ].map(
            async (table) =>
              (
                await harness.pool.query(
                  `SELECT coalesce(jsonb_agg(to_jsonb(entry) ORDER BY to_jsonb(entry)::text),'[]'::jsonb) AS data FROM ${table} entry`,
                )
              ).rows,
          ),
        );
      const before = await snapshot();
      const first = object(await read('/attention-tasks'));
      const second = object(await read('/attention-tasks?offset=25'));
      expect(first).toMatchObject({
        companyId: companyA,
        today: '2026-09-27',
        total: 33,
        offset: 0,
        pageSize: 25,
      });
      expect(second).toMatchObject({
        companyId: companyA,
        today: '2026-09-27',
        total: 33,
        offset: 25,
        pageSize: 25,
      });
      const firstTasks = objects(first.tasks);
      const secondTasks = objects(second.tasks);
      expect(firstTasks.map((row) => row.id)).toEqual(expectedIds.slice(0, 25));
      expect(secondTasks.map((row) => row.id)).toEqual(expectedIds.slice(25));
      expect(
        new Set([...firstTasks, ...secondTasks].map((row) => row.id)).size,
      ).toBe(33);
      expect(firstTasks[0]).toMatchObject({
        title: 'Overdue critical blocked',
        rules: ['overdue', 'critical', 'blocked'],
        dueInDays: -7,
      });
      expect(
        secondTasks.slice(2).map((row) => ({
          title: row.title,
          rules: row.rules,
          dueInDays: row.dueInDays,
        })),
      ).toEqual([
        {
          title: 'Critical due today',
          rules: ['critical', 'due_soon'],
          dueInDays: 0,
        },
        {
          title: 'Critical beyond upcoming',
          rules: ['critical'],
          dueInDays: 35,
        },
        { title: 'Undated critical', rules: ['critical'], dueInDays: null },
        { title: 'Blocked beyond upcoming', rules: ['blocked'], dueInDays: 36 },
        { title: 'Undated blocked', rules: ['blocked'], dueInDays: null },
        { title: 'Inclusive seventh day', rules: ['due_soon'], dueInDays: 7 },
      ]);
      const preview = object((await home()).attention);
      expect(preview.matchingCount).toBe(33);
      expect(objects(preview.tasks)).toHaveLength(10);
      expect(firstTasks.slice(0, 10)).toEqual(objects(preview.tasks));
      expect(object(await read('/attention-tasks?offset=50'))).toMatchObject({
        total: 33,
        offset: 50,
        tasks: [],
      });
      const measured = await harness.measureApplicationQueries(() =>
        read('/attention-tasks?offset=25'),
      );
      expect(measured.queries.join('\n')).toContain('repeatable read');
      expect(await snapshot()).toEqual(before);
    });
    it('rejects unsupported offsets and foreign selections, and rechecks every live read prerequisite without counts', async () => {
      await prepareReads();
      const projectId = await project(
        'Authority Project',
        await client('Authority Client'),
      );
      const colleague = await member('attention-colleague', [
        'context',
        'client',
        'project',
        'task',
      ]);
      await task(projectId, 'Protected own attention', '2026-09-20', {
        assignee: colleague,
      });
      const scope = { subject: 'attention-colleague' } satisfies Parameters<
        typeof request
      >[1];
      const denied = async (
        options: Parameters<typeof request>[1],
        reason = 'current read prerequisites',
      ) => {
        const response = await request('/attention-tasks', options);
        expect(response.status, reason).toBe(403);
        const value = object(await body(response));
        expect(value).not.toHaveProperty('total');
        expect(value).not.toHaveProperty('tasks');
        expect(JSON.stringify(value)).not.toContain('Protected own attention');
      };
      expect(object(await read('/attention-tasks', scope)).total).toBe(1);
      for (const query of [
        'offset=-1',
        'offset=1.5',
        'offset=9007199254740992',
        'offset=1&offset=2',
        'offset[]=0',
        'offset=',
        'offset=1e2',
        'offset=+1',
        'scope=all',
        'assignee=x',
        'today=2026-09-27',
        'pageSize=100',
      ]) {
        const response = await request(`/attention-tasks?${query}`, scope);
        expect(response.status).toBe(400);
        expect(object(await body(response))).not.toHaveProperty('tasks');
      }
      expect(
        object(await read('/attention-tasks?offset=9007199254740991', scope)),
      ).toMatchObject({ total: 1, offset: 9007199254740991, tasks: [] });
      expect(
        (await fetch(`${harness.origin}/api/attention-tasks`)).status,
      ).toBe(401);
      const companyB = text(
        object(await command('/companies', { displayName: 'Foreign Company' }))
          .id,
      );
      await denied({ ...scope, company: '' });
      await denied({ ...scope, company: companyB });
      await denied({ ...scope, company: randomUUID() });
      for (const kind of ['task', 'project', 'client'] satisfies Grant[]) {
        await revoke(kind, colleague);
        await denied(scope, `revoked ${kind} read`);
        await grant(kind, colleague);
        expect(object(await read('/attention-tasks', scope)).total).toBe(1);
      }
      // Known Client/Project assignments independently retain Company context;
      // removing a redundant explicit context assignment does not revoke access.
      await revoke('context', colleague);
      expect(object(await read('/attention-tasks', scope)).total).toBe(1);
      await grant('context', colleague);
      await harness.pool.query(
        "UPDATE workspace_memberships SET status='inactive' WHERE id=$1",
        [colleague],
      );
      await denied(scope);
      await harness.pool.query(
        "UPDATE workspace_memberships SET status='active' WHERE id=$1",
        [colleague],
      );
      const actor = object(await read('/access/current-actor', scope));
      await harness.pool.query(
        "UPDATE internal_users SET status='inactive' WHERE id=$1",
        [text(actor.internalUserId)],
      );
      await denied(scope);
      await harness.pool.query(
        "UPDATE internal_users SET status='active' WHERE id=$1",
        [text(actor.internalUserId)],
      );
      await harness.pool.query(
        "UPDATE companies SET status='inactive' WHERE id=$1",
        [companyA],
      );
      await denied(scope);
    });

    it.each([
      { kind: 'task', version: null },
      { kind: 'task', version: 'v999' },
      { kind: 'project', version: null },
      { kind: 'project', version: 'v999' },
      { kind: 'client', version: null },
      { kind: 'client', version: 'v999' },
    ] satisfies Array<{ kind: Grant; version: string | null }>)(
      'fails closed for captured $kind read version $version',
      async ({ kind, version }) => {
        await prepareReads();
        const projectId = await project(
          'Captured authority',
          await client('Captured Client'),
        );
        const reader = await member('attention-colleague', [
          'context',
          'client',
          'project',
          'task',
        ]);
        await task(projectId, 'Captured attention', '2026-09-20', {
          assignee: reader,
        });
        const assignment = object(await grant(kind, reader));
        expect(
          object(
            await read('/attention-tasks', { subject: 'attention-colleague' }),
          ).total,
        ).toBe(1);
        const definition = text(
          (
            await harness.pool.query<{ definition: unknown }>(
              "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='company_role_assignments_permission_set_version_check'",
            )
          ).rows[0]?.definition,
        );
        // An isolated future-version fixture, using the established Task REST seam.
        await harness.pool.query(
          'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
        );
        try {
          await harness.pool.query(
            'UPDATE company_role_assignments SET permission_set_version=$1 WHERE id=$2',
            [version, text(assignment.id)],
          );
          const response = await request('/attention-tasks', {
            subject: 'attention-colleague',
          });
          expect(response.status).toBe(403);
          expect(object(await body(response))).not.toHaveProperty('total');
        } finally {
          await harness.pool.query(
            'UPDATE company_role_assignments SET permission_set_version=$1 WHERE id=$2',
            [text(assignment.permissionSetVersion), text(assignment.id)],
          );
          await harness.pool.query(
            `ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ${definition}`,
          );
        }
      },
    );

    it('reflects completion, reopening and reassignment while retaining closed Projects and hiding invalidated original relationships', async () => {
      await prepareReads();
      const colleague = await member('attention-colleague', [
        'context',
        'client',
        'project',
        'task',
      ]);
      const clientId = await client('Current original');
      const projectId = await project('Current Project', clientId);
      const first = await task(projectId, 'Current first', '2026-09-20');
      const second = await task(projectId, 'Current second', '2026-09-21');
      const unassigned = await task(
        projectId,
        'Unassigned attention candidate',
        '2026-09-22',
      );
      expect(
        (
          await request(`/tasks/${unassigned}`, {
            method: 'PATCH',
            value: { expectedVersion: 1, assigneeMembershipId: null },
          })
        ).status,
      ).toBe(200);
      const closedProject = await project('Completed Project', clientId);
      const preserved = await task(
        closedProject,
        'Preserved despite Project completion',
        null,
        { priority: 'critical' },
      );
      await harness.pool.query(
        "UPDATE projects SET status='completed',lifecycle_revision=1 WHERE id=$1",
        [closedProject],
      );
      const ids = async () =>
        objects(object(await read('/attention-tasks')).tasks).map(
          (row) => row.id,
        );
      expect(await ids()).toEqual([first, second, preserved]);
      await taskCommand(first, 'complete', {});
      expect(await ids()).toEqual([second, preserved]);
      await command(`/tasks/${first}/reopen`, { expectedVersion: 2 });
      expect(await ids()).toEqual([first, second, preserved]);
      const response = await request(`/tasks/${second}`, {
        method: 'PATCH',
        value: { expectedVersion: 1, assigneeMembershipId: colleague },
      });
      expect(response.status).toBe(200);
      expect(await ids()).toEqual([first, preserved]);
      expect(
        object(
          await read('/attention-tasks', { subject: 'attention-colleague' }),
        ).total,
      ).toBe(1);
      await taskCommand(first, 'cancel', { reason: 'No longer required' });
      expect(await ids()).toEqual([preserved]);
      await harness.pool.query(
        "UPDATE client_company_relationships SET status='archived' WHERE client_account_id=$1 AND company_id=$2",
        [clientId, companyA],
      );
      expect(await read('/attention-tasks')).toMatchObject({
        total: 0,
        tasks: [],
      });
    });

    it('uses one sampled Chisinau date per request and applies the new date on the next read', async () => {
      await prepareReads();
      const projectId = await project(
        'Calendar Project',
        await client('Calendar Client'),
      );
      const yesterday = await task(
        projectId,
        'Calendar original today',
        '2026-09-27',
      );
      const last = await task(
        projectId,
        'Calendar next inclusive end',
        '2026-10-05',
      );
      clockSamples = 0;
      expect(object(await read('/attention-tasks'))).toMatchObject({
        today: '2026-09-27',
        total: 1,
        tasks: [{ id: yesterday, rules: ['due_soon'], dueInDays: 0 }],
      });
      expect(clockSamples).toBe(1);
      serverInstant = '2026-09-27T21:30:00.000Z';
      clockSamples = 0;
      expect(object(await read('/attention-tasks'))).toMatchObject({
        today: '2026-09-28',
        total: 2,
        tasks: [
          { id: yesterday, rules: ['overdue'], dueInDays: -1 },
          { id: last, rules: ['due_soon'], dueInDays: 7 },
        ],
      });
      expect(clockSamples).toBe(1);
    });

    it('keeps authority, count and rows on one repeatable snapshot when an eligible Task changes before the count can run', async () => {
      await prepareReads();
      const projectId = await project(
        'Snapshot Project',
        await client('Snapshot Client'),
      );
      const taskId = await task(projectId, 'Snapshot eligible', '2026-09-20');
      const lock = await harness.pool.connect();
      let pendingRead: Promise<unknown> | undefined;
      let applicationQueries: readonly string[] = [];
      let blocker:
        | {
            pid: number;
            wait_event_type: string;
            wait_event: string;
            blockers: number[];
          }
        | undefined;
      try {
        await lock.query('BEGIN');
        const ownedPid = (
          await lock.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
        ).rows[0]?.pid;
        if (ownedPid === undefined)
          throw new Error('Expected owned barrier connection.');
        await lock.query('LOCK TABLE tasks IN ACCESS EXCLUSIVE MODE');
        pendingRead = harness
          .measureApplicationQueries(() => read('/attention-tasks'))
          .then((result) => {
            applicationQueries = result.queries;
            return result.value;
          });
        // Observe the real public request at the database lock boundary; no
        // private Task/Access collaborator is replaced or intercepted.
        await expect
          .poll(
            async () => {
              const result = await harness.pool.query<{
                pid: number;
                wait_event_type: string;
                wait_event: string;
                blockers: number[];
              }>(
                "SELECT pid,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid)) AND query ILIKE '%count%tasks%'",
                [ownedPid],
              );
              blocker = result.rows[0];
              return blocker?.wait_event_type;
            },
            { timeout: 5_000, interval: 25 },
          )
          .toBe('Lock');
        console.info(
          'ATTENTION_SNAPSHOT_WAIT',
          JSON.stringify({ ownedPid, blocker }),
        );
        await lock.query(
          "UPDATE tasks SET due_date=DATE '2026-11-01' WHERE id=$1",
          [taskId],
        );
        await lock.query('COMMIT');
        const inFlight = object(await pendingRead);
        const next = object(await read('/attention-tasks'));
        console.info(
          'ATTENTION_SNAPSHOT_RESULT',
          JSON.stringify({
            ownedPid,
            blocker,
            applicationQueries,
            inFlight,
            next,
          }),
        );
        expect(applicationQueries.join('\n')).toContain('repeatable read');
        expect(inFlight).toMatchObject({
          total: 1,
          tasks: [{ id: taskId, dueDate: '2026-09-20', rules: ['overdue'] }],
        });
        expect(next).toMatchObject({ total: 0, tasks: [] });
        // Named REST output is distinct from inherited pg-observations.jsonl.
        // The wait and result receipts above remain in the named REST log even
        // if a subsequent assertion fails; no observer output path is reused.
      } finally {
        await lock.query('ROLLBACK');
        lock.release();
        await pendingRead?.catch(() => undefined);
      }
    });
  },
);
