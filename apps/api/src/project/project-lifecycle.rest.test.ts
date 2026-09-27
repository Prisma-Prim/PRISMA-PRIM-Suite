import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const workspaceId = '00000000-0000-4000-8000-000000000406';
const owner = 'lifecycle-owner';
const assignments = {
  context: '/company-context-assignments',
  client: '/company-director-client-assignments',
  project: '/company-project-assignments',
  task: '/company-task-manager-assignments',
  approver: '/company-project-approver-assignments',
  document: '/company-document-registrar-assignments',
  organizer: '/company-document-project-organizer-assignments',
};
type Kind = keyof typeof assignments;
// The Client row lock every original-Client command takes first.
const CLIENT_LOCK_QUERY = '%from "client_accounts"%for update%';
const EXCEPTION_REASON =
  'Work starts on the preliminary agreement; the Offer and Contract are being finalized.';
const HOLD_REASON = 'Client asked to pause until the audit date is confirmed.';
const COMPLETION_NOTE =
  'Certification preparation delivered; final report handed over to the Client.';
const allPresent = {
  approvedOffer: 'present',
  contractOrPrecontract: 'present',
  projectPlan: 'present',
  initialDocuments: 'present',
  deadlines: 'present',
  financialConditions: 'present',
  risks: 'present',
};
const offerAndFinanceMissing = {
  ...allPresent,
  approvedOffer: 'missing',
  financialConditions: 'missing',
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
  return object(value);
}

