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
const serverClock: ServerClock = {
  now: () => new Date(OPERATIONAL_INSTANT),
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
  },
);
