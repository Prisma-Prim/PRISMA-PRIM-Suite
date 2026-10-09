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
const workspaceId = '00000000-0000-4000-8000-000000000398';
const assignments = {
  context: '/company-context-assignments',
  client: '/company-director-client-assignments',
  project: '/company-project-assignments',
  task: '/company-task-manager-assignments',
};
type Grant = keyof typeof assignments;
const members = [
  'home-colleague',
  'home-directory',
  'home-projects',
  'home-context',
  'home-tasks-only',
  'home-company-b',
] as const;
type Member = (typeof members)[number];

// Only the server clock boundary is replaced. At 21:30 UTC on 26 September it
// is already 27 September in Europe/Chisinau, while the UTC date is the 26th.
const OPERATIONAL_INSTANT = '2026-09-26T21:30:00.000Z';
let serverInstant = new Date(OPERATIONAL_INSTANT);
const serverClock: ServerClock = {
  now: () => new Date(serverInstant.getTime()),
};

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected an object.');
  return Object.fromEntries(Object.entries(value));
}
function string(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected a string.');
  return value;
}
function objects(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Expected an array.');
  const values: unknown[] = value;
  return values.map(object);
}
async function body(response: Response) {
  const value: unknown = await response.json();
  return value;
}

describe.skipIf(!databaseUrl)('Operational home REST contract', () => {
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let companyA: string;
  let ownerMembershipId: string;
  let fixture: Awaited<ReturnType<typeof seed>>;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'operational_home',
    });
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      serverClock,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'home-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Operational Home',
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
    serverInstant = new Date(OPERATIONAL_INSTANT);
    await harness.pool.query(
      'TRUNCATE activity_log_events, workspaces, internal_users CASCADE',
    );
    companyA = '';
    companyA = string(
      object(await command('/companies', { displayName: 'PRISMA-PRIM' })).id,
    );
    ownerMembershipId = string(
      object(await read('/access/current-actor')).workspaceMembershipId,
    );
    fixture = await seed();
  });

  function request(
    path: string,
    options: {
      method?: string;
      value?: unknown;
      company?: string;
      subject?: Member | 'home-owner';
      workspace?: string;
    } = {},
  ) {
    const {
      method = 'GET',
      value,
      company = companyA,
      subject = 'home-owner',
      workspace,
    } = options;
    return fetch(`${harness.origin}/api${path}`, {
      method,
      headers: {
        'x-test-external-provider': 'deterministic-test',
        'x-test-external-subject': subject,
        'x-test-display-name': subject === 'home-owner' ? 'Ana' : subject,
        'x-test-email': `${subject}@example.test`,
        ...(company ? { 'x-company-context-id': company } : {}),
        ...(workspace ? { 'x-workspace-context-id': workspace } : {}),
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
    const response = await request(path, { ...options, method: 'POST', value });
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
  async function member(subject: Member, grants: Grant[], company = companyA) {
    const actor = object(
      await read('/access/current-actor', { subject, company: '' }),
    );
    const id = string(actor.workspaceMembershipId);
    for (const kind of grants) await grant(kind, id, company);
    return id;
  }
  async function client(displayName: string, company = companyA) {
    return string(
      object(await command('/clients', { displayName }, { company })).id,
    );
  }
  async function project(
    title: string,
    clientAccountId: string,
    company = companyA,
  ) {
    return string(
      object(
        await command('/projects', { title, clientAccountId }, { company }),
      ).id,
    );
  }
  async function task(
    projectId: string,
    title: string,
    dueDate: string | null,
    options: { assignee?: string | null; company?: string } = {},
  ) {
    const { assignee = ownerMembershipId, company = companyA } = options;
    return string(
      object(
        await command(
          `/projects/${projectId}/tasks`,
          { title, dueDate, assigneeMembershipId: assignee },
          { company },
        ),
      ).id,
    );
  }
  async function taskCommand(
    id: string,
    action: 'complete' | 'reopen' | 'status' | 'cancel',
    value: Record<string, unknown>,
    company = companyA,
  ) {
    const version = object(
      object(await read(`/tasks/${id}`, { company })).task,
    ).version;
    await command(
      `/tasks/${id}/${action}`,
      { expectedVersion: version, ...value },
      { company },
    );
  }
  async function edit(id: string, value: Record<string, unknown>) {
    const version = object(object(await read(`/tasks/${id}`)).task).version;
    const response = await request(`/tasks/${id}`, {
      method: 'PATCH',
      value: { expectedVersion: version, ...value },
    });
    expect(response.status).toBe(200);
  }
  async function detail(id: string, company = companyA) {
    return object(object(await read(`/tasks/${id}`, { company })).task);
  }
  /** Supersedes one Client by uniting it into a canonical Client through REST. */
  async function unite(superseded: string, canonical: string) {
    // The public create path rejects duplicates. Reuse the Client suites'
    // historical-data fixture, then confirm the union through REST.
    await harness.pool.query(
      "UPDATE client_accounts SET tax_id='OPERATIONAL-HOME-398' WHERE id=ANY($1::uuid[])",
      [[superseded, canonical]],
    );
    const review = object(
      await command(`/clients/${superseded}/union-reviews`, {}),
    );
    expect(review.outcome).toBe('comparison');
    await command(
      `/client-union-reviews/${string(review.reviewReference)}/confirm`,
      {
        canonicalClientId: canonical,
        fields: {
          displayName: canonical,
          taxId: canonical,
          address: canonical,
          telephone: canonical,
          generalEmail: canonical,
          businessActivity: canonical,
        },
        companyIds: [companyA],
        reviewedDifferences: true,
        reason: 'Demo Vechi SRL was united into GRUP Demo SA.',
      },
    );
  }

  /**
   * Company A (PRISMA-PRIM) and Company B (BIC) with every case of
   * Operational Dashboard PRD §17.2 at the Chisinau date 2026-09-27.
   */
  async function seed() {
    for (const kind of ['client', 'project', 'task'] satisfies Grant[])
      await grant(kind, ownerMembershipId);
    const colleague = await member('home-colleague', [
      'context',
      'client',
      'project',
      'task',
    ]);
    const companyB = string(
      object(await command('/companies', { displayName: 'BIC' })).id,
    );
    for (const kind of ['project', 'task'] satisfies Grant[])
      await grant(kind, ownerMembershipId, companyB);

    const grup = await client('GRUP Demo SA');
    await client('Demo Logistic SRL');
    const shared = await client('Exemplu Consult SRL');
    const vechi = await client('Demo Vechi SRL');
    const archived = await client('Arhivat Demo SRL');
    const onlyB = await client('Doar BIC SRL', companyB);
    const sharedAttachment = await request(
      `/clients/${shared}/active-company-relationship`,
      { method: 'PUT', company: companyB },
    );
    expect(sharedAttachment.status).toBe(200);

    const iso = await project('ISO 9001 — GRUP Demo SA', grup);
    const historical = await project('Audit intern — Demo Vechi SRL', vechi);
    const unreadable = await project('Arhivă — Arhivat Demo SRL', archived);
    const projectB = await project('ISO 22000 — Doar BIC SRL', onlyB, companyB);

    const tasks = {
      inProgress: await task(iso, 'Collect procedures', '2026-09-20'),
      historical: await task(historical, 'Review old findings', '2026-09-21'),
      unassigned: await task(iso, 'Draft quality policy', '2026-09-23', {
        assignee: null,
      }),
      colleague: await task(iso, 'Interview process owners', '2026-09-24', {
        assignee: colleague,
      }),
      blocked: await task(iso, 'Draft quality manual', '2026-09-25'),
      chisinauOnly: await task(iso, 'Map the processes', '2026-09-26'),
      dueToday: await task(iso, 'Plan internal audit', '2026-09-27'),
      done: await task(iso, 'Old checklist', '2026-09-01'),
      cancelled: await task(iso, 'Abandoned checklist', '2026-09-02'),
      undated: await task(iso, 'Undated notes', null),
      unreadable: await task(unreadable, 'Archived notes', '2026-09-03'),
      otherCompany: await task(projectB, 'BIC notes', '2026-09-04', {
        company: companyB,
      }),
    };
    await taskCommand(tasks.inProgress, 'status', { status: 'in_progress' });
    await taskCommand(tasks.blocked, 'status', {
      status: 'blocked',
      reason: 'Waiting for the signed scope.',
    });
    await taskCommand(tasks.done, 'complete', {});
    await taskCommand(tasks.cancelled, 'cancel', {
      reason: 'Replaced by the new checklist.',
    });
    await unite(vechi, grup);
    await harness.pool.query(
      "UPDATE client_company_relationships SET status='archived' WHERE client_account_id=$1 AND company_id=$2",
      [archived, companyA],
    );
    return {
      companyB,
      colleague,
      projects: { iso, historical, projectB },
      tasks,
    };
  }
  function home(options: Parameters<typeof request>[1] = {}) {
    return read('/operational-home', options);
  }
  function overdue(options: Parameters<typeof request>[1] = {}) {
    return read('/overdue-tasks', options).then(object);
  }
  const labels = {
    iso: 'ISO 9001 — GRUP Demo SA',
    historical: 'Audit intern — Demo Vechi SRL',
  };

  it('counts the active Company records the reader can open at the Chisinau date of one server instant', async () => {
    const { companyB, projects, tasks } = fixture;

    expect(await home()).toMatchObject({
      companyId: companyA,
      today: '2026-09-27',
      summaries: [
        { kind: 'active_clients', count: 3 },
        { kind: 'open_projects', count: 2 },
        { kind: 'overdue_tasks', count: 6 },
      ],
    });

    const list = await overdue();
    expect(Object.keys(list)).toEqual(['companyId', 'today', 'total', 'tasks']);
    expect(list).toMatchObject({
      companyId: companyA,
      today: '2026-09-27',
      total: 6,
    });
    const iso = {
      id: projects.iso,
      title: labels.iso,
      clientDisplayName: 'GRUP Demo SA',
    };
    // A superseded original Client keeps its original label, as the list shows it.
    const historical = {
      id: projects.historical,
      title: labels.historical,
      clientDisplayName: 'Demo Vechi SRL',
    };
    expect(objects(list.tasks)).toEqual([
      { ...(await detail(tasks.inProgress)), project: iso, daysOverdue: 7 },
      {
        ...(await detail(tasks.historical)),
        project: historical,
        daysOverdue: 6,
      },
      { ...(await detail(tasks.unassigned)), project: iso, daysOverdue: 4 },
      { ...(await detail(tasks.colleague)), project: iso, daysOverdue: 3 },
      { ...(await detail(tasks.blocked)), project: iso, daysOverdue: 2 },
      { ...(await detail(tasks.chisinauOnly)), project: iso, daysOverdue: 1 },
    ]);
    const page = JSON.stringify(list);
    for (const hidden of [
      'Plan internal audit',
      'Old checklist',
      'Abandoned checklist',
      'Undated notes',
      'Archived notes',
      'BIC notes',
    ])
      expect(page).not.toContain(hidden);

    expect(await home({ company: companyB })).toMatchObject({
      companyId: companyB,
      today: '2026-09-27',
      summaries: [
        { kind: 'active_clients', count: 2 },
        { kind: 'open_projects', count: 1 },
        { kind: 'overdue_tasks', count: 1 },
      ],
    });
    const listB = await overdue({ company: companyB });
    expect(listB).toMatchObject({ companyId: companyB, total: 1 });
    expect(objects(listB.tasks).map((row) => row.id)).toEqual([
      tasks.otherCompany,
    ]);
  });

  it('uses the sampled date for every comparison and reflects Task changes on the next read', async () => {
    const { tasks } = fixture;
    const overdueCount = async () =>
      objects(object(await home()).summaries).find(
        (summary) => summary.kind === 'overdue_tasks',
      )?.count;

    // Still 26 September in Chisinau: the Task due on the 26th is not overdue.
    serverInstant = new Date('2026-09-26T20:59:59.000Z');
    expect(object(await home()).today).toBe('2026-09-26');
    expect(await overdueCount()).toBe(5);
    expect(object(await overdue()).today).toBe('2026-09-26');
    // 28 September in Chisinau: the Task due on the 27th becomes overdue.
    serverInstant = new Date('2026-09-27T21:00:00.000Z');
    expect(await overdueCount()).toBe(7);
    serverInstant = new Date(OPERATIONAL_INSTANT);

    await taskCommand(tasks.inProgress, 'complete', {});
    expect(await overdueCount()).toBe(5);
    await taskCommand(tasks.inProgress, 'reopen', {});
    expect(await overdueCount()).toBe(6);
    await edit(tasks.dueToday, { dueDate: '2026-09-10' });
    expect(await overdueCount()).toBe(7);
    await edit(tasks.chisinauOnly, { dueDate: null });
    expect(await overdueCount()).toBe(6);
    await taskCommand(tasks.unassigned, 'cancel', { reason: 'Not needed.' });
    expect(await overdueCount()).toBe(5);
    expect(object(await overdue()).total).toBe(5);
  });

  it('shows exactly the summaries whose owning read the reader holds, each equal to its drill-down', async () => {
    const { companyB, colleague } = fixture;
    const directory = await member('home-directory', ['client']);
    const projectsOnly = await member('home-projects', ['client', 'project']);
    await member('home-context', ['context']);
    await member('home-tasks-only', ['context', 'task']);
    await member('home-company-b', ['client', 'project', 'task'], companyB);

    async function summaries(
      subject: Member | 'home-owner',
      company = companyA,
    ) {
      const response = await request('/operational-home', {
        subject,
        company,
      });
      if (response.status !== 200) return response.status;
      const view = object(await body(response));
      expect(view.companyId).toBe(company);
      return Object.fromEntries(
        objects(view.summaries).map((entry) => [entry.kind, entry.count]),
      );
    }
    /** Each count equals its drill-down; an absent summary's drill-down is refused. */
    async function drillDowns(
      subject: Member | 'home-owner',
      company = companyA,
    ) {
      const options = { subject, company };
      const clients = await request('/clients', options);
      const projectList = await request('/projects', options);
      const overdueList = await request('/overdue-tasks', options);
      const counts: Record<string, unknown> = {};
      if (clients.status === 200)
        counts.active_clients = objects(await body(clients)).length;
      else expect(clients.status).toBe(403);
      if (projectList.status === 200)
        counts.open_projects = objects(await body(projectList)).filter(
          (row) => row.status === 'preparatory',
        ).length;
      else expect(projectList.status).toBe(403);
      if (overdueList.status === 200)
        counts.overdue_tasks = object(await body(overdueList)).total;
      else expect(overdueList.status).toBe(403);
      return counts;
    }

    const all = { active_clients: 3, open_projects: 2, overdue_tasks: 6 };
    const expectations: Array<
      [Member | 'home-owner', Record<string, number> | number]
    > = [
      ['home-owner', all],
      ['home-colleague', all],
      ['home-directory', { active_clients: 3 }],
      ['home-projects', { active_clients: 3, open_projects: 2 }],
      // Company Context Access and a Task assignment alone grant nothing.
      ['home-context', 403],
      ['home-tasks-only', 403],
    ];
    for (const [subject, expected] of expectations) {
      expect([subject, await summaries(subject)]).toEqual([subject, expected]);
      expect([subject, await drillDowns(subject)]).toEqual([
        subject,
        typeof expected === 'number' ? {} : expected,
      ]);
    }

    // A Company B reader never sees Company A records, and A is not its context.
    const inB = { active_clients: 2, open_projects: 1, overdue_tasks: 1 };
    expect(await summaries('home-company-b', companyB)).toEqual(inB);
    expect(await drillDowns('home-company-b', companyB)).toEqual(inB);
    expect(await summaries('home-company-b')).toBe(403);

    // Workspace client.manage reads the directory; ownership grants no more.
    for (const kind of ['project', 'task'] satisfies Grant[])
      await revoke(kind, ownerMembershipId);
    await revoke('client', ownerMembershipId);
    expect(await summaries('home-owner')).toEqual({ active_clients: 3 });
    expect(await drillDowns('home-owner')).toEqual({ active_clients: 3 });

    // A revoked Task Manager assignment removes the count on the next read.
    await revoke('task', colleague);
    expect(await summaries('home-colleague')).toEqual({
      active_clients: 3,
      open_projects: 2,
    });
    // Losing the Client read also removes the Project list read.
    await revoke('client', projectsOnly);
    expect(await summaries('home-projects')).toBe(403);
    await revoke('client', directory);
    expect(await summaries('home-directory')).toBe(403);

    // No active Company, an unknown Company or Workspace, or no identity.
    for (const options of [
      { company: '' },
      { company: randomUUID() },
      { workspace: randomUUID() },
    ])
      expect((await request('/operational-home', options)).status).toBe(403);
    expect((await fetch(`${harness.origin}/api/operational-home`)).status).toBe(
      401,
    );
  });

  it('orders the overdue list by due date, creation and identifier, bounds it at 100 rows and refuses exactly as My Tasks', async () => {
    const { projects, tasks } = fixture;
    // Equal due dates and creation times prove the creation and identifier
    // tie-breaks. 101 Tasks copy the scope and creator of an API-created Task.
    const tiedAt = '2026-09-02T08:00:00.000Z';
    await harness.pool.query(
      `INSERT INTO tasks (workspace_id, company_id, project_id, client_account_id, title, assignee_membership_id, assignee_display_label, due_date, created_by_internal_user_id, created_by_membership_id, created_by_display_name, created_at, updated_at)
       SELECT t.workspace_id, t.company_id, t.project_id, t.client_account_id, 'Tied notes ' || n, NULL, NULL, DATE '2026-09-19', t.created_by_internal_user_id, t.created_by_membership_id, t.created_by_display_name, $2::timestamptz + (CASE WHEN n = 1 THEN interval '1 hour' ELSE interval '0' END), $2::timestamptz
       FROM tasks t, generate_series(1, 101) AS n
       WHERE t.id = $1`,
      [tasks.inProgress, tiedAt],
    );
    const tied = await harness.pool.query<{ id: string; title: string }>(
      `SELECT id::text AS id, title FROM tasks WHERE title LIKE 'Tied notes %'
       ORDER BY created_at, id`,
    );
    const list = await overdue();
    expect(list.total).toBe(107);
    const rows = objects(list.tasks);
    expect(rows).toHaveLength(100);
    // The 101 Tasks due 2026-09-19 come first: the 100 created at the tied
    // instant by identifier, then the later-created one; the rest follow.
    expect(rows.map((row) => row.id)).toEqual(
      tied.rows.map((row) => row.id).slice(0, 100),
    );
    expect(rows.every((row) => row.daysOverdue === 8)).toBe(true);
    expect(rows.every((row) => row.assignee === null)).toBe(true);
    expect(
      rows.every(
        (row) =>
          object(row.project).id === projects.iso && row.status === 'todo',
      ),
    ).toBe(true);
    expect(object(await home()).summaries).toContainEqual({
      kind: 'overdue_tasks',
      count: 107,
    });

    for (const path of ['/operational-home', '/overdue-tasks'])
      for (const query of [
        'limit=10',
        `companyId=${companyA}`,
        'today=2026-01-01',
        'unknown',
      ])
        expect([
          path,
          query,
          (await request(`${path}?${query}`)).status,
        ]).toEqual([path, query, 400]);

    await member('home-projects', ['client', 'project']);
    await member('home-tasks-only', ['context', 'task']);
    const outcome = async (response: Response): Promise<[number, string]> => [
      response.status,
      await response.text(),
    ];
    const refusals: Parameters<typeof request>[1][] = [
      { company: '' },
      { company: randomUUID() },
      { workspace: randomUUID() },
      { subject: 'home-projects' },
      { subject: 'home-tasks-only' },
    ];
    for (const options of refusals) {
      const assigned = await outcome(await request('/assigned-tasks', options));
      expect(assigned[0]).toBe(403);
      expect(await outcome(await request('/overdue-tasks', options))).toEqual(
        assigned,
      );
    }
    const anonymous = (path: string) =>
      fetch(`${harness.origin}/api${path}`).then(outcome);
    expect(await anonymous('/overdue-tasks')).toEqual(
      await anonymous('/assigned-tasks'),
    );
  });

  it('writes no Activity Log event, command receipt, version or Client fence advance', async () => {
    const { companyB } = fixture;
    const tables = [
      'activity_log_events',
      'task_events',
      'task_commands',
      'tasks',
      'projects',
      'project_creation_events',
      'project_responsibility_commands',
      'project_responsibility_events',
      'client_accounts',
      'client_company_relationships',
      'client_union_operations',
      'company_role_assignments',
    ];
    const snapshot = async () =>
      Object.fromEntries(
        await Promise.all(
          tables.map(async (table) => [
            table,
            (
              await harness.pool.query(
                `SELECT to_jsonb(t)::text AS row FROM ${table} t ORDER BY 1`,
              )
            ).rows,
          ]),
        ),
      );
    const before = await snapshot();
    await home();
    await overdue();
    await home({ company: companyB });
    await overdue({ company: companyB });
    expect((await request('/operational-home', { company: '' })).status).toBe(
      403,
    );
    expect((await request('/overdue-tasks', { company: '' })).status).toBe(403);
    expect(await snapshot()).toEqual(before);
  });
});