describe.skipIf(!databaseUrl)('Project lifecycle REST contract', () => {
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let companyId: string;
  let clientId: string;
  let projectId: string;
  let ownerMembershipId: string;
  let approver: string;
  let approverUser: string;
  let ana: string;
  let ion: string;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'project_lifecycle',
    });
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: owner,
        ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Project Lifecycle',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
          ['aprobator', 'aprobator-2', 'ana', 'ion', 'outsider', 'maria'].map(
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
    await harness.pool.query('TRUNCATE workspaces, internal_users CASCADE');
    companyId = '';
    companyId = string(
      (await command('/companies', { displayName: 'PRISMA-PRIM' })).id,
    );
    const actor = await read('/access/current-actor');
    ownerMembershipId = string(actor.workspaceMembershipId);
    await grant('client');
    await grant('project');
    clientId = string(
      (await command('/clients', { displayName: 'GRUP Demo SA' })).id,
    );
    // Aprobator Demo: Approver v1, Project Access v1 and Director Client Access.
    approver = await member('aprobator', ['approver', 'project', 'client']);
    await captureLegacyProjectAccess(approver);
    approverUser = string(
      (await read('/access/current-actor', { subject: 'aprobator' }))
        .internalUserId,
    );
    // Ana: Project Access v2, Task Manager and Director.
    ana = await member('ana', ['project', 'task', 'client']);
    // Ion: Project Access v1 and Director, without the Approver.
    ion = await member('ion', ['project', 'client']);
    await captureLegacyProjectAccess(ion);
    projectId = await registerProject('ISO 9001 — GRUP Demo SA');
    await setResponsible(projectId, 0, ana);
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
      subject = owner,
      workspace,
    } = options;
    return fetch(`${harness.origin}/api${path}`, {
      method,
      headers: {
        'x-test-external-provider': 'deterministic-test',
        'x-test-external-subject': subject,
        'x-test-display-name': subject === owner ? 'Lifecycle Owner' : subject,
        'x-test-email': `${subject}@example.test`,
        ...(company ? { 'x-company-context-id': company } : {}),
        ...(workspace ? { 'x-workspace-context-id': workspace } : {}),
        ...(key === null ? {} : { 'idempotency-key': key }),
        'content-type': 'application/json',
      },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    });
  }
  type Options = Parameters<typeof request>[1];
  async function read(path: string, options: Options = {}) {
    const response = await request(path, options);
    expect(response.status).toBe(200);
    return body(response);
  }
  async function command(path: string, value: unknown, options: Options = {}) {
    const response = await request(path, {
      ...options,
      method: 'POST',
      value,
    });
    expect(response.status).toBe(201);
    return body(response);
  }
  function grant(kind: Kind, target = ownerMembershipId, company = companyId) {
    return command(assignments[kind], {
      workspaceMembershipId: target,
      companyId: company,
    });
  }
  function revoke(
    kind: Kind,
    target: string,
    company = companyId,
    key = randomUUID(),
  ) {
    return request(`${assignments[kind]}/${target}/${company}`, {
      method: 'DELETE',
      key,
    });
  }
  async function member(subject: string, kinds: Kind[] = []) {
    const actor = await read('/access/current-actor', {
      subject,
      company: '',
    });
    const id = string(actor.workspaceMembershipId);
    for (const kind of kinds) await grant(kind, id);
    return id;
  }
  async function assignmentOf(bundle: string, membershipId: string) {
    const result = await harness.pool.query<{ id: string }>(
      'SELECT id FROM company_role_assignments WHERE bundle = $1 AND workspace_membership_id = $2 AND company_id = $3 AND revoked_at IS NULL',
      [bundle, membershipId, companyId],
    );
    return string(result.rows[0]?.id);
  }
  async function captureLegacyProjectAccess(membershipId: string) {
    // Simulates a Project Access assignment captured before v2 existed.
    await harness.pool.query(
      "UPDATE company_role_assignments SET permission_set_version = 'v1' WHERE id = $1",
      [await assignmentOf('company_project_access', membershipId)],
    );
  }
  async function registerProject(title: string) {
    return string(
      (
        await command(
          '/projects',
          { title, clientAccountId: clientId },
          { subject: 'ana' },
        )
      ).id,
    );
  }
  async function registerDocument(title: string) {
    return command(
      '/documents',
      {
        clientId,
        title,
        purpose: 'Prepare Project closure evidence.',
        url: 'https://example.test/project-closure-evidence',
      },
      { subject: 'ana' },
    );
  }
  async function setResponsible(
    target: string,
    expectedRevision: number,
    workspaceMembershipId: string | null,
  ) {
    const response = await responsibleChange(
      target,
      expectedRevision,
      workspaceMembershipId,
    );
    expect(response.status).toBe(200);
    return body(response);
  }
  function responsibleChange(
    target: string,
    expectedRevision: number,
    workspaceMembershipId: string | null,
    options: Options = {},
  ) {
    return request(`/projects/${target}/responsible`, {
      subject: 'ana',
      ...options,
      method: 'PUT',
      value: { expectedRevision, workspaceMembershipId },
    });
  }
  function transition(
    value: unknown,
    options: Options = {},
    target = projectId,
  ) {
    return request(`/projects/${target}/lifecycle-transitions`, {
      subject: 'aprobator',
      ...options,
      method: 'POST',
      value,
    });
  }
  async function committed(
    value: unknown,
    options: Options = {},
    target = projectId,
  ) {
    const response = await transition(value, options, target);
    expect(response.status).toBe(200);
    return body(response);
  }
  function activation(
    expectedLifecycleRevision = 0,
    declaration: Record<string, string> = allPresent,
    startException?: unknown,
  ) {
    return {
      action: 'activate',
      expectedLifecycleRevision,
      declaration,
      ...(startException === undefined ? {} : { startException }),
    };
  }
  function lifecycle(options: Options = {}, target = projectId) {
    return read(`/projects/${target}/lifecycle`, {
      subject: 'ion',
      ...options,
    });
  }
  async function candidates(options: Options = {}) {
    const page = await read(
      `/projects/${projectId}/eligible-start-exception-members`,
      { subject: 'aprobator', ...options },
    );
    expect(Object.keys(page)).toEqual(['members']);
    return objects(page.members);
  }
  async function lifecycleEvents(options: Options = {}) {
    return objects((await read('/activity-log', options)).events).filter(
      (event) => event.action === 'project.lifecycle.changed',
    );
  }
  async function approverEvents() {
    return objects((await read('/activity-log')).events)
      .filter((event) =>
        string(event.action).startsWith('company_project_approver_assignment'),
      )
      .map((event) => ({
        action: event.action,
        metadata: event.metadata,
        member: object(event.target).workspaceMembershipId,
      }));
  }
  async function clientVersion() {
    const result = await harness.pool.query<{ version: number }>(
      'SELECT version FROM client_accounts WHERE id = $1',
      [clientId],
    );
    return result.rows[0]?.version;
  }
  async function counts() {
    const result = await harness.pool.query<{
      transitions: string;
      starts: string;
      receipts: string;
    }>(
      `SELECT
        (SELECT count(*) FROM project_lifecycle_transitions) AS transitions,
        (SELECT count(*) FROM project_start_declarations) AS starts,
        (SELECT count(*) FROM project_lifecycle_commands) AS receipts`,
    );
    const row = object(result.rows[0]);
    return {
      transitions: Number(row.transitions),
      starts: Number(row.starts),
      receipts: Number(row.receipts),
    };
  }
  async function projectState(target = projectId) {
    const result = await harness.pool.query<{
      status: string;
      lifecycle_revision: number;
      responsible_membership_id: string | null;
    }>(
      'SELECT status, lifecycle_revision, responsible_membership_id FROM projects WHERE id = $1',
      [target],
    );
    return object(result.rows[0]);
  }
  async function refusal(response: Response) {
    return { status: response.status, body: await response.text() };
  }
  /** The exact status and safe body the Project detail returns. */
  async function detailRefusal(options: Options, target = projectId) {
    return refusal(await request(`/projects/${target}`, options));
  }
  async function waitForClientLockWaiters(expected: number) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const waiting = await harness.pool.query<{ count: string }>(
        `SELECT count(DISTINCT activity.pid) AS count
           FROM pg_locks waiting_lock
           JOIN pg_stat_activity activity ON activity.pid = waiting_lock.pid
          WHERE NOT waiting_lock.granted
            AND activity.datname = current_database()
            AND activity.query ILIKE $1`,
        [CLIENT_LOCK_QUERY],
      );
      if (Number(waiting.rows[0]?.count) >= expected) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('The contenders did not reach the original Client lock.');
  }
  /** Holds the original Client row until both contenders wait for it. */
  async function contend<T>(
    contenders: () => Promise<T>,
    waiters = 2,
  ): Promise<T> {
    const barrier = await harness.pool.connect();
    let released = false;
    try {
      await barrier.query('BEGIN');
      await barrier.query(
        'SELECT id FROM client_accounts WHERE id = $1 FOR SHARE',
        [clientId],
      );
      const pending = contenders();
      await waitForClientLockWaiters(waiters);
      await barrier.query('COMMIT');
      released = true;
      return await pending;
    } finally {
      if (!released) await barrier.query('ROLLBACK');
      barrier.release();
    }
  }
  async function supersedeOriginalClient() {
    const second = string(
      (await command('/clients', { displayName: 'Legacy synthetic identity' }))
        .id,
    );
    // The public create path rejects duplicates. Reuse the Client suite's
    // historical-data fixture, then exercise union through REST.
    await harness.pool.query(
      "UPDATE client_accounts SET tax_id='PROJECT-LIFECYCLE-406' WHERE id=ANY($1::uuid[])",
      [[clientId, second]],
    );
    const review = await command(`/clients/${clientId}/union-reviews`, {});
    expect(review.outcome).toBe('comparison');
    await command(
      `/client-union-reviews/${string(review.reviewReference)}/confirm`,
      {
        canonicalClientId: second,
        fields: {
          displayName: clientId,
          taxId: clientId,
          address: clientId,
          telephone: clientId,
          generalEmail: clientId,
          businessActivity: clientId,
        },
        companyIds: [companyId],
        reviewedDifferences: true,
        reason: 'Legacy duplicate identity.',
      },
    );
    return second;
  }

  it('activates a Project with a recorded start declaration and start exception and records one attributable event', async () => {
    const [anaEntry] = (await candidates()).filter(
      (entry) => entry.workspaceMembershipId === ana,
    );
    expect(anaEntry).toEqual({
      workspaceMembershipId: ana,
      displayLabel: expect.stringContaining('ana · '),
    });
    const versionBefore = await clientVersion();
    expect(
      await committed(
        activation(0, offerAndFinanceMissing, {
          reason: `  ${EXCEPTION_REASON}  `,
          completionMembershipId: ana,
          completionDueDate: '2026-10-15',
        }),
      ),
    ).toEqual({
      projectId,
      action: 'activate',
      from: 'preparatory',
      to: 'active',
      lifecycleRevision: 1,
    });
    const view = await lifecycle();
    const start = object(view.start);
    expect(view).toEqual({
      status: 'active',
      lifecycleRevision: 1,
      mutable: true,
      start: {
        declaredAt: expect.any(String),
        declaredBy: { displayName: 'aprobator' },
        declaration: offerAndFinanceMissing,
        exception: {
          reason: EXCEPTION_REASON,
          completionResponsible: anaEntry,
          completionDueDate: '2026-10-15',
        },
      },
      transitions: [
        {
          action: 'activate',
          lifecycleRevision: 1,
          from: 'preparatory',
          to: 'active',
          occurredAt: start.declaredAt,
          actor: { displayName: 'aprobator' },
          withStartException: true,
        },
      ],
    });
    for (const hidden of ['aprobator@example.test', 'ana@example.test'])
      expect(JSON.stringify(view)).not.toContain(hidden);
    expect(await read(`/projects/${projectId}`)).toMatchObject({
      status: 'active',
    });
    const list = await request('/projects');
    expect(list.status).toBe(200);
    const rows: unknown = await list.json();
    expect(objects(rows).find((row) => row.id === projectId)).toMatchObject({
      status: 'active',
    });
    expect(await lifecycleEvents()).toEqual([
      {
        id: expect.any(String),
        action: 'project.lifecycle.changed',
        occurredAt: start.declaredAt,
        actor: { internalUserId: approverUser, displayName: 'aprobator' },
        target: {
          type: 'project',
          projectId,
          projectTitle: 'ISO 9001 — GRUP Demo SA',
          companyId,
        },
        metadata: {
          lifecycleRevision: 1,
          from: 'preparatory',
          to: 'active',
          withStartException: true,
        },
      },
    ]);
    expect(await clientVersion()).toBe((versionBefore ?? 0) + 1);
    expect(await counts()).toEqual({ transitions: 1, starts: 1, receipts: 1 });
    // The declaration and the exception are immutable: a later transition
    // records its own row and leaves the start record unchanged.
    await committed({
      action: 'hold',
      expectedLifecycleRevision: 1,
      reason: HOLD_REASON,
    });
    expect(object((await lifecycle()).start)).toEqual(start);
  });

  it('refuses completion while a Task is open, then completes the Project with an attributable note after the Task closes', async () => {
    const task = await command(
      `/projects/${projectId}/tasks`,
      { title: 'Collect procedures', assigneeMembershipId: ana },
      { subject: 'ana' },
    );
    await committed(activation());

    const refused = await transition({
      action: 'complete',
      expectedLifecycleRevision: 1,
      note: COMPLETION_NOTE,
    });
    expect(refused.status).toBe(409);
    expect(await body(refused)).toEqual({
      statusCode: 409,
      code: 'project_open_tasks',
      message: 'Complete or cancel every open Task of this Project first.',
    });
    expect(await projectState()).toMatchObject({
      status: 'active',
      lifecycle_revision: 1,
    });

    const completedTask = await request(`/tasks/${string(task.id)}/complete`, {
      subject: 'ana',
      method: 'POST',
      value: { expectedVersion: 1 },
    });
    expect([200, 201]).toContain(completedTask.status);
    expect(await body(completedTask)).toMatchObject({
      status: 'done',
      version: 2,
    });

    expect(
      await committed({
        action: 'complete',
        expectedLifecycleRevision: 1,
        note: `  ${COMPLETION_NOTE}  `,
      }),
    ).toEqual({
      projectId,
      action: 'complete',
      from: 'active',
      to: 'completed',
      lifecycleRevision: 2,
    });
    expect(await lifecycle()).toMatchObject({
      status: 'completed',
      lifecycleRevision: 2,
      mutable: false,
      transitions: [
        {
          action: 'complete',
          lifecycleRevision: 2,
          from: 'active',
          to: 'completed',
          note: COMPLETION_NOTE,
        },
        {
          action: 'activate',
          lifecycleRevision: 1,
          from: 'preparatory',
          to: 'active',
        },
      ],
    });
    expect(await lifecycleEvents()).toEqual([
      expect.objectContaining({
        action: 'project.lifecycle.changed',
        metadata: {
          lifecycleRevision: 2,
          from: 'active',
          to: 'completed',
        },
      }),
      expect.objectContaining({
        action: 'project.lifecycle.changed',
        metadata: {
          lifecycleRevision: 1,
          from: 'preparatory',
          to: 'active',
          withStartException: false,
        },
      }),
    ]);
  });

  it('cancels from every open status and keeps completed and cancelled Projects terminal', async () => {
    const active = await registerProject('Active cancellation');
    await setResponsible(active, 0, ana);
    await committed(activation(), {}, active);
    const onHold = await registerProject('On-hold cancellation');
    await setResponsible(onHold, 0, ana);
    await committed(activation(), {}, onHold);
    await committed(
      { action: 'hold', expectedLifecycleRevision: 1, reason: HOLD_REASON },
      {},
      onHold,
    );

    for (const [target, expectedLifecycleRevision, from] of [
      [projectId, 0, 'preparatory'],
      [active, 1, 'active'],
      [onHold, 2, 'on_hold'],
    ] satisfies [string, number, 'preparatory' | 'active' | 'on_hold'][]) {
      expect(
        await committed(
          {
            action: 'cancel',
            expectedLifecycleRevision,
            reason: '  Client withdrew the request.  ',
          },
          {},
          target,
        ),
      ).toEqual({
        projectId: target,
        action: 'cancel',
        from,
        to: 'cancelled',
        lifecycleRevision: expectedLifecycleRevision + 1,
      });
      expect(await lifecycle({}, target)).toMatchObject({
        status: 'cancelled',
        transitions: [
          {
            action: 'cancel',
            reason: 'Client withdrew the request.',
          },
        ],
      });
      for (const refused of [
        {
          action: 'resume',
          expectedLifecycleRevision: expectedLifecycleRevision + 1,
        },
        {
          action: 'cancel',
          expectedLifecycleRevision: expectedLifecycleRevision + 1,
          reason: 'Again',
        },
      ]) {
        const response = await transition(refused, {}, target);
        expect(response.status).toBe(409);
        expect(await body(response)).toMatchObject({
          code: 'project_lifecycle_transition_invalid',
        });
      }
    }

    const completed = await registerProject('Completed terminal');
    await setResponsible(completed, 0, ana);
    await committed(activation(), {}, completed);
    await committed(
      {
        action: 'complete',
        expectedLifecycleRevision: 1,
        note: COMPLETION_NOTE,
      },
      {},
      completed,
    );
    const refused = await transition(
      { action: 'hold', expectedLifecycleRevision: 2, reason: HOLD_REASON },
      {},
      completed,
    );
    expect(refused.status).toBe(409);
    expect(await body(refused)).toMatchObject({
      code: 'project_lifecycle_transition_invalid',
    });
  });

  it.each(['completed', 'cancelled'] as const)(
    'keeps %s Project records readable, refuses every guarded mutation, hides eligibility and preserves exact replays',
    async (closedStatus) => {
      await grant('document', ana);
      await grant('organizer', ana);
      const document = await registerDocument('Final closure evidence');
      const documentId = string(document.id);
      const unlinkedDocument = await registerDocument(
        'Unlinked closure evidence',
      );
      const unlinkedDocumentId = string(unlinkedDocument.id);
      const linkDocumentKey = randomUUID();
      const linkedDocument = await request(
        `/documents/${documentId}/project-association`,
        {
          subject: 'ana',
          method: 'POST',
          key: linkDocumentKey,
          value: { action: 'link', projectId, expectedRevision: 0 },
        },
      );
      expect(linkedDocument.status).toBe(201);
      const linkedDocumentBody = await body(linkedDocument);
      const task = await command(
        `/projects/${projectId}/tasks`,
        { title: 'Close every remaining action' },
        { subject: 'ana' },
      );
      const taskId = string(task.id);
      const completeTaskKey = randomUUID();
      const completedTask = await request(`/tasks/${taskId}/complete`, {
        subject: 'ana',
        method: 'POST',
        key: completeTaskKey,
        value: { expectedVersion: 1 },
      });
      expect([200, 201]).toContain(completedTask.status);
      const completedTaskBody = await body(completedTask);
      if (closedStatus === 'completed') {
        await committed(activation());
        await committed({
          action: 'complete',
          expectedLifecycleRevision: 1,
          note: COMPLETION_NOTE,
        });
      } else
        await committed({
          action: 'cancel',
          expectedLifecycleRevision: 0,
          reason: 'Client withdrew the request.',
        });

      expect(await read(`/projects/${projectId}`)).toMatchObject({
        status: closedStatus,
      });
      expect(await lifecycle()).toMatchObject({ status: closedStatus });
      expect(
        await read(`/projects/${projectId}/tasks`, { subject: 'ana' }),
      ).toEqual({
        mutable: false,
        tasks: [expect.objectContaining({ id: taskId, status: 'done' })],
      });
      expect(await read(`/tasks/${taskId}`, { subject: 'ana' })).toMatchObject({
        mutable: false,
        task: { id: taskId, status: 'done' },
      });
      expect(
        await read(`/tasks/${taskId}/history`, { subject: 'ana' }),
      ).toEqual({
        events: expect.any(Array),
      });
      expect(await read(`/projects/${projectId}/responsible`)).toMatchObject({
        mutable: false,
        responsible: { workspaceMembershipId: ana },
      });
      expect(
        await read(`/projects/${projectId}/documents`, { subject: 'ana' }),
      ).toMatchObject({
        mutable: false,
        documents: [expect.objectContaining({ id: documentId })],
      });

      for (const response of [
        await request(`/projects/${projectId}/tasks`, {
          subject: 'ana',
          method: 'POST',
          value: { title: 'Forbidden after closure' },
        }),
        await request(`/tasks/${taskId}`, {
          subject: 'ana',
          method: 'PATCH',
          value: { expectedVersion: 2, title: 'Forbidden edit' },
        }),
        await request(`/tasks/${taskId}/status`, {
          subject: 'ana',
          method: 'POST',
          value: { expectedVersion: 2, status: 'in_progress' },
        }),
        await request(`/tasks/${taskId}/complete`, {
          subject: 'ana',
          method: 'POST',
          value: { expectedVersion: 2 },
        }),
        await request(`/tasks/${taskId}/cancel`, {
          subject: 'ana',
          method: 'POST',
          value: { expectedVersion: 2, reason: 'Forbidden cancellation' },
        }),
        await request(`/tasks/${taskId}/reopen`, {
          subject: 'ana',
          method: 'POST',
          value: { expectedVersion: 2 },
        }),
        await request(`/documents/${unlinkedDocumentId}/project-association`, {
          subject: 'ana',
          method: 'POST',
          value: { action: 'link', projectId, expectedRevision: 0 },
        }),
        await request(`/documents/${documentId}/project-association`, {
          subject: 'ana',
          method: 'POST',
          value: { action: 'unlink', projectId, expectedRevision: 1 },
        }),
        await responsibleChange(projectId, 1, ion),
        await responsibleChange(projectId, 1, null),
      ]) {
        expect(response.status).toBe(409);
        expect(await body(response)).toEqual({
          statusCode: 409,
          code: 'project_closed',
          message: 'This Project is closed. Its records are read-only.',
        });
      }
      for (const [path, subject] of [
        [`/projects/${projectId}/eligible-task-assignees`, 'ana'],
        [`/projects/${projectId}/eligible-documents`, 'ana'],
        [`/projects/${projectId}/eligible-responsible-members`, 'ana'],
        [
          `/projects/${projectId}/eligible-start-exception-members`,
          'aprobator',
        ],
      ] as const) {
        const response = await request(path, { subject });
        expect(response.status).toBe(404);
      }

      const replay = await request(`/tasks/${taskId}/complete`, {
        subject: 'ana',
        method: 'POST',
        key: completeTaskKey,
        value: { expectedVersion: 1 },
      });
      expect([200, 201]).toContain(replay.status);
      expect(await body(replay)).toEqual(completedTaskBody);
      const documentReplay = await request(
        `/documents/${documentId}/project-association`,
        {
          subject: 'ana',
          method: 'POST',
          key: linkDocumentKey,
          value: { action: 'link', projectId, expectedRevision: 0 },
        },
      );
      expect(documentReplay.status).toBe(201);
      expect(await body(documentReplay)).toEqual(linkedDocumentBody);
    },
  );

  it('holds with a reason and resumes, refuses every other source status and increments the revision once per commit', async () => {
    const other = await registerProject('Second preparation');
    for (const refused of [
      { action: 'hold', expectedLifecycleRevision: 0, reason: HOLD_REASON },
      { action: 'resume', expectedLifecycleRevision: 0 },
    ]) {
      const response = await transition(refused, {}, other);
      expect(response.status).toBe(409);
      expect(await body(response)).toEqual({
        statusCode: 409,
        code: 'project_lifecycle_transition_invalid',
        message:
          'This Project lifecycle transition is not available. Reload before choosing another action.',
      });
    }
    await committed(activation());
    for (const refused of [
      { action: 'resume', expectedLifecycleRevision: 1 },
      activation(1),
    ]) {
      const response = await transition(refused);
      expect(response.status).toBe(409);
      expect(await body(response)).toMatchObject({
        code: 'project_lifecycle_transition_invalid',
      });
    }
    const stale = await transition({
      action: 'hold',
      expectedLifecycleRevision: 0,
      reason: HOLD_REASON,
    });
    expect(stale.status).toBe(409);
    expect(await body(stale)).toEqual({
      statusCode: 409,
      code: 'project_lifecycle_conflict',
      message:
        'The Project lifecycle changed. Reload before choosing another action.',
    });
    expect(
      await committed({
        action: 'hold',
        expectedLifecycleRevision: 1,
        reason: `\n ${HOLD_REASON} \t`,
      }),
    ).toEqual({
      projectId,
      action: 'hold',
      from: 'active',
      to: 'on_hold',
      lifecycleRevision: 2,
    });
    expect(
      (
        await transition({
          action: 'hold',
          expectedLifecycleRevision: 2,
          reason: HOLD_REASON,
        })
      ).status,
    ).toBe(409);
    expect(
      await committed({ action: 'resume', expectedLifecycleRevision: 2 }),
    ).toEqual({
      projectId,
      action: 'resume',
      from: 'on_hold',
      to: 'active',
      lifecycleRevision: 3,
    });
    const view = await lifecycle();
    expect(view).toMatchObject({
      status: 'active',
      lifecycleRevision: 3,
      start: { declaration: allPresent, exception: null },
    });
    expect(
      objects(view.transitions).map((entry) => ({
        ...entry,
        occurredAt: undefined,
      })),
    ).toEqual([
      {
        action: 'resume',
        lifecycleRevision: 3,
        from: 'on_hold',
        to: 'active',
        occurredAt: undefined,
        actor: { displayName: 'aprobator' },
      },
      {
        action: 'hold',
        lifecycleRevision: 2,
        from: 'active',
        to: 'on_hold',
        occurredAt: undefined,
        actor: { displayName: 'aprobator' },
        reason: HOLD_REASON,
      },
      {
        action: 'activate',
        lifecycleRevision: 1,
        from: 'preparatory',
        to: 'active',
        occurredAt: undefined,
        actor: { displayName: 'aprobator' },
        withStartException: false,
      },
    ]);
    expect((await lifecycleEvents()).map((event) => event.metadata)).toEqual([
      { lifecycleRevision: 3, from: 'on_hold', to: 'active' },
      { lifecycleRevision: 2, from: 'active', to: 'on_hold' },
      {
        lifecycleRevision: 1,
        from: 'preparatory',
        to: 'active',
        withStartException: false,
      },
    ]);
    expect(JSON.stringify(await lifecycleEvents())).not.toContain(HOLD_REASON);
    expect(await counts()).toEqual({ transitions: 3, starts: 1, receipts: 3 });
    expect(await lifecycle({}, other)).toEqual({
      status: 'preparatory',
      lifecycleRevision: 0,
      mutable: true,
      start: null,
      transitions: [],
    });
  });

  it('rejects malformed commands, a missing key and an ineligible completion member without writing', async () => {
    const outsider = await member('outsider', ['client']);
    const exception = {
      reason: EXCEPTION_REASON,
      completionMembershipId: ana,
      completionDueDate: '2026-10-15',
    };
    const versionBefore = await clientVersion();
    for (const value of [
      {},
      activation(0, allPresent, exception),
      activation(0, offerAndFinanceMissing),
      { action: 'activate', expectedLifecycleRevision: 0 },
      { ...activation(), declaration: { ...allPresent, risks: undefined } },
      { ...activation(), declaration: { ...allPresent, risks: 'unknown' } },
      { ...activation(), title: 'Changed' },
      activation(0, offerAndFinanceMissing, { ...exception, reason: ' ' }),
      activation(0, offerAndFinanceMissing, {
        ...exception,
        reason: 'x'.repeat(501),
      }),
      activation(0, offerAndFinanceMissing, {
        ...exception,
        completionDueDate: '2026-02-30',
      }),
      activation(0, offerAndFinanceMissing, {
        ...exception,
        completionMembershipId: 'ana',
      }),
      { action: 'hold', expectedLifecycleRevision: 0 },
      { action: 'hold', expectedLifecycleRevision: 0, reason: '' },
      { action: 'resume', expectedLifecycleRevision: 0, reason: 'Back' },
      { action: 'complete', expectedLifecycleRevision: 0 },
      { action: 'complete', expectedLifecycleRevision: 0, note: ' ' },
      { action: 'cancel', expectedLifecycleRevision: 0 },
      { action: 'cancel', expectedLifecycleRevision: 0, reason: ' ' },
      { action: 'archive', expectedLifecycleRevision: 0 },
      { action: 'resume', expectedLifecycleRevision: -1 },
    ])
      expect((await transition(value)).status).toBe(400);
    expect((await transition(activation(), { key: null })).status).toBe(400);
    expect(
      (
        await request('/projects/not-a-project/lifecycle-transitions', {
          subject: 'aprobator',
          method: 'POST',
          value: activation(),
        })
      ).status,
    ).toBe(400);
    const ineligible = await transition(
      activation(0, offerAndFinanceMissing, {
        ...exception,
        completionMembershipId: outsider,
      }),
    );
    expect(ineligible.status).toBe(400);
    expect(await body(ineligible)).toMatchObject({
      message: 'The responsible member is unavailable.',
    });
    expect(
      (await candidates()).map((entry) => entry.workspaceMembershipId),
    ).not.toContain(outsider);
    expect(await counts()).toEqual({ transitions: 0, starts: 0, receipts: 0 });
    expect(await projectState()).toMatchObject({
      status: 'preparatory',
      lifecycle_revision: 0,
    });
    expect(await clientVersion()).toBe(versionBefore);
    expect(await lifecycleEvents()).toEqual([]);
  });

  it('requires a responsible member for activation and forbids clearing it while active or on hold', async () => {
    const unassigned = await registerProject('Unassigned preparation');
    const refused = await transition(activation(), {}, unassigned);
    expect(refused.status).toBe(409);
    expect(await body(refused)).toEqual({
      statusCode: 409,
      code: 'project_responsible_required',
      message: 'Name a responsible member before activating this Project.',
    });
    expect(await projectState(unassigned)).toMatchObject({
      status: 'preparatory',
      lifecycle_revision: 0,
    });
    // On a preparatory Project clearing is unchanged.
    await setResponsible(unassigned, 0, ion);
    expect(await setResponsible(unassigned, 1, null)).toMatchObject({
      outcome: 'changed',
      responsible: null,
    });

    await committed(activation());
    const cleared = await responsibleChange(projectId, 1, null);
    expect(cleared.status).toBe(409);
    expect(await body(cleared)).toEqual({
      statusCode: 409,
      code: 'project_responsible_required',
      message:
        'Choose a replacement instead of clearing the responsible member.',
    });
    expect(await setResponsible(projectId, 1, ion)).toMatchObject({
      outcome: 'changed',
      revision: 2,
    });
    await committed({
      action: 'hold',
      expectedLifecycleRevision: 1,
      reason: HOLD_REASON,
    });
    expect((await responsibleChange(projectId, 2, null)).status).toBe(409);
    expect(await setResponsible(projectId, 2, ana)).toMatchObject({
      outcome: 'changed',
      revision: 3,
    });
    expect(await projectState()).toMatchObject({
      status: 'on_hold',
      lifecycle_revision: 2,
      responsible_membership_id: ana,
    });
  });

  it('requires a live Approver plus Project and Client read, and refuses every other actor with the detail status and body', async () => {
    // Project Access v1 or v2 without the Approver.
    for (const subject of ['ion', 'ana']) {
      expect(
        await refusal(await transition(activation(), { subject })),
      ).toEqual({ status: 403, body: expect.any(String) });
      expect(
        (
          await request(
            `/projects/${projectId}/eligible-start-exception-members`,
            { subject },
          )
        ).status,
      ).toBe(403);
    }
    // The Approver without Project Access, or without Client read.
    await member('maria', ['approver', 'client']);
    await member('outsider', ['approver', 'project']);
    for (const subject of ['maria', 'outsider']) {
      const detail = await detailRefusal({ subject });
      expect(detail.status).toBe(403);
      expect(
        await refusal(await transition(activation(), { subject })),
      ).toEqual(detail);
      expect(
        await refusal(
          await request(`/projects/${projectId}/lifecycle`, { subject }),
        ),
      ).toEqual(detail);
    }
    // The Approver confers no Company context, Project read or Client read.
    const context = await read('/access/current-actor', {
      subject: 'maria',
    });
    expect(object(context.activeCompany).projectPermissions).toBe(undefined);
    expect(object(context.activeCompany).projectApproverPermissions).toEqual([
      'project.lifecycle.transition',
      'project.close',
    ]);
    // Unknown, other-Company and other-Workspace Projects.
    const bic = string(
      (await command('/companies', { displayName: 'BIC' })).id,
    );
    for (const kind of ['approver', 'project', 'client'] satisfies Kind[])
      await grant(kind, approver, bic);
    for (const [options, target] of [
      [{ subject: 'aprobator' }, randomUUID()],
      [{ subject: 'aprobator', company: bic }, projectId],
      [{ subject: 'aprobator', workspace: randomUUID() }, projectId],
    ] satisfies [Options, string][]) {
      const detail = await detailRefusal(options, target);
      expect([403, 404]).toContain(detail.status);
      expect(
        await refusal(await transition(activation(), options, target)),
      ).toEqual(detail);
      expect(
        await refusal(await request(`/projects/${target}/lifecycle`, options)),
      ).toEqual(detail);
      const eligible = await refusal(
        await request(
          `/projects/${target}/eligible-start-exception-members`,
          options,
        ),
      );
      expect(eligible).toEqual(detail);
      for (const hidden of ['preparatory', 'lifecycleRevision', ana])
        expect(eligible.body).not.toContain(hidden);
    }
    expect(await counts()).toEqual({ transitions: 0, starts: 0, receipts: 0 });

    // The live holder: the current actor exposes the captured v1 permissions.
    const holder = object(
      (await read('/access/current-actor', { subject: 'aprobator' }))
        .activeCompany,
    );
    expect(holder).toMatchObject({
      projectPermissions: ['project.read', 'project.create'],
      projectApproverPermissions: [
        'project.lifecycle.transition',
        'project.close',
      ],
      projectApproverPermissionAssignmentId: await assignmentOf(
        'company_project_approver',
        approver,
      ),
      projectApproverPermissionSetVersion: 'v1',
    });
    await committed(activation());
    expect(await projectState()).toMatchObject({ status: 'active' });
  });

  it('fails closed for null or unknown captured Approver versions and records grant and revocation once per actual change', async () => {
    const assignment = await assignmentOf('company_project_approver', approver);
    const definition = string(
      (
        await harness.pool.query<{ definition: string }>(
          "SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='company_role_assignments_permission_set_version_check'",
        )
      ).rows[0]?.definition,
    );
    for (const version of [null, 'v2']) {
      await harness.pool.query(
        'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
      );
      try {
        await harness.pool.query(
          'UPDATE company_role_assignments SET permission_set_version=$1 WHERE id=$2',
          [version, assignment],
        );
        const actor = await read('/access/current-actor', {
          subject: 'aprobator',
        });
        expect(object(actor.activeCompany).projectApproverPermissions).toBe(
          undefined,
        );
        expect((await transition(activation())).status).toBe(403);
        expect(
          (
            await transition({
              action: 'cancel',
              expectedLifecycleRevision: 0,
              reason: 'Client withdrew the request.',
            })
          ).status,
        ).toBe(403);
        expect(
          (
            await request(
              `/projects/${projectId}/eligible-start-exception-members`,
              { subject: 'aprobator' },
            )
          ).status,
        ).toBe(403);
      } finally {
        await harness.pool.query(
          "UPDATE company_role_assignments SET permission_set_version='v1' WHERE id=$1",
          [assignment],
        );
        await harness.pool.query(
          `ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ${definition}`,
        );
      }
    }

    // One event per actual state change; none for a repeat or a replay.
    expect(await approverEvents()).toEqual([
      {
        action: 'company_project_approver_assignment.granted',
        metadata: { bundle: 'Company Project Approver' },
        member: approver,
      },
    ]);
    const key = randomUUID();
    const granted = await command(
      assignments.approver,
      { workspaceMembershipId: ion, companyId },
      { key },
    );
    expect(granted).toMatchObject({
      bundle: 'Company Project Approver',
      permissionSetVersion: 'v1',
      active: true,
    });
    await command(
      assignments.approver,
      { workspaceMembershipId: ion, companyId },
      { key },
    );
    await grant('approver', ion);
    const revokeKey = randomUUID();
    expect((await revoke('approver', ion, companyId, revokeKey)).status).toBe(
      200,
    );
    expect((await revoke('approver', ion, companyId, revokeKey)).status).toBe(
      200,
    );
    expect((await revoke('approver', ion)).status).toBe(200);
    expect((await approverEvents()).map((event) => event.action)).toEqual([
      'company_project_approver_assignment.revoked',
      'company_project_approver_assignment.granted',
      'company_project_approver_assignment.granted',
    ]);
    // Administration shows the captured v1 assignment.
    expect(
      objects(
        (await read('/company-context-assignments/administration')).assignments,
      ).filter((entry) => entry.bundle === 'Company Project Approver'),
    ).toEqual([
      {
        id: assignment,
        workspaceMembershipId: approver,
        companyId,
        bundle: 'Company Project Approver',
        permissionSetVersion: 'v1',
        active: true,
      },
    ]);
    // A v2 capture is refused by the schema.
    await expect(
      harness.pool.query(
        "UPDATE company_role_assignments SET permission_set_version='v2' WHERE id=$1",
        [assignment],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('replays an exact command before the stale check, conflicts on changed key reuse and denies a replay after revocation', async () => {
    const key = randomUUID();
    const first = await committed(activation(), { key });
    const versionAfter = await clientVersion();
    await committed({
      action: 'hold',
      expectedLifecycleRevision: 1,
      reason: HOLD_REASON,
    });
    // The replay's old expected revision is stale; it still converges.
    expect(await committed(activation(), { key })).toEqual(first);
    expect(await counts()).toEqual({ transitions: 2, starts: 1, receipts: 2 });
    expect(await clientVersion()).toBe((versionAfter ?? 0) + 1);
    expect(await lifecycleEvents()).toHaveLength(2);
    const other = await registerProject('Other preparation');
    await setResponsible(other, 0, ana);
    for (const [value, target] of [
      [
        activation(
          0,
          { ...allPresent, risks: 'missing' },
          {
            reason: EXCEPTION_REASON,
            completionMembershipId: ana,
            completionDueDate: '2026-10-15',
          },
        ),
        projectId,
      ],
      [{ action: 'resume', expectedLifecycleRevision: 0 }, projectId],
      [activation(), other],
    ] satisfies [unknown, string][]) {
      const response = await transition(value, { key }, target);
      expect(response.status).toBe(409);
      expect(await body(response)).toMatchObject({
        message:
          'Idempotency-Key was already used for another Project lifecycle transition.',
      });
    }
    expect(await counts()).toEqual({ transitions: 2, starts: 1, receipts: 2 });
    expect((await revoke('approver', approver)).status).toBe(200);
    expect((await transition(activation(), { key })).status).toBe(403);
    expect(
      (
        await transition({
          action: 'cancel',
          expectedLifecycleRevision: 2,
          reason: 'Client withdrew the request.',
        })
      ).status,
    ).toBe(403);
    await grant('approver', approver);
    expect(await committed(activation(), { key })).toEqual(first);
  });

  it('keeps the lifecycle readable under a superseded original Client and refuses transitions and eligibility', async () => {
    const key = randomUUID();
    const receipt = await committed(activation(), { key });
    const before = await lifecycle();
    const second = await supersedeOriginalClient();
    const readOnly = await lifecycle();
    expect(readOnly).toEqual({ ...before, mutable: false });
    expect(JSON.stringify(readOnly)).not.toContain(second);
    for (const response of [
      await transition({
        action: 'hold',
        expectedLifecycleRevision: 1,
        reason: HOLD_REASON,
      }),
      await request(`/projects/${projectId}/eligible-start-exception-members`, {
        subject: 'aprobator',
      }),
    ]) {
      expect(response.status).toBe(404);
      expect(await response.text()).not.toContain(second);
    }
    expect(await committed(activation(), { key })).toEqual(receipt);
    expect(await counts()).toEqual({ transitions: 1, starts: 1, receipts: 1 });
  });

  it('leaves every Task, its version and history untouched and keeps Task commands usable while active and on hold', async () => {
    const created = await command(
      `/projects/${projectId}/tasks`,
      {
        title: 'Collect procedures',
        dueDate: '2026-10-05',
        assigneeMembershipId: ana,
      },
      { subject: 'ana' },
    );
    const taskId = string(created.id);
    const snapshot = async () => ({
      task: (
        await harness.pool.query('SELECT * FROM tasks WHERE id = $1', [taskId])
      ).rows,
      events: (
        await harness.pool.query(
          'SELECT id, version, meaning::text AS meaning FROM task_events WHERE task_id = $1 ORDER BY version',
          [taskId],
        )
      ).rows,
      responsible: await projectState(),
    });
    const before = await snapshot();
    await committed(activation());
    await committed({
      action: 'hold',
      expectedLifecycleRevision: 1,
      reason: HOLD_REASON,
    });
    await committed({ action: 'resume', expectedLifecycleRevision: 2 });
    const after = await snapshot();
    expect(after.task).toEqual(before.task);
    expect(after.events).toEqual(before.events);
    expect(after.responsible.responsible_membership_id).toBe(ana);
    for (const expectedLifecycleRevision of [3, 4]) {
      // Active, then on hold: create, edit and complete work identically.
      if (expectedLifecycleRevision === 4)
        await committed({
          action: 'hold',
          expectedLifecycleRevision: 3,
          reason: HOLD_REASON,
        });
      const task = await command(
        `/projects/${projectId}/tasks`,
        { title: `Task at ${expectedLifecycleRevision}` },
        { subject: 'ana' },
      );
      const edited = await request(`/tasks/${string(task.id)}`, {
        subject: 'ana',
        method: 'PATCH',
        value: { expectedVersion: 1, dueDate: '2026-10-20' },
      });
      expect(edited.status).toBe(200);
      const completed = await request(`/tasks/${string(task.id)}/complete`, {
        subject: 'ana',
        method: 'POST',
        value: { expectedVersion: 2 },
      });
      expect([200, 201]).toContain(completed.status);
      expect(await body(completed)).toMatchObject({
        status: 'done',
        version: 3,
      });
    }
  });

  it('lets exactly one of two concurrent activations commit, with one revision, receipt and event and never a 500', async () => {
    await member('aprobator-2', ['approver', 'project', 'client']);
    const versionBefore = await clientVersion();
    const responses = await contend(() =>
      Promise.all([
        transition(activation()),
        transition(activation(), { subject: 'aprobator-2' }),
      ]),
    );
    expect(responses.map((response) => response.status).toSorted()).toEqual([
      200, 409,
    ]);
    const lost = responses.find((response) => response.status === 409);
    expect(await body(lost ?? new Response('{}'))).toMatchObject({
      code: 'project_lifecycle_conflict',
    });
    expect(await counts()).toEqual({ transitions: 1, starts: 1, receipts: 1 });
    expect(await lifecycleEvents()).toHaveLength(1);
    expect(await projectState()).toMatchObject({
      status: 'active',
      lifecycle_revision: 1,
    });
    expect(await clientVersion()).toBe((versionBefore ?? 0) + 1);
  });

  it('never leaves an active Project without a responsible member when activation races a clear', async () => {
    const responses = await contend(() =>
      Promise.all([
        transition(activation()),
        responsibleChange(projectId, 1, null),
      ]),
    );
    expect(responses.map((response) => response.status).toSorted()).toEqual([
      200, 409,
    ]);
    const lost = responses.find((response) => response.status === 409);
    expect(await body(lost ?? new Response('{}'))).toMatchObject({
      code: 'project_responsible_required',
    });
    const state = await projectState();
    if (state.status === 'active')
      expect(state.responsible_membership_id).toBe(ana);
    else
      expect(state).toMatchObject({
        status: 'preparatory',
        responsible_membership_id: null,
      });
    expect(await counts()).toMatchObject({
      transitions: state.status === 'active' ? 1 : 0,
      receipts: state.status === 'active' ? 1 : 0,
    });
  });

  it('serializes completion with Task creation so a completed Project never gains an open Task', async () => {
    await committed(activation());
    const responses = await contend(() =>
      Promise.all([
        transition({
          action: 'complete',
          expectedLifecycleRevision: 1,
          note: COMPLETION_NOTE,
        }),
        request(`/projects/${projectId}/tasks`, {
          subject: 'ana',
          method: 'POST',
          value: { title: 'Concurrent Task' },
        }),
      ]),
    );
    expect(
      responses.filter((response) => response.status === 409),
    ).toHaveLength(1);
    expect(
      responses.filter((response) => [200, 201].includes(response.status)),
    ).toHaveLength(1);
    expect(responses.some((response) => response.status >= 500)).toBe(false);
    const state = await projectState();
    const rows = (
      await harness.pool.query<{ status: string }>(
        'SELECT status::text AS status FROM tasks WHERE project_id = $1',
        [projectId],
      )
    ).rows;
    if (state.status === 'completed') expect(rows).toEqual([]);
    else {
      expect(state.status).toBe('active');
      expect(rows).toEqual([{ status: 'todo' }]);
    }
  });

  it('serializes cancellation with a Document link so only the first material command commits', async () => {
    await grant('document', ana);
    await grant('organizer', ana);
    const document = await registerDocument('Closure questionnaire');
    const documentId = string(document.id);
    const responses = await contend(() =>
      Promise.all([
        transition({
          action: 'cancel',
          expectedLifecycleRevision: 0,
          reason: 'Client withdrew the request.',
        }),
        request(`/documents/${documentId}/project-association`, {
          subject: 'ana',
          method: 'POST',
          value: { action: 'link', projectId, expectedRevision: 0 },
        }),
      ]),
    );
    expect(
      responses.filter((response) => response.status === 409),
    ).toHaveLength(1);
    expect(
      responses.filter((response) => [200, 201].includes(response.status)),
    ).toHaveLength(1);
    expect(responses.some((response) => response.status >= 500)).toBe(false);
    const state = await projectState();
    const [association] = (
      await harness.pool.query<{ project_id: string | null }>(
        'SELECT project_id FROM working_documents WHERE id = $1',
        [documentId],
      )
    ).rows;
    if (state.status === 'cancelled')
      expect(association?.project_id).toBeNull();
    else {
      expect(state.status).toBe('preparatory');
      expect(association?.project_id).toBe(projectId);
    }
  });

  it('serializes completion with Task reopening so a completed Project never regains an open Task', async () => {
    const task = await command(
      `/projects/${projectId}/tasks`,
      { title: 'Closed action ready for possible reopening' },
      { subject: 'ana' },
    );
    const taskId = string(task.id);
    const completed = await request(`/tasks/${taskId}/complete`, {
      subject: 'ana',
      method: 'POST',
      value: { expectedVersion: 1 },
    });
    expect(completed.status).toBe(201);
    await committed(activation());
    const responses = await contend(() =>
      Promise.all([
        transition({
          action: 'complete',
          expectedLifecycleRevision: 1,
          note: COMPLETION_NOTE,
        }),
        request(`/tasks/${taskId}/reopen`, {
          subject: 'ana',
          method: 'POST',
          value: { expectedVersion: 2 },
        }),
      ]),
    );
    expect(
      responses.filter((response) => response.status === 409),
    ).toHaveLength(1);
    expect(
      responses.filter((response) => [200, 201].includes(response.status)),
    ).toHaveLength(1);
    expect(responses.some((response) => response.status >= 500)).toBe(false);
    const state = await projectState();
    const [taskState] = (
      await harness.pool.query<{ status: string }>(
        'SELECT status::text AS status FROM tasks WHERE id = $1',
        [taskId],
      )
    ).rows;
    if (state.status === 'completed') expect(taskState?.status).toBe('done');
    else {
      expect(state.status).toBe('active');
      expect(taskState?.status).toBe('todo');
    }
  });

  it('lets exactly one of concurrent completion and cancellation by two Approvers close the Project', async () => {
    await member('aprobator-2', ['approver', 'project', 'client']);
    await committed(activation());
    const responses = await contend(() =>
      Promise.all([
        transition({
          action: 'complete',
          expectedLifecycleRevision: 1,
          note: COMPLETION_NOTE,
        }),
        transition(
          {
            action: 'cancel',
            expectedLifecycleRevision: 1,
            reason: 'Client withdrew the request.',
          },
          { subject: 'aprobator-2' },
        ),
      ]),
    );
    expect(responses.map((response) => response.status).toSorted()).toEqual([
      200, 409,
    ]);
    expect(responses.some((response) => response.status >= 500)).toBe(false);
    expect(await projectState()).toMatchObject({
      status: expect.stringMatching(/^(completed|cancelled)$/),
      lifecycle_revision: 2,
    });
    expect(await counts()).toEqual({ transitions: 2, starts: 1, receipts: 2 });
    expect(await lifecycleEvents()).toHaveLength(2);
  });

  it('commits both a hold and a concurrent Task edit without a false conflict or a Task version change from the hold', async () => {
    const task = await command(
      `/projects/${projectId}/tasks`,
      { title: 'Collect procedures', dueDate: '2026-10-05' },
      { subject: 'ana' },
    );
    await committed(activation());
    const responses = await contend(() =>
      Promise.all([
        transition({
          action: 'hold',
          expectedLifecycleRevision: 1,
          reason: HOLD_REASON,
        }),
        request(`/tasks/${string(task.id)}`, {
          subject: 'ana',
          method: 'PATCH',
          value: { expectedVersion: 1, dueDate: '2026-10-06' },
        }),
      ]),
    );
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(await projectState()).toMatchObject({
      status: 'on_hold',
      lifecycle_revision: 2,
    });
    expect(
      (
        await harness.pool.query<{ version: number; due_date: string }>(
          'SELECT version, due_date::text AS due_date FROM tasks WHERE id = $1',
          [task.id],
        )
      ).rows,
    ).toEqual([{ version: 2, due_date: '2026-10-06' }]);
    expect(await counts()).toEqual({ transitions: 2, starts: 1, receipts: 2 });
  });

  it('projects lifecycle events only in the recording Company to current Project and Client readers', async () => {
    await committed(
      activation(0, offerAndFinanceMissing, {
        reason: EXCEPTION_REASON,
        completionMembershipId: ana,
        completionDueDate: '2026-10-15',
      }),
    );
    await committed({
      action: 'hold',
      expectedLifecycleRevision: 1,
      reason: HOLD_REASON,
    });
    await committed({ action: 'resume', expectedLifecycleRevision: 2 });
    expect(await lifecycleEvents({ subject: 'ion' })).toHaveLength(3);
    const bic = string(
      (await command('/companies', { displayName: 'BIC' })).id,
    );
    await grant('project', ownerMembershipId, bic);
    await grant('client', ownerMembershipId, bic);
    expect(await lifecycleEvents({ company: bic })).toEqual([]);
    await member('maria', ['context', 'client']);
    expect(await lifecycleEvents({ subject: 'maria' })).toEqual([]);
    await harness.pool.query(
      "UPDATE client_company_relationships SET status = 'archived' WHERE client_account_id = $1 AND company_id = $2",
      [clientId, companyId],
    );
    expect(await lifecycleEvents()).toEqual([]);
    await harness.pool.query(
      "UPDATE client_company_relationships SET status = 'active' WHERE client_account_id = $1 AND company_id = $2",
      [clientId, companyId],
    );
    expect(
      (await lifecycleEvents()).map((event) => object(event.metadata).to),
    ).toEqual(['active', 'on_hold', 'active']);
  });

  it('rolls back the status, revision, start record, receipt and Client fence together when the event cannot be recorded', async () => {
    const key = randomUUID();
    const versionBefore = await clientVersion();
    await harness.pool
      .query(`CREATE FUNCTION reject_lifecycle_event() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'forced event failure'; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_lifecycle_event BEFORE INSERT ON project_lifecycle_transitions FOR EACH ROW EXECUTE FUNCTION reject_lifecycle_event()`);
    try {
      expect((await transition(activation(), { key })).status).toBe(500);
      expect(await projectState()).toMatchObject({
        status: 'preparatory',
        lifecycle_revision: 0,
      });
      expect(await counts()).toEqual({
        transitions: 0,
        starts: 0,
        receipts: 0,
      });
      expect(await clientVersion()).toBe(versionBefore);
    } finally {
      await harness.pool.query(
        'DROP TRIGGER reject_lifecycle_event ON project_lifecycle_transitions; DROP FUNCTION reject_lifecycle_event()',
      );
    }
    expect(await committed(activation(), { key })).toMatchObject({
      lifecycleRevision: 1,
    });
  });
});
