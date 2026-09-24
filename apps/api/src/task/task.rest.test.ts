import { randomUUID } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AccountabilityService } from '../accountability/accountability.service.js';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const workspaceId = '00000000-0000-4000-8000-000000000246';
const assignments = {
  context: '/company-context-assignments',
  client: '/company-director-client-assignments',
  project: '/company-project-assignments',
  document: '/company-document-registrar-assignments',
  task: '/company-task-manager-assignments',
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
function integer(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new Error('Expected an integer.');
  return value;
}
function objects(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Expected an array.');
  const values: unknown[] = value;
  return values.map(object);
}
async function body(response: Response) {
  const value: unknown = await response.json();
  return object(value);
}

describe.skipIf(!databaseUrl)('Manual preparation Task REST contract', () => {
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let companyId: string;
  let clientId: string;
  let projectId: string;
  let membershipId: string;
  let internalUserId: string;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'manual_tasks',
    });
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'task-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Manual Tasks',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
          ['task-member', 'task-ineligible', 'task-inactive'].map(
            (subject) => ({
              provider: 'deterministic-test',
              subject,
              workspaceId,
            }),
          ),
        ),
      },
    });
  });
  afterAll(async () => {
    await harness?.close();
    await database?.close();
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    await harness.pool.query('TRUNCATE workspaces, internal_users CASCADE');
    companyId = '';
    companyId = string(
      (await command('/companies', { displayName: 'PRISMA-PRIM' })).id,
    );
    const actor = await read('/access/current-actor');
    membershipId = string(actor.workspaceMembershipId);
    internalUserId = string(actor.internalUserId);
    await grant('client');
    await grant('project');
    clientId = string(
      (await command('/clients', { displayName: 'Synthetic Client' })).id,
    );
    projectId = string(
      (
        await command('/projects', {
          title: 'ISO preparation',
          clientAccountId: clientId,
        })
      ).id,
    );
  });

  function request(
    path: string,
    options: {
      method?: string;
      value?: unknown;
      key?: string | null;
      company?: string;
      subject?: string;
      workspace?: string;
    } = {},
  ) {
    const {
      method = 'GET',
      value,
      key = randomUUID(),
      company = companyId,
      subject = 'task-owner',
      workspace,
    } = options;
    return fetch(`${harness.origin}/api${path}`, {
      method,
      headers: {
        'x-test-external-provider': 'deterministic-test',
        'x-test-external-subject': subject,
        'x-test-display-name':
          subject === 'task-owner' ? 'Task Manager' : subject,
        'x-test-email': `${subject}@example.test`,
        ...(company ? { 'x-company-context-id': company } : {}),
        ...(workspace ? { 'x-workspace-context-id': workspace } : {}),
        ...(key === null ? {} : { 'idempotency-key': key }),
        'content-type': 'application/json',
      },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    });
  }
  async function read(
    path: string,
    options: Parameters<typeof request>[1] = {},
  ) {
    const response = await request(path, options);
    expect(response.status).toBe(200);
    return body(response);
  }
  async function command(
    path: string,
    value: unknown,
    options: Parameters<typeof request>[1] = {},
  ) {
    const response = await request(path, { ...options, method: 'POST', value });
    expect(response.status).toBe(201);
    return body(response);
  }
  function grant(
    kind: keyof typeof assignments,
    target = membershipId,
    company = companyId,
  ) {
    return command(assignments[kind], {
      workspaceMembershipId: target,
      companyId: company,
    });
  }
  async function revoke(kind: keyof typeof assignments, target = membershipId) {
    const response = await request(
      `${assignments[kind]}/${target}/${companyId}`,
      { method: 'DELETE' },
    );
    expect(response.status).toBe(200);
    return body(response);
  }
  async function member(subject = 'task-member', eligible = false) {
    const actor = await read('/access/current-actor', { subject, company: '' });
    const id = string(actor.workspaceMembershipId);
    if (eligible) {
      for (const kind of [
        'context',
        'client',
        'project',
        'task',
      ] satisfies Array<keyof typeof assignments>)
        await grant(kind, id);
    }
    return actor;
  }
  function create(
    value: unknown = { title: 'Collect preparation notes' },
    options: Parameters<typeof request>[1] = {},
  ) {
    return command(`/projects/${projectId}/tasks`, value, options);
  }
  async function edit(
    id: string,
    value: unknown,
    options: Parameters<typeof request>[1] = {},
  ) {
    const response = await request(`/tasks/${id}`, {
      ...options,
      method: 'PATCH',
      value,
    });
    expect(response.status).toBe(200);
    return body(response);
  }
  function transition(
    id: string,
    action: 'complete' | 'reopen',
    expectedVersion: number,
    options: Parameters<typeof request>[1] = {},
  ) {
    return request(`/tasks/${id}/${action}`, {
      ...options,
      method: 'POST',
      value: { expectedVersion },
    });
  }
  async function detail(
    id: string,
    options: Parameters<typeof request>[1] = {},
  ) {
    return object((await read(`/tasks/${id}`, options)).task);
  }
  async function history(
    id: string,
    options: Parameters<typeof request>[1] = {},
  ) {
    return objects((await read(`/tasks/${id}/history`, options)).events);
  }
  async function taskEvents(options: Parameters<typeof request>[1] = {}) {
    return objects((await read('/activity-log', options)).events).filter(
      (event) =>
        typeof event.action === 'string' && event.action.startsWith('task.'),
    );
  }
  async function assigned(options: Parameters<typeof request>[1] = {}) {
    const page = await read('/assigned-tasks', options);
    expect(Object.keys(page)).toEqual(['tasks']);
    return objects(page.tasks);
  }
  async function assertUnchanged(
    id: string,
    task: Record<string, unknown>,
    events: Record<string, unknown>[],
  ) {
    expect(await detail(id)).toEqual(task);
    expect(await history(id)).toEqual(events);
  }
  /** The original Client version is its reversal fence. */
  async function clientVersion() {
    const result = await harness.pool.query<{ version: unknown }>(
      'SELECT version FROM client_accounts WHERE id=$1',
      [clientId],
    );
    return integer(result.rows[0]?.version);
  }
  async function commandCount() {
    const result = await harness.pool.query<{ count: unknown }>(
      'SELECT count(*)::int AS count FROM task_commands',
    );
    return integer(result.rows[0]?.count);
  }
  async function withUnsupportedPermissionVersion(
    assignment: Record<string, unknown>,
    version: string | null,
    work: () => Promise<void>,
  ) {
    // Current migrations prevent unsupported versions. Temporarily admit this
    // future-version fixture in this isolated database to prove fail-closed reads.
    const result = await harness.pool.query<{ definition: unknown }>(
      "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='company_role_assignments_permission_set_version_check'",
    );
    const definition = string(result.rows[0]?.definition);
    await harness.pool.query(
      'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
    );
    try {
      await harness.pool.query(
        'UPDATE company_role_assignments SET permission_set_version=$1 WHERE id=$2',
        [version, string(assignment.id)],
      );
      await work();
    } finally {
      await harness.pool.query(
        'UPDATE company_role_assignments SET permission_set_version=$1 WHERE id=$2',
        [string(assignment.permissionSetVersion), string(assignment.id)],
      );
      await harness.pool.query(
        `ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ${definition}`,
      );
    }
  }

  it('requires an explicit grant, then creates, edits, completes and reopens with immutable attributable history', async () => {
    await grant('document');
    expect(
      object((await read('/access/current-actor')).activeCompany)
        .taskPermissions ?? [],
    ).toEqual([]);
    expect((await request(`/projects/${projectId}/tasks`)).status).toBe(403);
    expect(
      (
        await request(`/projects/${projectId}/tasks`, {
          method: 'POST',
          value: { title: 'Denied' },
        })
      ).status,
    ).toBe(403);
    expect(await grant('task')).toMatchObject({
      bundle: 'Company Task Manager',
      permissionSetVersion: 'v1',
    });
    const actor = {
      internalUserId,
      workspaceMembershipId: membershipId,
      displayName: 'Task Manager',
    };
    const created = await create({ title: '  Collect preparation notes  ' });
    const id = string(created.id);
    expect(created).toMatchObject({
      companyId,
      projectId,
      clientAccountId: clientId,
      title: 'Collect preparation notes',
      status: 'todo',
      assignee: null,
      dueDate: null,
      completion: null,
      version: 1,
      createdBy: actor,
    });
    expect(Number.isNaN(Date.parse(string(created.createdAt)))).toBe(false);
    expect(await read(`/projects/${projectId}/tasks`)).toEqual({
      mutable: true,
      tasks: [created],
    });
    expect(await detail(id)).toEqual(created);
    const target = await member('task-member', true);
    const assignee = object(
      objects(
        (await read(`/projects/${projectId}/eligible-task-assignees`)).members,
      ).find(
        (entry) => entry.workspaceMembershipId === target.workspaceMembershipId,
      ),
    );
    const changed = await edit(id, {
      expectedVersion: 1,
      title: 'Collect revised notes',
      assigneeMembershipId: string(assignee.workspaceMembershipId),
      dueDate: '2024-02-29',
    });
    expect(changed).toMatchObject({
      title: 'Collect revised notes',
      assignee,
      dueDate: '2024-02-29',
      version: 2,
    });
    const firstComplete = await transition(id, 'complete', 2);
    expect(firstComplete.status).toBe(201);
    const completed = await body(firstComplete);
    expect(completed).toMatchObject({
      status: 'done',
      version: 3,
      completion: { actor },
    });
    expect(
      Number.isNaN(Date.parse(string(object(completed.completion).occurredAt))),
    ).toBe(false);
    const firstHistory = await history(id);
    expect((await transition(id, 'reopen', 3)).status).toBe(201);
    expect(await detail(id)).toMatchObject({
      ...changed,
      status: 'todo',
      completion: null,
      version: 4,
      updatedAt: expect.any(String),
    });
    expect((await transition(id, 'complete', 4)).status).toBe(201);
    const events = await history(id);
    expect(events.slice(0, 3)).toEqual(firstHistory);
    expect(events.map((event) => event.action)).toEqual([
      'task.created',
      'task.updated',
      'task.completed',
      'task.reopened',
      'task.completed',
    ]);
    expect(events.map((event) => object(event.metadata).version)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(events[0]).toMatchObject({
      metadata: {
        version: 1,
        initial: {
          title: 'Collect preparation notes',
          assignee: null,
          dueDate: null,
        },
      },
    });
    expect(events[1]).toMatchObject({
      metadata: {
        version: 2,
        changes: {
          title: {
            before: 'Collect preparation notes',
            after: 'Collect revised notes',
          },
          assignee: { before: null, after: assignee },
          dueDate: { before: null, after: '2024-02-29' },
        },
      },
    });
    expect(events[2]).toMatchObject({
      occurredAt: object(completed.completion).occurredAt,
      metadata: { version: 3, before: 'todo', after: 'done' },
    });
    expect(events[3]).toMatchObject({
      metadata: { version: 4, before: 'done', after: 'todo' },
    });
    for (const event of events) {
      expect(event).toMatchObject({
        actor,
        target: {
          type: 'task',
          taskId: id,
          taskTitle: 'Collect revised notes',
          companyId,
        },
      });
      expect(Number.isNaN(Date.parse(string(event.occurredAt)))).toBe(false);
    }
    expect(await taskEvents()).toEqual(expect.arrayContaining(events));
    expect(await read(`/projects/${projectId}`)).toMatchObject({
      status: 'preparatory',
      companyId,
      clientAccountId: clientId,
    });
    expect(
      (
        await request(`/tasks/${id}/history/${string(object(events[0]).id)}`, {
          method: 'DELETE',
        })
      ).status,
    ).toBe(404);
    expect(await history(id)).toEqual(events);
  });

  it('grants exactly Task permissions without Company, Project, Client or administration authority and records idempotent administration', async () => {
    const target = await member();
    const targetId = string(target.workspaceMembershipId);
    const value = { companyId, workspaceMembershipId: targetId };
    const key = randomUUID();
    const granted = await command(assignments.task, value, { key });
    expect(await command(assignments.task, value, { key })).toEqual(granted);
    expect(
      (await request('/access/current-actor', { subject: 'task-member' }))
        .status,
    ).toBe(403);
    await grant('context', targetId);
    const current = await read('/access/current-actor', {
      subject: 'task-member',
    });
    expect(object(current.activeCompany)).toMatchObject({
      taskPermissions: ['task.read', 'task.manage'],
      clientPermissions: [],
    });
    expect(object(current.activeCompany).projectPermissions ?? []).toEqual([]);
    expect(
      (
        await request(`/projects/${projectId}/tasks`, {
          subject: 'task-member',
        })
      ).status,
    ).toBe(403);
    for (const method of ['POST', 'DELETE'])
      expect(
        (
          await request(
            method === 'POST'
              ? assignments.task
              : `${assignments.task}/${targetId}/${companyId}`,
            {
              method,
              subject: 'task-member',
              ...(method === 'POST' ? { value } : {}),
            },
          )
        ).status,
      ).toBe(403);
    const revokeKey = randomUUID();
    const revokePath = `${assignments.task}/${targetId}/${companyId}`;
    const revoked = await request(revokePath, {
      method: 'DELETE',
      key: revokeKey,
    });
    expect(revoked.status).toBe(200);
    expect(
      await body(
        await request(revokePath, { method: 'DELETE', key: revokeKey }),
      ),
    ).toEqual(await body(revoked));
    const events = objects((await read('/activity-log')).events).filter(
      (event) =>
        typeof event.action === 'string' &&
        event.action.startsWith('company_task_manager_assignment.'),
    );
    expect(events.map((event) => event.action).sort()).toEqual([
      'company_task_manager_assignment.granted',
      'company_task_manager_assignment.revoked',
    ]);
    for (const event of events)
      expect(event).toMatchObject({ actor: { internalUserId } });
  });

  it.each([null, 'v999'])(
    'fails closed for a captured Task permission version of %s',
    async (version) => {
      const assignment = await grant('task');
      const task = await create();
      const id = string(task.id);
      await withUnsupportedPermissionVersion(assignment, version, async () => {
        const actor = await read('/access/current-actor');
        expect(object(actor.activeCompany).taskPermissions ?? []).toEqual([]);
        for (const path of [
          `/projects/${projectId}/tasks`,
          `/projects/${projectId}/eligible-task-assignees`,
          `/tasks/${id}`,
          `/tasks/${id}/history`,
        ])
          expect((await request(path)).status).toBe(403);
        expect(await taskEvents()).toEqual([]);
      });
    },
  );

  it('filters eligible assignees without directory fields and rejects every directly submitted ineligible identifier identically', async () => {
    await grant('task');
    const eligible = await member('task-member', true);
    const denied = await member('task-ineligible');
    const inactive = await member('task-inactive', true);
    await harness.pool.query(
      "UPDATE internal_users SET status='inactive' WHERE id=$1",
      [inactive.internalUserId],
    );
    const page = await read(`/projects/${projectId}/eligible-task-assignees`);
    expect(Object.keys(page)).toEqual(['members']);
    const members = objects(page.members);
    expect(members).toEqual(
      expect.arrayContaining([
        {
          workspaceMembershipId: membershipId,
          displayLabel: expect.stringContaining('Task Manager'),
        },
        {
          workspaceMembershipId: eligible.workspaceMembershipId,
          displayLabel: expect.stringContaining('task-member'),
        },
      ]),
    );
    expect(members).toHaveLength(2);
    expect(
      await read(`/projects/${projectId}/eligible-task-assignees`, {
        subject: 'task-member',
      }),
    ).toEqual(page);
    expect(JSON.stringify(page)).not.toContain('@');
    expect(JSON.stringify(page)).not.toContain(denied.workspaceMembershipId);
    expect(JSON.stringify(page)).not.toContain(inactive.workspaceMembershipId);
    const responses = [];
    for (const assigneeMembershipId of [
      randomUUID(),
      denied.workspaceMembershipId,
      inactive.workspaceMembershipId,
    ]) {
      const response = await request(`/projects/${projectId}/tasks`, {
        method: 'POST',
        value: { title: 'Denied assignment', assigneeMembershipId },
      });
      expect(response.status).toBe(400);
      responses.push(await body(response));
    }
    expect(responses[1]).toEqual(responses[0]);
    expect(responses[2]).toEqual(responses[0]);
    expect(await read(`/projects/${projectId}/tasks`)).toEqual({
      mutable: true,
      tasks: [],
    });
    expect(await taskEvents()).toEqual([]);
    const created = await create();
    const events = await history(string(created.id));
    expect(
      (
        await request(`/tasks/${string(created.id)}`, {
          method: 'PATCH',
          value: {
            expectedVersion: 1,
            assigneeMembershipId: denied.workspaceMembershipId,
          },
        })
      ).status,
    ).toBe(400);
    await assertUnchanged(string(created.id), created, events);
  });

  it.each(['project', 'client', 'task'] satisfies Array<
    keyof typeof assignments
  >)(
    'removes an assignee after %s revocation while preserving historical attribution and permitting reassignment',
    async (kind) => {
      await grant('task');
      const target = await member('task-member', true);
      const targetId = string(target.workspaceMembershipId);
      const created = await create({
        title: 'Assigned notes',
        assigneeMembershipId: targetId,
      });
      const id = string(created.id);
      const before = await history(id);
      await revoke(kind, targetId);
      expect(
        objects(
          (await read(`/projects/${projectId}/eligible-task-assignees`))
            .members,
        ).map((entry) => entry.workspaceMembershipId),
      ).not.toContain(targetId);
      await assertUnchanged(id, created, before);
      expect(
        (await request(`/tasks/${id}`, { subject: 'task-member' })).status,
      ).toBe(403);
      expect(
        (await request(`/tasks/${id}/history`, { subject: 'task-member' }))
          .status,
      ).toBe(403);
      const cleared = await edit(id, {
        expectedVersion: 1,
        assigneeMembershipId: null,
      });
      expect(cleared).toMatchObject({ assignee: null, version: 2 });
      expect((await history(id))[0]).toEqual(before[0]);
      expect((await history(id))[1]).toMatchObject({
        metadata: {
          changes: { assignee: { before: created.assignee, after: null } },
        },
      });
    },
  );

  it.each(['project', 'client', 'task'] satisfies Array<
    keyof typeof assignments
  >)(
    'evaluates the assignee captured %s version instead of the bundle label',
    async (kind) => {
      await grant('task');
      const target = await member('task-member', true);
      const targetId = string(target.workspaceMembershipId);
      const assignment = await grant(kind, targetId);
      await withUnsupportedPermissionVersion(assignment, 'v999', async () => {
        const page = await read(
          `/projects/${projectId}/eligible-task-assignees`,
        );
        expect(
          objects(page.members).map((entry) => entry.workspaceMembershipId),
        ).not.toContain(targetId);
        expect(
          (
            await request(`/projects/${projectId}/tasks`, {
              method: 'POST',
              value: {
                title: 'Unavailable responsible member',
                assigneeMembershipId: targetId,
              },
            })
          ).status,
        ).toBe(400);
        expect(await taskEvents()).toEqual([]);
      });
    },
  );

  it.each([
    '0001-01-01',
    '0099-12-31',
    '1900-02-28',
    '2000-02-29',
    '2024-02-29',
    '9999-12-31',
  ])(
    'round-trips the exact calendar date %s without timezone conversion',
    async (dueDate) => {
      await grant('task');
      const created = await create({ title: 'Calendar notes', dueDate });
      expect(created.dueDate).toBe(dueDate);
      expect((await detail(string(created.id))).dueDate).toBe(dueDate);
      expect(
        await edit(string(created.id), { expectedVersion: 1, dueDate: null }),
      ).toMatchObject({ dueDate: null, version: 2 });
    },
  );

  it('rejects malformed dates, versions, titles and caller-controlled fields without creating success history', async () => {
    await grant('task');
    for (const dueDate of [
      '0000-01-01',
      '10000-01-01',
      '2023-02-29',
      '1900-02-29',
      '2024-04-31',
      '2024-00-01',
      '2024-13-01',
      '2024-01-00',
      '2024-1-01',
      '2024-01-1',
      '2024-01-01T00:00:00Z',
      ' 2024-01-01',
      '',
      20240101,
    ])
      expect(
        (
          await request(`/projects/${projectId}/tasks`, {
            method: 'POST',
            value: { title: 'Invalid date', dueDate },
          })
        ).status,
      ).toBe(400);
    for (const title of ['', ' ', 'x'.repeat(201), null, 7])
      expect(
        (
          await request(`/projects/${projectId}/tasks`, {
            method: 'POST',
            value: { title },
          })
        ).status,
      ).toBe(400);
    const controlled = {
      id: randomUUID(),
      workspaceId,
      companyId,
      projectId,
      clientAccountId: clientId,
      status: 'done',
      version: 1,
      createdBy: {},
      createdAt: '2020-01-01',
      updatedAt: '2020-01-01',
      completion: {},
      description: 'Out of scope',
    };
    for (const [field, value] of Object.entries(controlled))
      expect(
        (
          await request(`/projects/${projectId}/tasks`, {
            method: 'POST',
            value: { title: 'Ownership injection', [field]: value },
          })
        ).status,
      ).toBe(400);
    for (const value of [
      null,
      [],
      {},
      { title: 'Valid', assigneeMembershipId: 123 },
    ])
      expect(
        (
          await request(`/projects/${projectId}/tasks`, {
            method: 'POST',
            value,
          })
        ).status,
      ).toBe(400);
    expect(
      (
        await request(`/projects/${projectId}/tasks`, {
          method: 'POST',
          key: null,
          value: { title: 'Missing key' },
        })
      ).status,
    ).toBe(400);
    expect(await read(`/projects/${projectId}/tasks`)).toEqual({
      mutable: true,
      tasks: [],
    });
    expect(await taskEvents()).toEqual([]);
    const task = await create({ title: 'x'.repeat(200) });
    const id = string(task.id);
    const events = await history(id);
    for (const expectedVersion of [
      undefined,
      null,
      0,
      -1,
      1.5,
      '1',
      Number.MAX_SAFE_INTEGER + 1,
    ])
      expect(
        (
          await request(`/tasks/${id}`, {
            method: 'PATCH',
            value: { title: 'Rejected edit', expectedVersion },
          })
        ).status,
      ).toBe(400);
    for (const [field, value] of Object.entries(controlled))
      expect(
        (
          await request(`/tasks/${id}`, {
            method: 'PATCH',
            value: { expectedVersion: 1, [field]: value },
          })
        ).status,
      ).toBe(400);
    for (const action of ['complete', 'reopen'] satisfies Array<
      'complete' | 'reopen'
    >) {
      expect((await transition(id, action, 1, { key: null })).status).toBe(400);
      expect((await transition(id, action, -1)).status).toBe(400);
      expect(
        (
          await request(`/tasks/${id}/${action}`, {
            method: 'POST',
            value: { expectedVersion: 1, status: 'done' },
          })
        ).status,
      ).toBe(400);
    }
    expect(
      (
        await request(`/tasks/${id}`, {
          method: 'PATCH',
          value: { expectedVersion: 1, dueDate: '2023-02-29' },
        })
      ).status,
    ).toBe(400);
    await assertUnchanged(id, task, events);
  });

  it('checks state and observed version before normalized no-op edits and refuses repeated transitions', async () => {
    await grant('task');
    const created = await create();
    const id = string(created.id);
    const before = await history(id);
    expect(
      await edit(id, {
        expectedVersion: 1,
        title: '  Collect preparation notes  ',
        assigneeMembershipId: null,
        dueDate: null,
      }),
    ).toEqual(created);
    await assertUnchanged(id, created, before);
    expect((await transition(id, 'reopen', 1)).status).toBe(409);
    expect((await transition(id, 'complete', 1)).status).toBe(201);
    const completed = await detail(id);
    const events = await history(id);
    for (const response of [
      await transition(id, 'complete', 2),
      await transition(id, 'reopen', 1),
      await request(`/tasks/${id}`, {
        method: 'PATCH',
        value: { expectedVersion: 2, title: created.title },
      }),
      await request(`/tasks/${id}`, {
        method: 'PATCH',
        value: { expectedVersion: 1, title: 'Stale edit' },
      }),
    ])
      expect(response.status).toBe(409);
    await assertUnchanged(id, completed, events);
    expect((await transition(id, 'reopen', 2)).status).toBe(201);
    expect(
      (
        await request(`/tasks/${id}`, {
          method: 'PATCH',
          value: { expectedVersion: 1, title: created.title },
        })
      ).status,
    ).toBe(409);
    expect((await request(`/tasks/${id}`, { method: 'DELETE' })).status).toBe(
      404,
    );
  });

  it('collapses concurrent exact retries and replays recorded results before checking their old expected version', async () => {
    await grant('task');
    const createKey = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 4 }, () =>
        create({ title: '  Retry notes  ' }, { key: createKey }),
      ),
    );
    const created = object(responses[0]);
    expect(responses).toEqual([created, created, created, created]);
    const id = string(created.id);
    const editKey = randomUUID();
    const edits = await Promise.all(
      Array.from({ length: 4 }, () =>
        edit(id, { expectedVersion: 1, title: 'Retry edit' }, { key: editKey }),
      ),
    );
    const edited = object(edits[0]);
    expect(edits).toEqual([edited, edited, edited, edited]);
    const completeKey = randomUUID();
    const completions = await Promise.all(
      Array.from({ length: 4 }, () =>
        transition(id, 'complete', 2, { key: completeKey }),
      ),
    );
    expect(completions.map((response) => response.status)).toEqual([
      201, 201, 201, 201,
    ]);
    const [firstCompletion, ...otherCompletions] = completions;
    if (!firstCompletion) throw new Error('Expected completion responses.');
    const completed = await body(firstCompletion);
    expect(await Promise.all(otherCompletions.map(body))).toEqual([
      completed,
      completed,
      completed,
    ]);
    expect((await transition(id, 'reopen', 3)).status).toBe(201);
    const current = await detail(id);
    const events = await history(id);
    expect(
      await create(
        { title: 'Retry notes', assigneeMembershipId: null, dueDate: null },
        { key: createKey },
      ),
    ).toEqual(created);
    expect(
      await edit(
        id,
        { expectedVersion: 1, title: 'Retry edit' },
        { key: editKey },
      ),
    ).toEqual(edited);
    const replay = await transition(id, 'complete', 2, { key: completeKey });
    expect(replay.status).toBe(201);
    expect(await body(replay)).toEqual(completed);
    await assertUnchanged(id, current, events);
    expect(events).toHaveLength(4);
    expect(
      objects((await read(`/projects/${projectId}/tasks`)).tasks),
    ).toHaveLength(1);
  });

  it('binds retry keys to normalized input, action, target, expected version and Company', async () => {
    await grant('task');
    const key = randomUUID();
    const created = await create({ title: 'Bound command' }, { key });
    const id = string(created.id);
    const other = await create({ title: 'Second Task' });
    const otherProject = await command('/projects', {
      title: 'Second Project',
      clientAccountId: clientId,
    });
    const otherCompany = string(
      (await command('/companies', { displayName: 'BIC' })).id,
    );
    await grant('task', membershipId, otherCompany);
    await grant('project', membershipId, otherCompany);
    const otherClient = await command(
      '/clients',
      { displayName: 'Second Company Client' },
      { company: otherCompany },
    );
    const otherCompanyProject = await command(
      '/projects',
      {
        title: 'Second Company Project',
        clientAccountId: string(otherClient.id),
      },
      { company: otherCompany },
    );
    for (const response of [
      await request(`/projects/${projectId}/tasks`, {
        method: 'POST',
        key,
        value: { title: 'Different input' },
      }),
      await request(`/projects/${string(otherProject.id)}/tasks`, {
        method: 'POST',
        key,
        value: { title: 'Bound command' },
      }),
      await request(`/projects/${string(otherCompanyProject.id)}/tasks`, {
        method: 'POST',
        key,
        company: otherCompany,
        value: { title: 'Bound command' },
      }),
      await transition(id, 'complete', 1, { key }),
    ])
      expect(response.status).toBe(409);
    const editKey = randomUUID();
    await edit(
      id,
      { expectedVersion: 1, title: 'Bound edit' },
      { key: editKey },
    );
    for (const value of [
      { expectedVersion: 2, title: 'Bound edit' },
      { expectedVersion: 1, title: 'Different edit' },
    ])
      expect(
        (
          await request(`/tasks/${id}`, {
            method: 'PATCH',
            key: editKey,
            value,
          })
        ).status,
      ).toBe(409);
    expect(
      (
        await request(`/tasks/${string(other.id)}`, {
          method: 'PATCH',
          key: editKey,
          value: { expectedVersion: 1, title: 'Bound edit' },
        })
      ).status,
    ).toBe(409);
    expect(await history(id)).toHaveLength(2);
    expect(await history(string(other.id))).toHaveLength(1);
  });

  it('scopes the same key independently to each authorized actor', async () => {
    await grant('task');
    await member('task-member', true);
    const key = randomUUID();
    const first = await create({ title: 'First actor' }, { key });
    const second = await create(
      { title: 'Second actor' },
      { key, subject: 'task-member' },
    );
    expect(first.id).not.toBe(second.id);
    expect(
      objects((await read(`/projects/${projectId}/tasks`)).tasks),
    ).toHaveLength(2);
    expect(await taskEvents()).toHaveLength(2);
  });

  it('permits only one of competing edits or completion from one observed version', async () => {
    await grant('task');
    const created = await create();
    const id = string(created.id);
    const responses = await Promise.all([
      request(`/tasks/${id}`, {
        method: 'PATCH',
        value: { expectedVersion: 1, title: 'First contender' },
      }),
      request(`/tasks/${id}`, {
        method: 'PATCH',
        value: { expectedVersion: 1, title: 'Second contender' },
      }),
      transition(id, 'complete', 1),
    ]);
    expect(
      responses.filter(
        (response) => response.status === 200 || response.status === 201,
      ),
    ).toHaveLength(1);
    expect(
      responses.filter((response) => response.status === 409),
    ).toHaveLength(2);
    expect((await detail(id)).version).toBe(2);
    expect(await history(id)).toHaveLength(2);
    expect((await read(`/projects/${projectId}`)).status).toBe('preparatory');
  });

  it('hides Task and Project identifiers across Company and Workspace contexts and refuses missing identity', async () => {
    await grant('task');
    const created = await create();
    const id = string(created.id);
    const otherCompany = string(
      (await command('/companies', { displayName: 'BIC' })).id,
    );
    await grant('task', membershipId, otherCompany);
    await grant('project', membershipId, otherCompany);
    const missing = await request(`/tasks/${randomUUID()}`);
    expect(missing.status).toBe(404);
    const missingBody = await body(missing);
    for (const path of [
      `/tasks/${id}`,
      `/tasks/${id}/history`,
      `/projects/${projectId}/tasks`,
      `/projects/${projectId}/eligible-task-assignees`,
    ]) {
      const response = await request(path, { company: otherCompany });
      expect(response.status).toBe(404);
      expect(await body(response)).toEqual(missingBody);
    }
    expect(await taskEvents({ company: otherCompany })).toEqual([]);
    expect(
      (await request(`/tasks/${id}`, { workspace: randomUUID() })).status,
    ).toBe(403);
    expect(
      (await request(`/tasks/${id}`, { company: randomUUID() })).status,
    ).toBe(403);
    expect((await fetch(`${harness.origin}/api/tasks/${id}`)).status).toBe(401);
  });

  it.each(['task', 'project', 'client'] satisfies Array<
    keyof typeof assignments
  >)(
    'revalidates %s authority on read, write and committed replay',
    async (kind) => {
      await grant('task');
      const actor = await member('task-member', true);
      const key = randomUUID();
      const created = await create(
        { title: 'Member declaration' },
        { key, subject: 'task-member' },
      );
      const id = string(created.id);
      const events = await history(id);
      await revoke(kind, string(actor.workspaceMembershipId));
      for (const response of [
        await request(`/tasks/${id}`, { subject: 'task-member' }),
        await request(`/tasks/${id}/history`, { subject: 'task-member' }),
        await request(`/projects/${projectId}/tasks`, {
          method: 'POST',
          key,
          subject: 'task-member',
          value: { title: 'Member declaration' },
        }),
        await transition(id, 'complete', 1, { subject: 'task-member' }),
      ])
        expect(response.status).toBe(403);
      expect(await taskEvents({ subject: 'task-member' })).toEqual([]);
      await assertUnchanged(id, created, events);
    },
  );

  it.each(['revocation', 'suspension'])(
    'serializes completion against actor %s and denies all later replay',
    async (change) => {
      await grant('task');
      const target = await member('task-member', true);
      const targetId = string(target.workspaceMembershipId);
      const task = await create();
      const id = string(task.id);
      const key = randomUUID();
      const [mutation, authorityChange] = await Promise.all([
        transition(id, 'complete', 1, { key, subject: 'task-member' }),
        change === 'revocation'
          ? request(`${assignments.task}/${targetId}/${companyId}`, {
              method: 'DELETE',
            })
          : request('/workspace-membership-suspensions', {
              method: 'POST',
              value: { workspaceMembershipId: targetId },
            }),
      ]);
      expect(authorityChange.status).toBe(change === 'revocation' ? 200 : 201);
      expect([201, 403]).toContain(mutation.status);
      const committed = mutation.status === 201;
      expect(await detail(id)).toMatchObject({
        status: committed ? 'done' : 'todo',
        version: committed ? 2 : 1,
      });
      expect(await history(id)).toHaveLength(committed ? 2 : 1);
      expect(
        (await transition(id, 'complete', 1, { key, subject: 'task-member' }))
          .status,
      ).toBe(403);
      expect(
        (await request(`/tasks/${id}/history`, { subject: 'task-member' }))
          .status,
      ).toBe(403);
    },
  );

  it('denies a suspended actor including replay while retaining the original Task actor and assignee', async () => {
    await grant('task');
    const actor = await member('task-member', true);
    const target = string(actor.workspaceMembershipId);
    const key = randomUUID();
    const created = await create(
      { title: 'Historical member', assigneeMembershipId: target },
      { key, subject: 'task-member' },
    );
    const id = string(created.id);
    const events = await history(id);
    await command('/workspace-membership-suspensions', {
      workspaceMembershipId: target,
    });
    expect(
      (await request(`/tasks/${id}`, { subject: 'task-member' })).status,
    ).toBe(403);
    expect(
      (
        await request(`/projects/${projectId}/tasks`, {
          method: 'POST',
          key,
          subject: 'task-member',
          value: { title: 'Historical member', assigneeMembershipId: target },
        })
      ).status,
    ).toBe(403);
    await assertUnchanged(id, created, events);
    expect(
      objects(
        (await read(`/projects/${projectId}/eligible-task-assignees`)).members,
      ).map((entry) => entry.workspaceMembershipId),
    ).not.toContain(target);
    expect(
      await edit(id, { expectedVersion: 1, assigneeMembershipId: null }),
    ).toMatchObject({
      version: 2,
      assignee: null,
      createdBy: created.createdBy,
    });
  });

  it.each(['client', 'relationship'])(
    'hides reads, history, new commands and replays after original %s archival',
    async (scope) => {
      await grant('task');
      const key = randomUUID();
      const created = await create({ title: 'Archived boundary' }, { key });
      const id = string(created.id);
      if (scope === 'client')
        await harness.pool.query(
          "UPDATE client_accounts SET status='archived' WHERE id=$1",
          [clientId],
        );
      else
        await harness.pool.query(
          "UPDATE client_company_relationships SET status='archived' WHERE client_account_id=$1 AND company_id=$2",
          [clientId, companyId],
        );
      for (const response of [
        await request(`/tasks/${id}`),
        await request(`/tasks/${id}/history`),
        await request(`/projects/${projectId}/tasks`),
        await request(`/projects/${projectId}/eligible-task-assignees`),
        await transition(id, 'complete', 1),
        await request(`/projects/${projectId}/tasks`, {
          method: 'POST',
          key,
          value: { title: 'Archived boundary' },
        }),
      ]) {
        expect(response.status).toBe(404);
        expect(await response.text()).not.toContain(id);
      }
      expect(await taskEvents()).toEqual([]);
    },
  );

  async function unionSetup(
    supersedeOriginal = false,
    secondDisplayName = false,
  ) {
    const second = string(
      (await command('/clients', { displayName: 'Legacy synthetic identity' }))
        .id,
    );
    // The public create path rejects duplicates. Reuse the Client suite's
    // historical-data fixture, then exercise union and reversal through REST.
    await harness.pool.query(
      "UPDATE client_accounts SET tax_id='MANUAL-TASK-246' WHERE id=ANY($1::uuid[])",
      [[clientId, second]],
    );
    const review = await command(`/clients/${clientId}/union-reviews`, {});
    expect(review.outcome).toBe('comparison');
    const value = {
      canonicalClientId: supersedeOriginal ? second : clientId,
      fields: {
        displayName: secondDisplayName ? second : clientId,
        taxId: clientId,
        address: clientId,
        telephone: clientId,
        generalEmail: clientId,
        businessActivity: clientId,
      },
      companyIds: [companyId],
      reviewedDifferences: true,
      reason: 'Legacy duplicate identity.',
    };
    return {
      second,
      confirm: () =>
        command(
          `/client-union-reviews/${string(review.reviewReference)}/confirm`,
          value,
        ),
    };
  }
  function reverse(reference: string) {
    return request(`/client-union-operations/${reference}/reversal`, {
      method: 'POST',
      value: { companyIds: [companyId], reason: 'Reverse synthetic union.' },
    });
  }

  it('keeps superseded originals readable with immutable links, rejects new operations and permits historical replay without blocking reversal', async () => {
    await grant('task');
    const key = randomUUID();
    const created = await create({ title: 'Original notes' }, { key });
    const id = string(created.id);
    const events = await history(id);
    const union = await (await unionSetup(true)).confirm();
    expect(await read(`/projects/${projectId}/tasks`)).toEqual({
      mutable: false,
      tasks: [created],
    });
    expect(await read(`/tasks/${id}`)).toEqual({
      mutable: false,
      task: created,
    });
    expect(await history(id)).toEqual(events);
    expect(await taskEvents()).toEqual(events);
    for (const response of [
      await request(`/projects/${projectId}/tasks`, {
        method: 'POST',
        value: { title: 'New forbidden notes' },
      }),
      await request(`/tasks/${id}`, {
        method: 'PATCH',
        value: { expectedVersion: 1, title: 'Forbidden edit' },
      }),
      await transition(id, 'complete', 1),
    ])
      expect(response.status).toBe(404);
    expect(await create({ title: 'Original notes' }, { key })).toEqual(created);
    expect((await reverse(string(union.projectionReference))).status).toBe(201);
    expect(await read(`/tasks/${id}`)).toEqual({
      mutable: true,
      task: created,
    });
    expect(await history(id)).toEqual(events);
    expect(await read(`/projects/${projectId}`)).toMatchObject({
      clientAccountId: clientId,
      companyId,
      status: 'preparatory',
    });
  });

  it.each(['create', 'edit', 'complete', 'reopen'] satisfies Array<
    'create' | 'edit' | 'complete' | 'reopen'
  >)(
    'blocks union reversal after one new active-original Task %s',
    async (action) => {
      await grant('task');
      const created = await create();
      const id = string(created.id);
      if (action === 'reopen')
        expect((await transition(id, 'complete', 1)).status).toBe(201);
      const union = await (await unionSetup()).confirm();
      if (action === 'create') await create({ title: 'Post-union notes' });
      else if (action === 'edit')
        await edit(id, { expectedVersion: 1, title: 'Post-union correction' });
      else
        expect(
          (await transition(id, action, action === 'reopen' ? 2 : 1)).status,
        ).toBe(201);
      expect((await reverse(string(union.projectionReference))).status).toBe(
        409,
      );
      expect(await detail(id)).toMatchObject({
        clientAccountId: clientId,
        companyId,
        projectId,
      });
    },
  );

  it('allows reversal after reads, normalized no-ops, invalid commands and exact create/edit/transition replays', async () => {
    await grant('task');
    const createKey = randomUUID();
    const editKey = randomUUID();
    const completeKey = randomUUID();
    const reopenKey = randomUUID();
    const created = await create(
      { title: 'Retry original' },
      { key: createKey },
    );
    const id = string(created.id);
    const edited = await edit(
      id,
      { expectedVersion: 1, title: 'Retry updated' },
      { key: editKey },
    );
    const completedResponse = await transition(id, 'complete', 2, {
      key: completeKey,
    });
    expect(completedResponse.status).toBe(201);
    const completed = await body(completedResponse);
    const reopenedResponse = await transition(id, 'reopen', 3, {
      key: reopenKey,
    });
    expect(reopenedResponse.status).toBe(201);
    const reopened = await body(reopenedResponse);
    const events = await history(id);
    const union = await (await unionSetup()).confirm();
    expect(
      await create({ title: 'Retry original' }, { key: createKey }),
    ).toEqual(created);
    expect(
      await edit(
        id,
        { expectedVersion: 1, title: 'Retry updated' },
        { key: editKey },
      ),
    ).toEqual(edited);
    expect(
      await body(await transition(id, 'complete', 2, { key: completeKey })),
    ).toEqual(completed);
    expect(
      await body(await transition(id, 'reopen', 3, { key: reopenKey })),
    ).toEqual(reopened);
    const noopKey = randomUUID();
    const noop = {
      expectedVersion: 4,
      title: '  Retry updated  ',
      assigneeMembershipId: null,
      dueDate: null,
    };
    expect(await edit(id, noop, { key: noopKey })).toEqual(reopened);
    expect(await edit(id, noop, { key: noopKey })).toEqual(reopened);
    expect((await transition(id, 'reopen', 4)).status).toBe(409);
    expect((await transition(id, 'complete', 1)).status).toBe(409);
    await assertUnchanged(id, reopened, events);
    expect((await reverse(string(union.projectionReference))).status).toBe(201);
    await assertUnchanged(id, reopened, events);
  });

  it.each(['create', 'edit', 'complete', 'reopen'] satisfies Array<
    'create' | 'edit' | 'complete' | 'reopen'
  >)(
    'rolls back Task %s and its retry outcome when Accountability cannot commit',
    async (action) => {
      await grant('task');
      const existing = await create();
      const id = string(existing.id);
      if (action === 'reopen')
        expect((await transition(id, 'complete', 1)).status).toBe(201);
      const before = await detail(id);
      const events = await history(id);
      const union = await (await unionSetup()).confirm();
      const key = randomUUID();
      const mutate = () =>
        action === 'create'
          ? request(`/projects/${projectId}/tasks`, {
              method: 'POST',
              key,
              value: { title: 'Atomic notes' },
            })
          : action === 'edit'
            ? request(`/tasks/${id}`, {
                method: 'PATCH',
                key,
                value: {
                  expectedVersion: integer(before.version),
                  title: 'Atomic edit',
                },
              })
            : transition(id, action, integer(before.version), { key });
      const failure = vi
        .spyOn(AccountabilityService.prototype, 'recordTaskEvent')
        .mockRejectedValueOnce(new Error('Injected Accountability failure.'));
      try {
        expect((await mutate()).status).toBe(500);
      } finally {
        failure.mockRestore();
      }
      await assertUnchanged(id, before, events);
      expect(
        objects((await read(`/projects/${projectId}/tasks`)).tasks),
      ).toHaveLength(1);
      expect((await reverse(string(union.projectionReference))).status).toBe(
        201,
      );
      expect((await mutate()).status).toBe(action === 'edit' ? 200 : 201);
      expect(await taskEvents()).toHaveLength(events.length + 1);
    },
  );

  it('serializes a material Task write against reversal and retains the original ownership', async () => {
    await grant('task');
    const created = await create();
    const id = string(created.id);
    const union = await (await unionSetup()).confirm();
    const [mutation, reversal] = await Promise.all([
      transition(id, 'complete', 1),
      reverse(string(union.projectionReference)),
    ]);
    expect(mutation.status).toBe(201);
    expect([201, 409]).toContain(reversal.status);
    expect(await detail(id)).toMatchObject({
      status: 'done',
      version: 2,
      projectId,
      companyId,
      clientAccountId: clientId,
    });
    expect(await history(id)).toHaveLength(2);
    if (reversal.status === 409)
      expect((await reverse(string(union.projectionReference))).status).toBe(
        409,
      );
  });

  it('lists only the actor open Tasks of readable active-Company Projects by exact due date, creation and identifier', async () => {
    await grant('task');
    const colleague = string(
      (await member('task-member', true)).workspaceMembershipId,
    );
    const secondClient = string(
      (await command('/clients', { displayName: 'Second Synthetic Client' }))
        .id,
    );
    const secondProjectId = string(
      (
        await command('/projects', {
          title: 'Audit preparation',
          clientAccountId: secondClient,
        })
      ).id,
    );
    const archivedClient = string(
      (await command('/clients', { displayName: 'Archived Synthetic Client' }))
        .id,
    );
    const archivedProjectId = string(
      (
        await command('/projects', {
          title: 'Archived preparation',
          clientAccountId: archivedClient,
        })
      ).id,
    );
    const first = {
      id: projectId,
      title: 'ISO preparation',
      clientDisplayName: 'Synthetic Client',
    };
    const second = {
      id: secondProjectId,
      title: 'Audit preparation',
      clientDisplayName: 'Second Synthetic Client',
    };
    const assign = (
      project: string,
      title: string,
      dueDate: string | null,
      assigneeMembershipId: string | null = membershipId,
      options: Parameters<typeof request>[1] = {},
    ) =>
      command(
        `/projects/${project}/tasks`,
        { title, dueDate, assigneeMembershipId },
        options,
      );
    const october = await assign(projectId, 'October notes', '2026-10-05');
    const september = await assign(
      secondProjectId,
      'September notes',
      '2026-09-30',
    );
    const sameDay = await assign(projectId, 'Same day notes', '2026-09-30');
    const early = await assign(projectId, 'Early notes', '0099-12-31');
    const done = await assign(projectId, 'Done notes', '2026-09-01');
    expect((await transition(string(done.id), 'complete', 1)).status).toBe(201);
    const colleagueTask = await assign(
      projectId,
      'Colleague notes',
      '2026-09-01',
      colleague,
    );
    await assign(secondProjectId, 'Unassigned notes', '2026-09-01', null);
    await assign(archivedProjectId, 'Unreadable notes', '2026-09-01');
    await harness.pool.query(
      "UPDATE client_company_relationships SET status='archived' WHERE client_account_id=$1 AND company_id=$2",
      [archivedClient, companyId],
    );
    const otherCompany = string(
      (await command('/companies', { displayName: 'BIC' })).id,
    );
    await grant('task', membershipId, otherCompany);
    await grant('project', membershipId, otherCompany);
    const otherClient = await command(
      '/clients',
      { displayName: 'Other Company Client' },
      { company: otherCompany },
    );
    const otherProject = await command(
      '/projects',
      {
        title: 'Other Company preparation',
        clientAccountId: string(otherClient.id),
      },
      { company: otherCompany },
    );
    const otherTask = await assign(
      string(otherProject.id),
      'Other Company notes',
      '2026-09-01',
      membershipId,
      { company: otherCompany },
    );
    // Equal creation times prove the final identifier tie-break. Task creation
    // attribution is immutable, so both undated Tasks are inserted at one
    // instant, each copying the scope, assignee, creator and creation event of
    // an API-created Task in the same Project.
    const tiedAt = '2026-09-02T08:00:00.000Z';
    const tiedTasks = await harness.pool.query<{ id: unknown }>(
      `WITH fixture(template_id, title) AS (
         VALUES ($2::uuid, 'Undated notes'), ($3::uuid, 'Tied undated notes')
       ), inserted AS (
         INSERT INTO tasks (workspace_id, company_id, project_id, client_account_id, title, assignee_membership_id, assignee_display_label, created_by_internal_user_id, created_by_membership_id, created_by_display_name, created_at, updated_at)
         SELECT t.workspace_id, t.company_id, t.project_id, t.client_account_id, f.title, t.assignee_membership_id, t.assignee_display_label, t.created_by_internal_user_id, t.created_by_membership_id, t.created_by_display_name, $1::timestamptz, $1::timestamptz
         FROM fixture f JOIN tasks t ON t.id = f.template_id
         RETURNING id, workspace_id, company_id, title, created_at
       )
       INSERT INTO task_events (workspace_id, company_id, task_id, version, actor_internal_user_id, actor_membership_id, actor_display_name, occurred_at, meaning)
       SELECT i.workspace_id, i.company_id, i.id, 1, e.actor_internal_user_id, e.actor_membership_id, e.actor_display_name, i.created_at,
         jsonb_set(jsonb_set(e.meaning, '{metadata,initial,title}', to_jsonb(i.title)), '{metadata,initial,dueDate}', 'null'::jsonb)
       FROM inserted i
       JOIN fixture f ON f.title = i.title
       JOIN task_events e ON e.task_id = f.template_id AND e.version = 1
       RETURNING task_id AS id`,
      [tiedAt, string(october.id), string(september.id)],
    );
    const undatedRows = (
      await Promise.all(tiedTasks.rows.map(({ id }) => detail(string(id))))
    )
      .sort((left, right) => (string(left.id) < string(right.id) ? -1 : 1))
      .map((task) => ({
        ...task,
        createdAt: tiedAt,
        project: task.projectId === projectId ? first : second,
      }));
    const eventsBefore = await taskEvents();

    expect(await assigned()).toEqual([
      { ...early, project: first },
      { ...september, project: second },
      { ...sameDay, project: first },
      { ...october, project: first },
      ...undatedRows,
    ]);
    const page = JSON.stringify(await read('/assigned-tasks'));
    for (const hidden of [
      'Done notes',
      'Colleague notes',
      'Unassigned notes',
      'Unreadable notes',
      'Other Company notes',
      colleague,
    ])
      expect(page).not.toContain(hidden);
    expect(await assigned({ company: otherCompany })).toEqual([
      {
        ...otherTask,
        project: {
          id: string(otherProject.id),
          title: 'Other Company preparation',
          clientDisplayName: 'Other Company Client',
        },
      },
    ]);
    expect(await assigned({ subject: 'task-member' })).toEqual([
      { ...colleagueTask, project: first },
    ]);
    expect(await taskEvents()).toEqual(eventsBefore);
  });

  it('reflects completion, reopening, reassignment and a cleared assignee on the next read', async () => {
    await grant('task');
    const colleague = string(
      (await member('task-member', true)).workspaceMembershipId,
    );
    const project = {
      id: projectId,
      title: 'ISO preparation',
      clientDisplayName: 'Synthetic Client',
    };
    const created = await create({
      title: 'Moving notes',
      assigneeMembershipId: membershipId,
    });
    const id = string(created.id);
    expect(await assigned()).toEqual([{ ...created, project }]);
    expect((await transition(id, 'complete', 1)).status).toBe(201);
    expect(await assigned()).toEqual([]);
    expect((await transition(id, 'reopen', 2)).status).toBe(201);
    expect(await assigned()).toEqual([{ ...(await detail(id)), project }]);
    await edit(id, { expectedVersion: 3, assigneeMembershipId: colleague });
    expect(await assigned()).toEqual([]);
    expect(await assigned({ subject: 'task-member' })).toEqual([
      { ...(await detail(id)), project },
    ]);
    await edit(id, { expectedVersion: 4, assigneeMembershipId: membershipId });
    expect(await assigned()).toEqual([{ ...(await detail(id)), project }]);
    await edit(id, { expectedVersion: 5, assigneeMembershipId: null });
    expect(await assigned()).toEqual([]);
    expect(await assigned({ subject: 'task-member' })).toEqual([]);
  });

  it.each(['task', 'project', 'client', 'suspension'] satisfies Array<
    Exclude<keyof typeof assignments, 'context' | 'document'> | 'suspension'
  >)('denies the assignee own open Tasks after %s loss', async (change) => {
    await grant('task');
    const actor = await member('task-member', true);
    const target = string(actor.workspaceMembershipId);
    await create({ title: 'Member notes', assigneeMembershipId: target });
    expect(await assigned({ subject: 'task-member' })).toHaveLength(1);
    if (change === 'suspension')
      await command('/workspace-membership-suspensions', {
        workspaceMembershipId: target,
      });
    else await revoke(change, target);
    const response = await request('/assigned-tasks', {
      subject: 'task-member',
    });
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain('Member notes');
  });

  it('requires captured Task Manager authority and a Company context and rejects query input', async () => {
    // The Workspace Owner holds Project and Client access, but no Task Manager grant.
    expect((await request('/assigned-tasks')).status).toBe(403);
    const target = string(
      (await member('task-ineligible')).workspaceMembershipId,
    );
    for (const kind of ['context', 'client', 'project'] satisfies Array<
      keyof typeof assignments
    >)
      await grant(kind, target);
    expect(
      (await request('/assigned-tasks', { subject: 'task-ineligible' })).status,
    ).toBe(403);
    const assignment = await grant('task');
    await create({ title: 'Owner notes', assigneeMembershipId: membershipId });
    expect(await assigned()).toHaveLength(1);
    for (const options of [
      { company: '' },
      { company: randomUUID() },
      { workspace: randomUUID() },
    ])
      expect((await request('/assigned-tasks', options)).status).toBe(403);
    expect((await fetch(`${harness.origin}/api/assigned-tasks`)).status).toBe(
      401,
    );
    for (const query of [
      'limit=10',
      `companyId=${companyId}`,
      'status=done',
      `assignee=${membershipId}`,
      'unknown',
    ])
      expect((await request(`/assigned-tasks?${query}`)).status).toBe(400);
    await withUnsupportedPermissionVersion(assignment, 'v999', async () => {
      expect((await request('/assigned-tasks')).status).toBe(403);
    });
  });

  it('keeps a superseded original Client listed with its original label and writes no event, command or fence advance', async () => {
    await grant('task');
    const created = await create({
      title: 'Historical notes',
      assigneeMembershipId: membershipId,
      dueDate: '2026-09-30',
    });
    const union = await unionSetup(true, true);
    const confirmed = await union.confirm();
    const events = await taskEvents();
    const snapshot = async () => ({
      commands: (
        await harness.pool.query('SELECT * FROM task_commands ORDER BY id')
      ).rows,
      clients: (
        await harness.pool.query('SELECT * FROM client_accounts ORDER BY id')
      ).rows,
      tasks: (await harness.pool.query('SELECT * FROM tasks ORDER BY id')).rows,
    });
    const before = await snapshot();
    const page = await read('/assigned-tasks');
    expect(page).toEqual({
      tasks: [
        {
          ...created,
          project: {
            id: projectId,
            title: 'ISO preparation',
            clientDisplayName: 'Synthetic Client',
          },
        },
      ],
    });
    for (const hidden of [
      union.second,
      'Legacy synthetic identity',
      'clientDossierId',
    ])
      expect(JSON.stringify(page)).not.toContain(hidden);
    expect(await snapshot()).toEqual(before);
    expect(await taskEvents()).toEqual(events);
    expect((await reverse(string(confirmed.projectionReference))).status).toBe(
      201,
    );
    expect(objects((await read('/assigned-tasks')).tasks)).toHaveLength(1);
  });

  it('records a chosen or default priority at creation and shows it in the list, detail and history', async () => {
    await grant('task');
    const critical = await create({
      title: 'Prepare questionnaire',
      priority: 'critical',
    });
    const normal = await create({ title: 'Archive notes' });
    expect(critical).toMatchObject({
      title: 'Prepare questionnaire',
      priority: 'critical',
      status: 'todo',
      version: 1,
    });
    expect(normal).toMatchObject({
      title: 'Archive notes',
      priority: 'normal',
      version: 1,
    });
    // Creation order stays the list order; priority reorders nothing.
    expect(await read(`/projects/${projectId}/tasks`)).toEqual({
      mutable: true,
      tasks: [critical, normal],
    });
    expect(await detail(string(critical.id))).toEqual(critical);
    for (const [task, priority] of [
      [critical, 'critical'],
      [normal, 'normal'],
    ] as const) {
      const [created] = await history(string(task.id));
      expect(created).toMatchObject({
        action: 'task.created',
        metadata: { version: 1 },
      });
      expect(object(object(created).metadata).initial).toEqual({
        title: task.title,
        assignee: null,
        dueDate: null,
        priority,
      });
    }
    expect(await taskEvents()).toHaveLength(2);
    expect((await read(`/projects/${projectId}`)).status).toBe('preparatory');
  });

  it('rejects priorities outside the three codes without creating or changing a Task', async () => {
    await grant('task');
    const invalid: unknown[] = [
      'Critical',
      'critic',
      'urgent',
      null,
      1,
      '',
      ['critical'],
    ];
    for (const priority of invalid)
      expect(
        (
          await request(`/projects/${projectId}/tasks`, {
            method: 'POST',
            value: { title: 'Invalid priority', priority },
          })
        ).status,
      ).toBe(400);
    expect(await read(`/projects/${projectId}/tasks`)).toEqual({
      mutable: true,
      tasks: [],
    });
    expect(await taskEvents()).toEqual([]);
    const task = await create();
    const id = string(task.id);
    const events = await history(id);
    const fence = await clientVersion();
    for (const priority of invalid)
      expect(
        (
          await request(`/tasks/${id}`, {
            method: 'PATCH',
            value: { expectedVersion: 1, priority },
          })
        ).status,
      ).toBe(400);
    await assertUnchanged(id, task, events);
    expect(await clientVersion()).toBe(fence);
  });

  it('changes priority as one material edit, keeps the current priority a no-op and leaves a done Task read-only', async () => {
    await grant('task');
    const created = await create({
      title: 'Prepare questionnaire',
      priority: 'critical',
    });
    const id = string(created.id);
    const createdEvents = await history(id);
    const fence = await clientVersion();

    expect(
      await edit(id, { expectedVersion: 1, priority: 'critical' }),
    ).toEqual(created);
    expect(
      await edit(id, {
        expectedVersion: 1,
        title: ' Prepare questionnaire ',
        priority: 'critical',
      }),
    ).toEqual(created);
    await assertUnchanged(id, created, createdEvents);
    expect(await clientVersion()).toBe(fence);
    expect(
      (
        await request(`/tasks/${id}`, {
          method: 'PATCH',
          value: { expectedVersion: 2, priority: 'important' },
        })
      ).status,
    ).toBe(409);
    await assertUnchanged(id, created, createdEvents);

    const changed = await edit(id, {
      expectedVersion: 1,
      priority: 'important',
    });
    expect(changed).toEqual({
      ...created,
      priority: 'important',
      version: 2,
      updatedAt: expect.any(String),
    });
    expect(await clientVersion()).toBe(fence + 1);
    const changedEvents = await history(id);
    expect(changedEvents).toHaveLength(2);
    expect(changedEvents[1]).toMatchObject({
      action: 'task.updated',
      metadata: {
        version: 2,
        changes: { priority: { before: 'critical', after: 'important' } },
      },
    });
    expect(
      Object.keys(object(object(object(changedEvents[1]).metadata).changes)),
    ).toEqual(['priority']);

    const combined = await edit(id, {
      expectedVersion: 2,
      title: 'Prepare revised questionnaire',
      priority: 'normal',
    });
    expect(combined).toMatchObject({
      title: 'Prepare revised questionnaire',
      priority: 'normal',
      version: 3,
    });
    const combinedEvents = await history(id);
    expect(combinedEvents).toHaveLength(3);
    expect(object(object(combinedEvents[2]).metadata).changes).toEqual({
      title: {
        before: 'Prepare questionnaire',
        after: 'Prepare revised questionnaire',
      },
      priority: { before: 'important', after: 'normal' },
    });
    expect(await clientVersion()).toBe(fence + 2);

    expect((await transition(id, 'complete', 3)).status).toBe(201);
    const completed = await detail(id);
    expect(completed).toMatchObject({
      status: 'done',
      priority: 'normal',
      version: 4,
    });
    const completedEvents = await history(id);
    const completedFence = await clientVersion();
    // Submitting the current priority is no exception: a closed Task accepts no edit.
    for (const priority of ['normal', 'critical'])
      expect(
        (
          await request(`/tasks/${id}`, {
            method: 'PATCH',
            value: { expectedVersion: 4, priority },
          })
        ).status,
      ).toBe(409);
    await assertUnchanged(id, completed, completedEvents);
    expect(await clientVersion()).toBe(completedFence);

    expect((await transition(id, 'reopen', 4)).status).toBe(201);
    expect(await detail(id)).toMatchObject({
      status: 'todo',
      priority: 'normal',
      version: 5,
    });
    expect(
      await edit(id, { expectedVersion: 5, priority: 'critical' }),
    ).toMatchObject({ priority: 'critical', version: 6 });
    const events = await history(id);
    expect(events.map((event) => event.action)).toEqual([
      'task.created',
      'task.updated',
      'task.updated',
      'task.completed',
      'task.reopened',
      'task.updated',
    ]);
    expect(await taskEvents()).toEqual(expect.arrayContaining(events));
    expect((await read(`/projects/${projectId}`)).status).toBe('preparatory');
  });

  it('binds retry keys to a submitted priority and distinguishes an explicit normal from an omitted one', async () => {
    await grant('task');
    const createKey = randomUUID();
    const created = await create({ title: 'Keyed notes' }, { key: createKey });
    for (const priority of ['normal', 'critical'])
      expect(
        (
          await request(`/projects/${projectId}/tasks`, {
            method: 'POST',
            key: createKey,
            value: { title: 'Keyed notes', priority },
          })
        ).status,
      ).toBe(409);
    expect(await create({ title: 'Keyed notes' }, { key: createKey })).toEqual(
      created,
    );
    const prioritizedKey = randomUUID();
    const prioritized = await create(
      { title: 'Prioritized notes', priority: 'important' },
      { key: prioritizedKey },
    );
    for (const value of [
      { title: 'Prioritized notes' },
      { title: 'Prioritized notes', priority: 'critical' },
    ])
      expect(
        (
          await request(`/projects/${projectId}/tasks`, {
            method: 'POST',
            key: prioritizedKey,
            value,
          })
        ).status,
      ).toBe(409);
    expect(
      await create(
        { title: 'Prioritized notes', priority: 'important' },
        { key: prioritizedKey },
      ),
    ).toEqual(prioritized);

    const id = string(created.id);
    const editKey = randomUUID();
    const edited = await edit(
      id,
      { expectedVersion: 1, priority: 'critical' },
      { key: editKey },
    );
    for (const value of [
      { expectedVersion: 1, priority: 'important' },
      { expectedVersion: 1 },
    ])
      expect(
        (
          await request(`/tasks/${id}`, {
            method: 'PATCH',
            key: editKey,
            value,
          })
        ).status,
      ).toBe(409);
    await edit(id, { expectedVersion: 2, priority: 'normal' });
    const current = await detail(id);
    const events = await history(id);
    const fence = await clientVersion();
    // The exact replay confirms its recorded outcome, not the current Task.
    expect(
      await edit(
        id,
        { expectedVersion: 1, priority: 'critical' },
        { key: editKey },
      ),
    ).toEqual(edited);
    await assertUnchanged(id, current, events);
    expect(await clientVersion()).toBe(fence);
    expect(
      objects((await read(`/projects/${projectId}/tasks`)).tasks),
    ).toHaveLength(2);
  });

  it('replays pre-priority create and edit receipts under their original payload as normal and fails closed for an unknown stored priority', async () => {
    await grant('task');
    const createKey = randomUUID();
    const created = await create({ title: 'Legacy notes' }, { key: createKey });
    const id = string(created.id);
    const editKey = randomUUID();
    const edited = await edit(
      id,
      { expectedVersion: 1, dueDate: '2026-10-01' },
      { key: editKey },
    );
    const storedCommand = async (key: string) =>
      string(
        (
          await harness.pool.query<{ command: unknown }>(
            'SELECT command FROM task_commands WHERE idempotency_key=$1',
            [key],
          )
        ).rows[0]?.command,
      );
    // An omitted priority keeps the fingerprint a pre-priority receipt recorded.
    expect(await storedCommand(createKey)).toBe(
      JSON.stringify({
        action: 'create',
        companyId,
        projectId,
        title: 'Legacy notes',
        assigneeMembershipId: null,
        dueDate: null,
      }),
    );
    expect(await storedCommand(editKey)).toBe(
      JSON.stringify({
        companyId,
        taskId: id,
        action: 'edit',
        input: { expectedVersion: 1, dueDate: '2026-10-01' },
      }),
    );
    // Recreate receipts recorded before the priority field existed.
    await harness.pool.query(
      "UPDATE task_commands SET result = result - 'priority' WHERE idempotency_key = ANY($1::text[])",
      [[createKey, editKey]],
    );
    const current = await detail(id);
    const events = await history(id);
    const fence = await clientVersion();
    const receipts = await commandCount();
    expect(created.priority).toBe('normal');
    expect(await create({ title: 'Legacy notes' }, { key: createKey })).toEqual(
      created,
    );
    expect(
      await edit(
        id,
        { expectedVersion: 1, dueDate: '2026-10-01' },
        { key: editKey },
      ),
    ).toEqual(edited);
    await assertUnchanged(id, current, events);
    expect(await clientVersion()).toBe(fence);
    expect(await commandCount()).toBe(receipts);
    expect(
      objects((await read(`/projects/${projectId}/tasks`)).tasks),
    ).toHaveLength(1);

    await harness.pool.query(
      `UPDATE task_commands SET result = jsonb_set(result, '{priority}', '"urgent"') WHERE idempotency_key=$1`,
      [createKey],
    );
    const unknown = await request(`/projects/${projectId}/tasks`, {
      method: 'POST',
      key: createKey,
      value: { title: 'Legacy notes' },
    });
    expect(unknown.status).toBe(500);
    expect(await unknown.text()).not.toContain('Legacy notes');
    await assertUnchanged(id, current, events);
    expect(await clientVersion()).toBe(fence);
  });

  it('requires the existing Task authority for a priority change and denies a revoked manager exact replay', async () => {
    await grant('task');
    const target = string(
      (await member('task-member', true)).workspaceMembershipId,
    );
    const outsider = string(
      (await member('task-ineligible')).workspaceMembershipId,
    );
    for (const kind of ['context', 'client', 'project'] satisfies Array<
      keyof typeof assignments
    >)
      await grant(kind, outsider);
    const createKey = randomUUID();
    const createBody = {
      title: 'Member priority',
      priority: 'critical',
      assigneeMembershipId: target,
    };
    const created = await create(createBody, {
      key: createKey,
      subject: 'task-member',
    });
    const id = string(created.id);
    const editKey = randomUUID();
    const edited = await edit(
      id,
      { expectedVersion: 1, priority: 'important' },
      { key: editKey, subject: 'task-member' },
    );
    const events = await history(id);
    const fence = await clientVersion();
    // Being the assignee and creator grants nothing once task.manage is gone.
    await revoke('task', target);
    for (const response of [
      await request(`/projects/${projectId}/tasks`, {
        method: 'POST',
        key: createKey,
        subject: 'task-member',
        value: createBody,
      }),
      await request(`/tasks/${id}`, {
        method: 'PATCH',
        key: editKey,
        subject: 'task-member',
        value: { expectedVersion: 1, priority: 'important' },
      }),
      await request(`/tasks/${id}`, {
        method: 'PATCH',
        subject: 'task-member',
        value: { expectedVersion: 2, priority: 'normal' },
      }),
      await request(`/tasks/${id}`, {
        method: 'PATCH',
        subject: 'task-ineligible',
        value: { expectedVersion: 2, priority: 'normal' },
      }),
      await request(`/tasks/${id}`, { subject: 'task-ineligible' }),
    ]) {
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain('Member priority');
    }
    await assertUnchanged(id, edited, events);
    expect(await clientVersion()).toBe(fence);
    expect(await detail(id)).toMatchObject({
      assignee: { workspaceMembershipId: target },
      createdBy: { workspaceMembershipId: target },
      priority: 'important',
    });
  });

  it('refuses a priority change for a superseded original Client while the priority stays readable', async () => {
    await grant('task');
    const created = await create({
      title: 'Historical priority',
      priority: 'critical',
    });
    const id = string(created.id);
    const events = await history(id);
    await (await unionSetup(true)).confirm();
    expect(
      (
        await request(`/tasks/${id}`, {
          method: 'PATCH',
          value: { expectedVersion: 1, priority: 'normal' },
        })
      ).status,
    ).toBe(404);
    expect(await read(`/tasks/${id}`)).toEqual({
      mutable: false,
      task: created,
    });
    expect(await read(`/projects/${projectId}/tasks`)).toEqual({
      mutable: false,
      tasks: [created],
    });
    expect(await history(id)).toEqual(events);
  });

  it.each([
    ['a material priority change', 'critical', 409],
    ['the current priority', 'normal', 201],
  ] as const)(
    'advances the Client reversal fence exactly as any Task edit for %s',
    async (_case, priority, reversalStatus) => {
      await grant('task');
      const created = await create();
      const id = string(created.id);
      const union = await (await unionSetup()).confirm();
      await edit(id, { expectedVersion: 1, priority });
      expect((await reverse(string(union.projectionReference))).status).toBe(
        reversalStatus,
      );
    },
  );

  it('keeps a historical creation without priority valid and absent and fails closed for an unknown stored priority', async () => {
    await grant('task');
    const created = await create({ title: 'Historical creation' });
    const id = string(created.id);
    await harness.pool.query(
      "UPDATE task_events SET meaning = meaning #- '{metadata,initial,priority}' WHERE task_id=$1 AND version=1",
      [id],
    );
    const [creation] = await history(id);
    expect(object(object(creation).metadata).initial).toEqual({
      title: 'Historical creation',
      assignee: null,
      dueDate: null,
    });
    expect(await taskEvents()).toEqual([creation]);
    expect(await detail(id)).toEqual(created);
    await edit(id, { expectedVersion: 1, priority: 'important' });
    expect((await history(id))[1]).toMatchObject({
      metadata: {
        changes: { priority: { before: 'normal', after: 'important' } },
      },
    });
    await harness.pool.query(
      `UPDATE task_events SET meaning = jsonb_set(meaning, '{metadata,initial,priority}', '"urgent"') WHERE task_id=$1 AND version=1`,
      [id],
    );
    const unknown = await request(`/tasks/${id}/history`);
    expect(unknown.status).toBe(500);
    expect(await unknown.text()).not.toContain('Historical creation');
  });

  it('permits only one of a priority edit, another edit or completion from one observed version', async () => {
    await grant('task');
    const created = await create();
    const id = string(created.id);
    const responses = await Promise.all([
      request(`/tasks/${id}`, {
        method: 'PATCH',
        value: { expectedVersion: 1, priority: 'critical' },
      }),
      request(`/tasks/${id}`, {
        method: 'PATCH',
        value: { expectedVersion: 1, priority: 'important' },
      }),
      request(`/tasks/${id}`, {
        method: 'PATCH',
        value: { expectedVersion: 1, title: 'Competing title' },
      }),
      transition(id, 'complete', 1),
    ]);
    expect(
      responses.filter(
        (response) => response.status === 200 || response.status === 201,
      ),
    ).toHaveLength(1);
    expect(
      responses.filter((response) => response.status === 409),
    ).toHaveLength(3);
    expect((await detail(id)).version).toBe(2);
    expect(await history(id)).toHaveLength(2);
  });

  it('shows each assigned Task priority in My Tasks without changing the date order or writing', async () => {
    await grant('task');
    const project = {
      id: projectId,
      title: 'ISO preparation',
      clientDisplayName: 'Synthetic Client',
    };
    const assign = (title: string, dueDate: string | null, priority?: string) =>
      create({
        title,
        dueDate,
        assigneeMembershipId: membershipId,
        ...(priority === undefined ? {} : { priority }),
      });
    const laterCritical = await assign(
      'Critical later',
      '2026-10-20',
      'critical',
    );
    const earlierNormal = await assign('Normal earlier', '2026-10-01');
    const undatedImportant = await assign(
      'Important undated',
      null,
      'important',
    );
    const sameDayImportant = await assign(
      'Important same day',
      '2026-10-01',
      'important',
    );
    const events = await taskEvents();
    const fence = await clientVersion();
    const receipts = await commandCount();
    const rows = await assigned();
    expect(rows).toEqual([
      { ...earlierNormal, project },
      { ...sameDayImportant, project },
      { ...laterCritical, project },
      { ...undatedImportant, project },
    ]);
    expect(rows.map((task) => task.priority)).toEqual([
      'normal',
      'important',
      'critical',
      'important',
    ]);
    expect(await taskEvents()).toEqual(events);
    expect(await clientVersion()).toBe(fence);
    expect(await commandCount()).toBe(receipts);
  });
});
