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
const workspaceId = '00000000-0000-4000-8000-000000000634';
const templateKey = 'CONSULTING_PREPARATION_ILLUSTRATIVE';
const owner = 'template-owner';
const assignments = {
  client: '/company-director-client-assignments',
  project: '/company-project-assignments',
  task: '/company-task-manager-assignments',
  template: '/company-project-template-user-assignments',
};

function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
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

describe.skipIf(!databaseUrl)(
  'Project creation from an illustrative Template Version',
  () => {
    let database: IsolatedPostgresTestDatabase;
    let harness: PostgresRestTestHarness;
    let companyId: string;
    let clientId: string;
    let membershipId: string;

    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      database = await createIsolatedPostgresTestDatabase({
        baseDatabaseUrl: databaseUrl,
        namePrefix: 'project_template',
      });
      harness = await createPostgresRestTestHarness({
        databaseUrl: database.targetUrl,
        environment: {
          NODE_ENV: 'test',
          ACCESS_IDENTITY_MODE: 'test',
          ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
          ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: owner,
          ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
          ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Project Template tests',
          ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
            { provider: 'deterministic-test', subject: 'ana', workspaceId },
          ]),
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
      membershipId = string(
        (await read('/access/current-actor')).workspaceMembershipId,
      );
      companyId = string(
        (await command('/companies', { displayName: 'Company Demo' })).id,
      );
      await grant('client');
      await grant('project');
      await grant('task');
      clientId = string(
        (await command('/clients', { displayName: 'Client {original} — Демо' }))
          .id,
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
        subject = owner,
      } = options;
      return fetch(`${harness.origin}/api${path}`, {
        method,
        headers: {
          'x-test-external-provider': 'deterministic-test',
          'x-test-external-subject': subject,
          'x-test-display-name': subject === owner ? 'Template Owner' : subject,
          'x-test-email': `${subject}@example.test`,
          ...(company ? { 'x-company-context-id': company } : {}),
          ...(key === null ? {} : { 'idempotency-key': key }),
          'content-type': 'application/json',
          ...(options.workspace
            ? { 'x-workspace-context-id': options.workspace }
            : {}),
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
    async function command(
      path: string,
      value: unknown,
      options: Options = {},
    ) {
      const response = await request(path, {
        ...options,
        method: 'POST',
        value,
      });
      expect(response.status).toBe(201);
      return body(response);
    }
    function grant(kind: keyof typeof assignments, target = membershipId) {
      return command(assignments[kind], {
        workspaceMembershipId: target,
        companyId,
      });
    }

    function creation(overrides: Record<string, unknown> = {}) {
      return {
        title: 'Copied preparation',
        clientAccountId: clientId,
        templateKey,
        templateVersion: 1,
        ...overrides,
      };
    }
    async function createTemplate(options: Options = {}) {
      return command('/projects/from-template', creation(), options);
    }
    async function countRows() {
      const result = await harness.pool.query<{
        projects: number;
        tasks: number;
        project_events: number;
        task_events: number;
        instances: number;
        copies: number;
      }>(`SELECT
        (SELECT count(*)::int FROM projects) AS projects,
        (SELECT count(*)::int FROM tasks) AS tasks,
        (SELECT count(*)::int FROM project_creation_events) AS project_events,
        (SELECT count(*)::int FROM task_events) AS task_events,
        (SELECT count(*)::int FROM project_template_instances) AS instances,
        (SELECT count(*)::int FROM project_template_task_copies) AS copies`);
      return result.rows;
    }

    it('reads the first preserved stage and blocks progress until both mapped required Tasks are done', async () => {
      await grant('template');
      const projectId = string((await createTemplate()).id);
      const plan = object(
        (await read(`/projects/${projectId}/template`)).template,
      );
      const firstStage = objects(plan.stages)[0];
      if (!firstStage) throw new Error('The preserved first stage is missing.');
      const requiredIds = objects(firstStage.tasks).map((task) => task.taskId);
      const progress = await read(`/projects/${projectId}/stage-progress`);
      expect(progress).toMatchObject({
        progress: {
          currentStageKey: 'scoping',
          stageRevision: 0,
          gate: 'required_tasks_incomplete',
          canAdvance: false,
          transitions: [],
        },
      });
      const facts = object(progress.progress);
      expect(objects(facts.requiredTasks).map((task) => task.taskId)).toEqual(
        requiredIds,
      );
      expect(objects(facts.requiredTasks).map((task) => task.status)).toEqual([
        'todo',
        'todo',
      ]);
      expect(await read(`/projects/${projectId}`)).toMatchObject({
        status: 'preparatory',
      });
    });

    it('deliberately advances only after both stable required Tasks are done and preserves proof after an ordinary reopening', async () => {
      await grant('template');
      const projectId = string((await createTemplate()).id);
      const commandPath = `/projects/${projectId}/stage-advance`;
      const intent = {
        expectedStageKey: 'scoping',
        expectedStageRevision: 0,
        targetStageKey: 'preparation',
      };
      expect(
        (await request(commandPath, { method: 'POST', value: intent })).status,
      ).toBe(403);
      await command('/company-project-stage-advancer-assignments', {
        workspaceMembershipId: membershipId,
        companyId,
      });
      expect(
        (await request(commandPath, { method: 'POST', value: intent })).status,
      ).toBe(409);
      const initial = object(
        (await read(`/projects/${projectId}/stage-progress`)).progress,
      );
      const required = objects(initial.requiredTasks);
      const first = required[0];
      const second = required[1];
      if (!first || !second) throw new Error('Missing required gate Tasks.');
      await command(`/tasks/${string(first.taskId)}/complete`, {
        expectedVersion: 1,
      });
      await command(`/tasks/${string(second.taskId)}/cancel`, {
        expectedVersion: 1,
        reason: 'Not evidence of completion',
      });
      expect(
        (await request(commandPath, { method: 'POST', value: intent })).status,
      ).toBe(409);
      await command(`/tasks/${string(second.taskId)}/reopen`, {
        expectedVersion: 2,
      });
      await command(`/tasks/${string(second.taskId)}/complete`, {
        expectedVersion: 3,
      });
      expect(await read(`/projects/${projectId}/stage-progress`)).toMatchObject(
        {
          progress: {
            currentStageKey: 'scoping',
            canAdvance: true,
            gate: 'ready',
          },
        },
      );
      const key = randomUUID();
      const receipt = await command(commandPath, intent, { key });
      expect(receipt).toMatchObject({
        projectId,
        stageRevision: 1,
        fromStageKey: 'scoping',
        toStageKey: 'preparation',
      });
      expect(await command(commandPath, intent, { key })).toEqual(receipt);
      const reached = await read(`/projects/${projectId}/stage-progress`);
      expect(reached).toMatchObject({
        progress: {
          currentStageKey: 'preparation',
          stageRevision: 1,
          gate: 'last_supported_stage',
          canAdvance: false,
        },
      });
      const history = objects(object(reached.progress).transitions);
      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({
        stageRevision: 1,
        fromStageKey: 'scoping',
        toStageKey: 'preparation',
        requiredTasks: [
          { taskId: first.taskId, version: 2 },
          { taskId: second.taskId, version: 4 },
        ],
      });
      await command(`/tasks/${string(first.taskId)}/reopen`, {
        expectedVersion: 2,
      });
      expect(await read(`/projects/${projectId}/stage-progress`)).toEqual(
        reached,
      );
      expect(await read(`/projects/${projectId}`)).toMatchObject({
        status: 'preparatory',
      });
      expect(
        (
          await request(commandPath, {
            method: 'POST',
            value: { ...intent, expectedStageRevision: 1 },
            key,
          })
        ).status,
      ).toBe(409);
    });

    it('projects one minimal stage event only through copied-plan visibility and does not require advance authority for Project history', async () => {
      await grant('template');
      const projectId = string((await createTemplate()).id);
      await command('/company-project-stage-advancer-assignments', {
        workspaceMembershipId: membershipId,
        companyId,
      });
      const initial = object(
        (await read(`/projects/${projectId}/stage-progress`)).progress,
      );
      for (const task of objects(initial.requiredTasks))
        await command(`/tasks/${string(task.taskId)}/complete`, {
          expectedVersion: 1,
        });
      await command(`/projects/${projectId}/stage-advance`, {
        expectedStageKey: 'scoping',
        expectedStageRevision: 0,
        targetStageKey: 'preparation',
      });
      const event = objects((await read('/activity-log')).events).filter(
        (event) => event.action === 'project.stage.changed',
      );
      expect(event).toHaveLength(1);
      expect(event[0]).toMatchObject({
        target: { type: 'project', projectId, companyId },
        metadata: {
          stageRevision: 1,
          fromStageKey: 'scoping',
          toStageKey: 'preparation',
        },
      });
      expect(Object.keys(object(object(event[0]).metadata)).sort()).toEqual([
        'fromStageKey',
        'stageRevision',
        'toStageKey',
      ]);
      expect(JSON.stringify(event)).not.toContain('requiredTasks');
      const anaId = string(
        (await read('/access/current-actor', { subject: 'ana', company: '' }))
          .workspaceMembershipId,
      );
      await grant('client', anaId);
      await grant('project', anaId);
      expect(
        (
          await request(`/projects/${projectId}/stage-progress`, {
            subject: 'ana',
          })
        ).status,
      ).toBe(403);
      expect(
        objects(
          (await read('/activity-log', { subject: 'ana' })).events,
        ).filter((event) => event.action === 'project.stage.changed'),
      ).toEqual([]);
      await grant('task', anaId);
      await grant('template', anaId);
      expect(
        await read(`/projects/${projectId}/stage-progress`, { subject: 'ana' }),
      ).toMatchObject({
        progress: {
          stageRevision: 1,
          transitions: [
            expect.objectContaining({
              fromStageKey: 'scoping',
              toStageKey: 'preparation',
            }),
          ],
        },
      });
      expect(
        objects(
          (await read('/activity-log', { subject: 'ana' })).events,
        ).filter((event) => event.action === 'project.stage.changed'),
      ).toHaveLength(1);
    });

    async function stageFixture(allTasksDone = false) {
      await grant('template');
      await command('/company-project-stage-advancer-assignments', {
        workspaceMembershipId: membershipId,
        companyId,
      });
      const projectId = string((await createTemplate()).id);
      const plan = object(
        (await read(`/projects/${projectId}/template`)).template,
      );
      const stages = objects(plan.stages);
      const firstStage = stages[0];
      if (!firstStage) throw new Error('Missing first stage.');
      const requiredTasks = objects(firstStage.tasks);
      const selectedTasks = allTasksDone
        ? stages.flatMap((stage) => objects(stage.tasks))
        : requiredTasks;
      for (const task of selectedTasks)
        await command(`/tasks/${string(task.taskId)}/complete`, {
          expectedVersion: 1,
        });
      return {
        projectId,
        requiredTasks,
        path: `/projects/${projectId}/stage-advance`,
        intent: {
          expectedStageKey: 'scoping',
          expectedStageRevision: 0,
          targetStageKey: 'preparation',
        },
      };
    }
    async function grantStageReader() {
      const anaId = string(
        (await read('/access/current-actor', { subject: 'ana', company: '' }))
          .workspaceMembershipId,
      );
      for (const kind of ['project', 'client', 'task', 'template'] as const)
        await grant(kind, anaId);
      await command('/company-project-stage-advancer-assignments', {
        workspaceMembershipId: anaId,
        companyId,
      });
      return anaId;
    }
    async function stageCounts() {
      return (
        await harness.pool.query(
          `SELECT
        (SELECT count(*)::int FROM project_stage_commands) AS receipts,
        (SELECT count(*)::int FROM project_stage_transitions) AS transitions,
        (SELECT coalesce(sum(stage_revision),0)::int FROM project_template_instances) AS revisions,
        (SELECT version FROM client_accounts WHERE id = $1) AS fence`,
          [clientId],
        )
      ).rows;
    }
    /** Wait for an observed database lock, never elapsed time as proof of order. */
    async function observedWaiters(pattern: string, expected: number) {
      const deadline = Date.now() + 2000;
      do {
        const result = await harness.pool.query<{ count: string }>(
          `SELECT count(DISTINCT activity.pid)::text AS count
          FROM pg_locks waiting JOIN pg_stat_activity activity ON activity.pid = waiting.pid
          WHERE NOT waiting.granted AND activity.datname = current_database() AND activity.query ILIKE $1`,
          [pattern],
        );
        if (Number(result.rows[0]?.count) >= expected) return;
        await new Promise<void>((resolve) => setImmediate(resolve));
      } while (Date.now() < deadline);
      throw new Error(
        `Expected ${expected} observed lock waiters for ${pattern}.`,
      );
    }
    async function orderedClientCommands(
      first: () => Promise<Response>,
      second: () => Promise<Response>,
    ) {
      const barrier = await harness.pool.connect();
      let firstResponse: Promise<Response> | undefined,
        secondResponse: Promise<Response> | undefined;
      try {
        await barrier.query('BEGIN');
        await barrier.query(
          'SELECT id FROM client_accounts WHERE id = $1 FOR SHARE',
          [clientId],
        );
        firstResponse = first();
        await observedWaiters('%from "client_accounts"%for update%', 1);
        secondResponse = second();
        await observedWaiters('%from "client_accounts"%for update%', 2);
        await barrier.query('COMMIT');
        return [await firstResponse, await secondResponse];
      } finally {
        await barrier.query('ROLLBACK');
        barrier.release();
        // Drain the exact owned HTTP calls even if the ordering assertion fails.
        await firstResponse?.catch(() => undefined);
        await secondResponse?.catch(() => undefined);
      }
    }
    it.each(['reopen_first', 'advance_first'] as const)(
      'forces %s at the original Client barrier and preserves the winning outcome',
      async (order) => {
        const f = await stageFixture();
        await grantStageReader();
        const task = f.requiredTasks[0];
        if (!task) throw new Error('Missing gate Task.');
        const reopen = () =>
          request(`/tasks/${string(task.taskId)}/reopen`, {
            method: 'POST',
            value: { expectedVersion: 2 },
          });
        const advance = () =>
          request(f.path, { method: 'POST', value: f.intent, subject: 'ana' });
        const responses = await orderedClientCommands(
          order === 'reopen_first' ? reopen : advance,
          order === 'reopen_first' ? advance : reopen,
        );
        expect(responses.map((response) => response.status)).toEqual(
          order === 'reopen_first' ? [201, 409] : [201, 201],
        );
        const p = object(
          (await read(`/projects/${f.projectId}/stage-progress`)).progress,
        );
        expect(p.stageRevision).toBe(order === 'reopen_first' ? 0 : 1);
        expect(objects(p.transitions)).toHaveLength(
          order === 'reopen_first' ? 0 : 1,
        );
        expect(await read(`/tasks/${string(task.taskId)}`)).toMatchObject({
          task: { status: 'todo', version: 3 },
        });
        if (order === 'advance_first')
          expect(objects(p.transitions)[0]).toMatchObject({
            requiredTasks: [
              expect.objectContaining({ taskId: task.taskId, version: 2 }),
              expect.anything(),
            ],
          });
      },
    );
    it.each(['close_first', 'advance_first'] as const)(
      'forces %s against Project closure without changing Task or lifecycle contracts',
      async (order) => {
        const f = await stageFixture(true);
        await grantStageReader();
        await command('/company-project-approver-assignments', {
          workspaceMembershipId: membershipId,
          companyId,
        });
        const key = randomUUID();
        const advance = () =>
          request(f.path, {
            method: 'POST',
            value: f.intent,
            key,
            subject: 'ana',
          });
        const close = () =>
          request(`/projects/${f.projectId}/lifecycle-transitions`, {
            method: 'POST',
            value: {
              action: 'cancel',
              expectedLifecycleRevision: 0,
              reason: 'Explicit closure',
            },
          });
        const responses = await orderedClientCommands(
          order === 'close_first' ? close : advance,
          order === 'close_first' ? advance : close,
        );
        expect(responses.map((response) => response.status)).toEqual(
          order === 'close_first' ? [200, 409] : [201, 409],
        );
        if (order === 'advance_first') {
          expect((await close()).status).toBe(200);
          const before = await stageCounts();
          expect((await advance()).status).toBe(201);
          expect(await stageCounts()).toEqual(before);
        }
        expect(await read(`/projects/${f.projectId}`)).toMatchObject({
          status: 'cancelled',
        });
        expect(
          (
            await request(f.path, {
              method: 'POST',
              value: f.intent,
              subject: 'ana',
            })
          ).status,
        ).toBe(409);
      },
    );
    it('serializes identical in-flight retries at the actor key and keeps exactly one receipt, transition and fence advance', async () => {
      const f = await stageFixture();
      const key = randomUUID();
      const before = await stageCounts();
      const barrier = await harness.pool.connect();
      let first: Promise<Response> | undefined,
        second: Promise<Response> | undefined;
      try {
        await barrier.query('BEGIN');
        await barrier.query(
          'SELECT id FROM client_accounts WHERE id=$1 FOR SHARE',
          [clientId],
        );
        first = request(f.path, { method: 'POST', value: f.intent, key });
        await observedWaiters('%from "client_accounts"%for update%', 1);
        second = request(f.path, { method: 'POST', value: f.intent, key });
        await observedWaiters('%update "internal_users"%', 1);
        await barrier.query('COMMIT');
        const a = await first,
          b = await second;
        expect([a.status, b.status]).toEqual([201, 201]);
        expect(await body(b)).toEqual(await body(a));
      } finally {
        await barrier.query('ROLLBACK');
        barrier.release();
        await first?.catch(() => undefined);
        await second?.catch(() => undefined);
      }
      expect(await stageCounts()).toMatchObject([
        {
          receipts: 1,
          transitions: 1,
          revisions: 1,
          fence: Number(object(before[0]).fence) + 1,
        },
      ]);
    });
    it('rolls progress, receipt, event and original Client fence back together after a final write failure', async () => {
      const f = await stageFixture();
      const before = await stageCounts();
      const source = await read(`/projects/${f.projectId}/template`);
      const key = randomUUID();
      await harness.pool.query(
        `CREATE FUNCTION reject_stage_fence() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic final fence failure'; END $$`,
      );
      await harness.pool.query(
        `CREATE TRIGGER reject_stage_fence BEFORE UPDATE ON client_accounts FOR EACH ROW EXECUTE FUNCTION reject_stage_fence()`,
      );
      try {
        expect(
          (await request(f.path, { method: 'POST', value: f.intent, key }))
            .status,
        ).toBe(500);
        expect(await stageCounts()).toEqual(before);
        expect(
          await read(`/projects/${f.projectId}/stage-progress`),
        ).toMatchObject({ progress: { stageRevision: 0, transitions: [] } });
        expect(await read(`/projects/${f.projectId}/template`)).toEqual(source);
        expect(
          objects((await read('/activity-log')).events).filter(
            (event) => event.action === 'project.stage.changed',
          ),
        ).toEqual([]);
      } finally {
        await harness.pool.query(
          'DROP TRIGGER reject_stage_fence ON client_accounts',
        );
        await harness.pool.query('DROP FUNCTION reject_stage_fence()');
      }
      expect(
        (await request(f.path, { method: 'POST', value: f.intent, key }))
          .status,
      ).toBe(201);
    });
    it('rejects stale, unsupported and malformed intent without writes, then rechecks live dedicated and independent authority on exact committed replay', async () => {
      const f = await stageFixture();
      const before = await stageCounts();
      for (const value of [
        { ...f.intent, expectedStageRevision: 1 },
        { ...f.intent, targetStageKey: 'scoping' },
        { ...f.intent, expectedStageKey: 'preparation' },
      ])
        expect((await request(f.path, { method: 'POST', value })).status).toBe(
          409,
        );
      for (const value of [
        { ...f.intent, extra: true },
        { ...f.intent, expectedStageRevision: '0' },
        { ...f.intent, expectedStageRevision: -1 },
      ])
        expect((await request(f.path, { method: 'POST', value })).status).toBe(
          400,
        );
      expect(
        (await request(f.path, { method: 'POST', value: f.intent, key: null }))
          .status,
      ).toBe(400);
      expect(await stageCounts()).toEqual(before);
      const key = randomUUID();
      const receipt = await command(f.path, f.intent, { key });
      const committed = await stageCounts();
      const revoke = (path: string) =>
        request(`${path}/${membershipId}/${companyId}`, { method: 'DELETE' });
      expect(
        (await revoke('/company-project-stage-advancer-assignments')).status,
      ).toBe(200);
      expect(
        (await request(f.path, { method: 'POST', value: f.intent, key }))
          .status,
      ).toBe(403);
      // A stage-specific refusal does not revoke the independently authorized Project or Tasks.
      expect((await request(`/projects/${f.projectId}`)).status).toBe(200);
      expect((await request(`/projects/${f.projectId}/tasks`)).status).toBe(
        200,
      );
      expect(
        (await request(`/projects/${f.projectId}/stage-progress`)).status,
      ).toBe(200);
      await command('/company-project-stage-advancer-assignments', {
        workspaceMembershipId: membershipId,
        companyId,
      });
      expect(await command(f.path, f.intent, { key })).toEqual(receipt);
      expect((await revoke(assignments.task)).status).toBe(200);
      expect(
        (await request(f.path, { method: 'POST', value: f.intent, key }))
          .status,
      ).toBe(403);
      expect(
        (await request(`/projects/${f.projectId}/stage-progress`)).status,
      ).toBe(403);
      expect(await stageCounts()).toEqual(committed);
    });
    it('uses copied Task identities despite title correction and ignores unrelated done manual Tasks', async () => {
      await grant('template');
      await command('/company-project-stage-advancer-assignments', {
        workspaceMembershipId: membershipId,
        companyId,
      });
      const projectId = string((await createTemplate()).id);
      const stage = object(
        (await read(`/projects/${projectId}/stage-progress`)).progress,
      );
      const first = objects(stage.requiredTasks)[0];
      if (!first) throw new Error('Missing mapped Task.');
      const edit = await request(`/tasks/${string(first.taskId)}`, {
        method: 'PATCH',
        value: {
          expectedVersion: 1,
          title: 'Unrelated editable title',
          assigneeMembershipId: null,
          dueDate: null,
          priority: 'normal',
        },
      });
      expect(edit.status).toBe(200);
      for (const title of ['Clarifier la demande', 'Confirmer le périmètre']) {
        const manual = await command(`/projects/${projectId}/tasks`, { title });
        await command(`/tasks/${string(manual.id)}/complete`, {
          expectedVersion: 1,
        });
      }
      expect(
        (
          await request(`/projects/${projectId}/stage-advance`, {
            method: 'POST',
            value: {
              expectedStageKey: 'scoping',
              expectedStageRevision: 0,
              targetStageKey: 'preparation',
            },
          })
        ).status,
      ).toBe(409);
      const facts = object(
        (await read(`/projects/${projectId}/stage-progress`)).progress,
      );
      expect(objects(facts.requiredTasks).map((task) => task.taskId)).toEqual(
        objects(stage.requiredTasks).map((task) => task.taskId),
      );
      expect(objects(facts.requiredTasks)[0]).toMatchObject({
        title: 'Clarifier la demande',
        status: 'todo',
        version: 2,
      });
    });

    it.each(['revoke_first', 'advance_first'] as const)(
      'forces %s against successful dedicated authority revocation',
      async (order) => {
        const f = await stageFixture();
        const anaId = string(
          (await read('/access/current-actor', { subject: 'ana', company: '' }))
            .workspaceMembershipId,
        );
        for (const kind of ['project', 'client', 'task', 'template'] as const)
          await grant(kind, anaId);
        await command('/company-project-stage-advancer-assignments', {
          workspaceMembershipId: anaId,
          companyId,
        });
        const advance = () =>
          request(f.path, { method: 'POST', value: f.intent, subject: 'ana' });
        const revoke = () =>
          request(
            `/company-project-stage-advancer-assignments/${anaId}/${companyId}`,
            { method: 'DELETE' },
          );
        const barrier = await harness.pool.connect();
        let first: Promise<Response> | undefined,
          second: Promise<Response> | undefined;
        try {
          await barrier.query('BEGIN');
          if (order === 'revoke_first') {
            await barrier.query(
              `SELECT id FROM company_role_assignments WHERE workspace_membership_id=$1 AND bundle='company_project_stage_advancer' FOR SHARE`,
              [anaId],
            );
            first = revoke();
            await observedWaiters('%update "company_role_assignments"%', 1);
            second = advance();
            await observedWaiters('%update "internal_users"%', 1);
          } else {
            await barrier.query(
              'SELECT id FROM client_accounts WHERE id=$1 FOR SHARE',
              [clientId],
            );
            first = advance();
            await observedWaiters('%from "client_accounts"%for update%', 1);
            second = revoke();
            await observedWaiters(
              '%from "workspace_memberships"%for update%',
              1,
            );
          }
          await barrier.query('COMMIT');
          expect([(await first).status, (await second).status]).toEqual(
            order === 'revoke_first' ? [200, 403] : [201, 200],
          );
        } finally {
          await barrier.query('ROLLBACK');
          barrier.release();
          await first?.catch(() => undefined);
          await second?.catch(() => undefined);
        }
        expect((await advance()).status).toBe(403);
        const progress = object(
          (
            await read(`/projects/${f.projectId}/stage-progress`, {
              subject: 'ana',
            })
          ).progress,
        );
        expect(progress.stageRevision).toBe(order === 'revoke_first' ? 0 : 1);
        expect(
          (await request(`/projects/${f.projectId}/tasks`, { subject: 'ana' }))
            .status,
        ).toBe(200);
      },
    );
    it.each(['suspend_first', 'advance_first'] as const)(
      'forces %s against membership suspension',
      async (order) => {
        const f = await stageFixture();
        const anaId = string(
          (await read('/access/current-actor', { subject: 'ana', company: '' }))
            .workspaceMembershipId,
        );
        for (const kind of ['project', 'client', 'task', 'template'] as const)
          await grant(kind, anaId);
        await command('/company-project-stage-advancer-assignments', {
          workspaceMembershipId: anaId,
          companyId,
        });
        const advance = () =>
          request(f.path, { method: 'POST', value: f.intent, subject: 'ana' });
        const suspend = () =>
          request('/workspace-membership-suspensions', {
            method: 'POST',
            value: { workspaceMembershipId: anaId },
          });
        const barrier = await harness.pool.connect();
        let first: Promise<Response> | undefined,
          second: Promise<Response> | undefined;
        try {
          await barrier.query('BEGIN');
          if (order === 'suspend_first') {
            // The public suspension first holds its target authority rows FOR UPDATE.
            // Block only its following receipt INSERT, then observe the stage actor waiting
            // behind that already-held authority. A shared target row alone cannot force it.
            await barrier.query(
              'LOCK TABLE workspace_membership_suspension_commands IN SHARE MODE',
            );
            first = suspend();
            await observedWaiters(
              '%insert into "workspace_membership_suspension_commands"%',
              1,
            );
            second = advance();
            await observedWaiters('%update "internal_users"%', 1);
          } else {
            await barrier.query(
              'SELECT id FROM client_accounts WHERE id=$1 FOR SHARE',
              [clientId],
            );
            first = advance();
            await observedWaiters('%from "client_accounts"%for update%', 1);
            second = suspend();
            await observedWaiters(
              '%from "workspace_memberships"%for update%',
              1,
            );
          }
          await barrier.query('COMMIT');
          expect([(await first).status, (await second).status]).toEqual(
            order === 'suspend_first' ? [201, 403] : [201, 201],
          );
        } finally {
          await barrier.query('ROLLBACK');
          barrier.release();
          await first?.catch(() => undefined);
          await second?.catch(() => undefined);
        }
        expect((await advance()).status).toBe(403);
        expect(
          object(
            (await read(`/projects/${f.projectId}/stage-progress`)).progress,
          ).stageRevision,
        ).toBe(order === 'suspend_first' ? 0 : 1);
        expect(
          (
            await request(`/projects/${f.projectId}/stage-progress`, {
              subject: 'ana',
            })
          ).status,
        ).toBe(403);
      },
    );
    it('confirms an exact historical receipt after original Client supersession but refuses new mutation without exposing union details', async () => {
      const f = await stageFixture();
      const key = randomUUID();
      const receipt = await command(f.path, f.intent, { key });
      const second = string(
        (
          await command('/clients', {
            displayName: 'Historical second identity',
          })
        ).id,
      );
      // Controlled legacy duplicate fixture; the governed union itself uses REST.
      await harness.pool.query(
        "UPDATE client_accounts SET tax_id='STAGE-687-LEGACY' WHERE id=ANY($1::uuid[])",
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
      const before = await stageCounts();
      expect(await command(f.path, f.intent, { key })).toEqual(receipt);
      expect(
        (await request(f.path, { method: 'POST', value: f.intent })).status,
      ).toBe(404);
      const progress = await read(`/projects/${f.projectId}/stage-progress`);
      expect(progress).toMatchObject({
        progress: { currentStageKey: 'preparation', stageRevision: 1 },
      });
      expect(JSON.stringify(progress)).not.toContain('canonicalClient');
      expect(await stageCounts()).toEqual(before);
    });
    it('conflicts on every changed normalized intent under an actor key, including a different Project or authorized Company', async () => {
      const f = await stageFixture();
      const key = randomUUID();
      await command(f.path, f.intent, { key });
      for (const value of [
        { ...f.intent, expectedStageKey: 'preparation' },
        { ...f.intent, expectedStageRevision: 1 },
        { ...f.intent, targetStageKey: 'scoping' },
      ])
        expect(
          (await request(f.path, { method: 'POST', value, key })).status,
        ).toBe(409);
      const otherProject = string((await createTemplate()).id);
      expect(
        (
          await request(`/projects/${otherProject}/stage-advance`, {
            method: 'POST',
            value: f.intent,
            key,
          })
        ).status,
      ).toBe(409);
      const originalCompany = companyId;
      const company = string(
        (
          await command('/companies', {
            displayName: 'Other stage-intent Company',
          })
        ).id,
      );
      companyId = company;
      for (const kind of ['project', 'client', 'task', 'template'] as const)
        await grant(kind);
      await command('/company-project-stage-advancer-assignments', {
        workspaceMembershipId: membershipId,
        companyId,
      });
      expect(
        (await request(f.path, { method: 'POST', value: f.intent, key }))
          .status,
      ).toBe(409);
      companyId = originalCompany;
      expect(await command(f.path, f.intent, { key })).toMatchObject({
        projectId: f.projectId,
        stageRevision: 1,
      });
    });

    it('reveals no stage facts or Activity identifiers to another Company or Workspace and grants no implicit advance authority', async () => {
      const f = await stageFixture();
      await command(f.path, f.intent);
      const otherCompany = string(
        (await command('/companies', { displayName: 'Independent Company' }))
          .id,
      );
      const originalCompany = companyId;
      companyId = otherCompany;
      for (const kind of ['project', 'client', 'task', 'template'] as const)
        await grant(kind);
      await command('/company-project-stage-advancer-assignments', {
        workspaceMembershipId: membershipId,
        companyId,
      });
      expect(
        (await request(`/projects/${f.projectId}/stage-progress`)).status,
      ).toBe(404);
      expect(
        (await request(f.path, { method: 'POST', value: f.intent })).status,
      ).toBe(404);
      expect(JSON.stringify(await read('/activity-log'))).not.toContain(
        f.projectId,
      );
      expect(
        (
          await request(`/projects/${f.projectId}/stage-progress`, {
            company: originalCompany,
            subject: 'uninvited',
          })
        ).status,
      ).toBe(403);
      companyId = originalCompany;
      expect(
        (
          await request(`/projects/${f.projectId}/stage-progress`, {
            workspace: '00000000-0000-4000-8000-000000000999',
          })
        ).status,
      ).toBe(403);
      const actor = object((await read('/access/current-actor')).activeCompany);
      expect(actor.projectStagePermissions).toEqual(['project.stage.advance']);
      expect(actor.projectTemplatePermissions).toEqual([
        'project.template.read',
        'project.template.instantiate',
      ]);
      expect(actor.projectPermissions).not.toContain('project.stage.advance');
    });

    it('reads source definitions without Client access while protecting every real Project and Task boundary', async () => {
      await grant('template');
      const projectId = string((await createTemplate()).id);
      const member = await read('/access/current-actor', {
        subject: 'ana',
        company: '',
      });
      const anaId = string(member.workspaceMembershipId);
      await grant('project', anaId);
      await grant('task', anaId);
      await grant('template', anaId);
      const before = await countRows();
      const catalogue = await read('/project-templates', { subject: 'ana' });
      expect(objects(catalogue.templates)).toHaveLength(1);
      expect(objects(catalogue.templates)[0]).toMatchObject({
        templateKey,
        version: 1,
        illustrative: true,
      });
      for (const path of [
        '/clients',
        '/projects',
        `/projects/${projectId}`,
        `/projects/${projectId}/template`,
        `/projects/${projectId}/tasks`,
      ])
        expect((await request(path, { subject: 'ana' })).status).toBe(403);
      expect(
        (
          await request('/projects/from-template', {
            method: 'POST',
            value: creation(),
            subject: 'ana',
          })
        ).status,
      ).toBe(403);
      expect(await countRows()).toEqual(before);
      await grant('client', anaId);
      expect(
        (await read(`/projects/${projectId}/template`, { subject: 'ana' }))
          .template,
      ).toMatchObject({ templateKey, version: 1 });
      expect(
        (
          await request(`${assignments.client}/${anaId}/${companyId}`, {
            method: 'DELETE',
          })
        ).status,
      ).toBe(200);
      expect(
        (await request(`/projects/${projectId}/template`, { subject: 'ana' }))
          .status,
      ).toBe(403);
      expect(
        (await request('/project-templates', { subject: 'ana' })).status,
      ).toBe(200);
      expect(await countRows()).toEqual(before);
    });

    it('creates and reloads four independent unassigned Tasks from the exact illustrative v1', async () => {
      await grant('template');
      const catalogue = await read('/project-templates');
      expect(catalogue.templates).toEqual([
        {
          templateKey,
          version: 1,
          title: 'Préparation d’une mission de conseil',
          illustrative: true,
          stages: [
            {
              key: 'scoping',
              title: 'Cadrage',
              tasks: [
                {
                  key: 'clarify_request',
                  title: 'Clarifier la demande',
                  required: true,
                },
                {
                  key: 'confirm_scope',
                  title: 'Confirmer le périmètre',
                  required: true,
                },
              ],
            },
            {
              key: 'preparation',
              title: 'Préparation',
              tasks: [
                {
                  key: 'collect_questionnaire',
                  title: 'Recueillir le questionnaire',
                  required: true,
                },
                {
                  key: 'prepare_plan',
                  title: 'Préparer le plan',
                  required: true,
                },
              ],
            },
          ],
        },
      ]);
      const created = await command('/projects/from-template', {
        title: 'Préparation {exacte} — Демо',
        clientAccountId: clientId,
        templateKey,
        templateVersion: 1,
      });
      const projectId = string(created.id);
      expect(await read(`/projects/${projectId}`)).toMatchObject({
        id: projectId,
        title: 'Préparation {exacte} — Демо',
        companyId,
        clientAccountId: clientId,
        status: 'preparatory',
      });
      const plan = object(
        (await read(`/projects/${projectId}/template`)).template,
      );
      expect(plan).toMatchObject({
        templateKey,
        version: 1,
        illustrative: true,
        title: 'Préparation d’une mission de conseil',
      });
      const listedTasks = objects(
        (await read(`/projects/${projectId}/tasks`)).tasks,
      );
      expect(listedTasks.map((task) => task.title).sort()).toEqual([
        'Clarifier la demande',
        'Confirmer le périmètre',
        'Préparer le plan',
        'Recueillir le questionnaire',
      ]);
      expect(new Set(listedTasks.map((task) => task.id)).size).toBe(4);
      for (const task of listedTasks) {
        expect(task).toMatchObject({
          status: 'todo',
          version: 1,
          priority: 'normal',
          assignee: null,
          dueDate: null,
        });
        const history = await read(`/tasks/${string(task.id)}/history`);
        expect(objects(history.events)).toHaveLength(1);
      }
      const stages = objects(plan.stages);
      expect(stages.map((stage) => stage.title)).toEqual([
        'Cadrage',
        'Préparation',
      ]);
      expect(
        stages
          .flatMap((stage) => objects(stage.tasks).map((task) => task.taskId))
          .sort(),
      ).toEqual(listedTasks.map((task) => task.id).sort());
    });
    it('keeps assignment and completion explicit, records normal Task history and never starts a mission', async () => {
      await grant('template');
      const created = await createTemplate();
      const projectId = string(created.id);
      const source = await read(`/projects/${projectId}/template`);
      const copiedTasks = objects(
        (await read(`/projects/${projectId}/tasks`)).tasks,
      );
      const firstTask = copiedTasks.find(
        (task) => task.title === 'Clarifier la demande',
      );
      if (!firstTask)
        throw new Error('The first required Task was not copied.');
      const taskId = string(firstTask.id);
      const member = await read('/access/current-actor', {
        subject: 'ana',
        company: '',
      });
      const anaId = string(member.workspaceMembershipId);
      await grant('project', anaId);
      await grant('client', anaId);
      await grant('task', anaId);
      const eligibleAssignee = objects(
        (await read(`/projects/${projectId}/eligible-task-assignees`)).members,
      ).find((candidate) => candidate.workspaceMembershipId === anaId);
      if (!eligibleAssignee)
        throw new Error('The explicitly authorized Task member is ineligible.');
      const anaLabel = string(eligibleAssignee.displayLabel);
      const assignedResponse = await request(`/tasks/${taskId}`, {
        method: 'PATCH',
        value: { expectedVersion: 1, assigneeMembershipId: anaId },
      });
      expect(assignedResponse.status).toBe(200);
      expect(await body(assignedResponse)).toMatchObject({
        status: 'todo',
        version: 2,
        assignee: { workspaceMembershipId: anaId, displayLabel: anaLabel },
      });
      const completed = await command(
        `/tasks/${taskId}/complete`,
        { expectedVersion: 2 },
        { subject: 'ana' },
      );
      expect(completed).toMatchObject({
        status: 'done',
        version: 3,
        assignee: { workspaceMembershipId: anaId },
        completion: { actor: { workspaceMembershipId: anaId } },
      });
      expect(await read(`/projects/${projectId}/template`)).toEqual(source);
      expect(await read(`/projects/${projectId}`)).toMatchObject({
        status: 'preparatory',
      });
      const history = objects((await read(`/tasks/${taskId}/history`)).events);
      expect(history.map((event) => event.action)).toEqual([
        'task.created',
        'task.updated',
        'task.completed',
      ]);
      expect(history.map((event) => object(event.metadata).version)).toEqual([
        1, 2, 3,
      ]);
      await command(`/tasks/${taskId}/reopen`, { expectedVersion: 3 });
      expect(await read(`/tasks/${taskId}`)).toMatchObject({
        mutable: true,
        task: { status: 'todo', version: 4, completion: null },
      });
      expect(await read(`/projects/${projectId}/template`)).toEqual(source);
      for (const task of copiedTasks.filter((task) => task.id !== taskId))
        expect(await read(`/tasks/${string(task.id)}`)).toMatchObject({
          mutable: true,
          task: { status: 'todo', version: 1, assignee: null },
        });
    });

    it('requires an opt-in captured grant independently from Project and Task rights and honours its revocation', async () => {
      expect((await request('/project-templates')).status).toBe(403);
      expect(
        (
          await request('/projects/from-template', {
            method: 'POST',
            value: creation(),
          })
        ).status,
      ).toBe(403);
      expect(await countRows()).toEqual([
        {
          projects: 0,
          tasks: 0,
          project_events: 0,
          task_events: 0,
          instances: 0,
          copies: 0,
        },
      ]);
      const member = await read('/access/current-actor', {
        subject: 'ana',
        company: '',
      });
      const anaId = string(member.workspaceMembershipId);
      await grant('template', anaId);
      // The dedicated grant supplies neither Company context nor the existing prerequisites.
      expect(
        (await request('/project-templates', { subject: 'ana' })).status,
      ).toBe(403);
      await grant('project', anaId);
      expect(
        (await request('/project-templates', { subject: 'ana' })).status,
      ).toBe(200);
      // Source catalogue access needs no Client grant; real Project reads do.
      expect((await request('/projects', { subject: 'ana' })).status).toBe(403);
      // Existing Project data still needs independent Client read.
      await grant('client', anaId);
      expect(
        (await request('/project-templates', { subject: 'ana' })).status,
      ).toBe(200);
      expect(
        (
          await request('/projects/from-template', {
            method: 'POST',
            value: creation(),
            subject: 'ana',
          })
        ).status,
      ).toBe(403);
      await grant('template');
      const projectId = string((await createTemplate()).id);
      expect(
        (await request(`/projects/${projectId}/template`, { subject: 'ana' }))
          .status,
      ).toBe(403);
      const revoke = await request(
        `${assignments.template}/${membershipId}/${companyId}`,
        { method: 'DELETE' },
      );
      expect(revoke.status).toBe(200);
      expect(await body(revoke)).toMatchObject({
        active: false,
        bundle: 'Company Project Template User',
        permissionSetVersion: 'v1',
      });
      expect((await request('/project-templates')).status).toBe(403);
      expect((await request(`/projects/${projectId}/template`)).status).toBe(
        403,
      );
      expect(
        (
          await request('/projects/from-template', {
            method: 'POST',
            value: creation(),
          })
        ).status,
      ).toBe(403);
      // A revoked Template grant does not revoke independent ordinary Task access.
      expect(
        objects((await read(`/projects/${projectId}/tasks`)).tasks),
      ).toHaveLength(4);
      expect(
        object((await read('/access/current-actor')).activeCompany)
          .projectTemplatePermissions,
      ).toBeUndefined();
    });

    it('serializes concurrent retries of the complete creation intent and refuses changed intent or a manual Project key', async () => {
      await grant('template');
      const key = randomUUID();
      const [first, retry] = await Promise.all([
        createTemplate({ key }),
        createTemplate({ key }),
      ]);
      expect(retry).toEqual(first);
      const clientAfterCreation = await read(`/clients/${clientId}`);
      expect(await createTemplate({ key })).toEqual(first);
      expect(await read(`/clients/${clientId}`)).toEqual(clientAfterCreation);
      expect(await countRows()).toEqual([
        {
          projects: 1,
          tasks: 4,
          project_events: 1,
          task_events: 4,
          instances: 1,
          copies: 4,
        },
      ]);
      const plan = await read(`/projects/${string(first.id)}/template`);
      const copiedTasks = await read(`/projects/${string(first.id)}/tasks`);
      const manualReuse = await request('/projects', {
        method: 'POST',
        key,
        value: { title: 'Copied preparation', clientAccountId: clientId },
      });
      expect(manualReuse.status).toBe(409);
      expect(await read(`/projects/${string(first.id)}`)).toEqual(first);
      expect(await read(`/projects/${string(first.id)}/tasks`)).toEqual(
        copiedTasks,
      );
      expect(await read(`/projects/${string(first.id)}/template`)).toEqual(
        plan,
      );
      expect(await createTemplate({ key })).toEqual(first);
      expect(await read(`/clients/${clientId}`)).toEqual(clientAfterCreation);
      expect(await countRows()).toEqual([
        {
          projects: 1,
          tasks: 4,
          project_events: 1,
          task_events: 4,
          instances: 1,
          copies: 4,
        },
      ]);
      const mismatch = await request('/projects/from-template', {
        method: 'POST',
        key,
        value: creation({ title: 'Changed intent' }),
      });
      expect(mismatch.status).toBe(409);
      expect(await read(`/projects/${string(first.id)}/template`)).toEqual(
        plan,
      );
      const manualKey = randomUUID();
      const manual = await command(
        '/projects',
        { title: 'Copied preparation', clientAccountId: clientId },
        { key: manualKey },
      );
      const conflict = await request('/projects/from-template', {
        method: 'POST',
        key: manualKey,
        value: creation(),
      });
      expect(conflict.status).toBe(409);
      expect(await read(`/projects/${string(manual.id)}/template`)).toEqual({
        template: null,
      });
      expect(await read(`/projects/${string(manual.id)}/tasks`)).toMatchObject({
        tasks: [],
      });
      expect(await countRows()).toEqual([
        {
          projects: 2,
          tasks: 4,
          project_events: 2,
          task_events: 4,
          instances: 1,
          copies: 4,
        },
      ]);
    });

    it('does not expose another Company’s Project or accept its original Client as a creation reference', async () => {
      await grant('template');
      const originalCompany = companyId;
      const originalClient = clientId;
      const originalKey = randomUUID();
      const originalIntent = creation();
      const projectId = string((await createTemplate({ key: originalKey })).id);
      companyId = string(
        (await command('/companies', { displayName: 'Other Company' })).id,
      );
      await grant('project');
      await grant('client');
      await grant('task');
      await grant('template');
      // The actor owns this receipt in the Workspace. Changed authorized
      // Company conflicts before checking the now-unreadable original target.
      expect(
        (
          await request('/projects/from-template', {
            method: 'POST',
            key: originalKey,
            value: originalIntent,
          })
        ).status,
      ).toBe(409);
      expect((await request(`/projects/${projectId}/template`)).status).toBe(
        404,
      );
      expect(
        (
          await request('/projects/from-template', {
            method: 'POST',
            value: creation({ clientAccountId: originalClient }),
          })
        ).status,
      ).toBe(404);
      expect(await countRows()).toEqual([
        {
          projects: 1,
          tasks: 4,
          project_events: 1,
          task_events: 4,
          instances: 1,
          copies: 4,
        },
      ]);
      expect(
        (await read(`/projects/${projectId}`, { company: originalCompany })).id,
      ).toBe(projectId);
    });

    it('retains historical copied provenance and exact replay after Project closure without making copied Tasks mutable', async () => {
      await grant('template');
      await command('/company-project-approver-assignments', {
        workspaceMembershipId: membershipId,
        companyId,
      });
      const key = randomUUID();
      const projectId = string((await createTemplate({ key })).id);
      const source = await read(`/projects/${projectId}/template`);
      const copiedTasks = objects(
        (await read(`/projects/${projectId}/tasks`)).tasks,
      );
      const taskId = string(copiedTasks[0]?.id);
      for (const task of copiedTasks)
        await command(`/tasks/${string(task.id)}/complete`, {
          expectedVersion: 1,
        });
      const close = await request(
        `/projects/${projectId}/lifecycle-transitions`,
        {
          method: 'POST',
          value: {
            action: 'cancel',
            expectedLifecycleRevision: 0,
            reason: 'Illustrative Project is no longer needed.',
          },
        },
      );
      expect(close.status).toBe(200);
      const clientAfterClosure = await read(`/clients/${clientId}`);
      expect(await createTemplate({ key })).toMatchObject({
        id: projectId,
        status: 'cancelled',
      });
      expect(await read(`/clients/${clientId}`)).toEqual(clientAfterClosure);
      expect(await read(`/projects/${projectId}/template`)).toEqual(source);
      expect(
        (
          await request(`/tasks/${taskId}/reopen`, {
            method: 'POST',
            value: { expectedVersion: 2 },
          })
        ).status,
      ).toBe(409);
      expect(await read(`/tasks/${taskId}`)).toMatchObject({
        mutable: false,
        task: { status: 'done', version: 2 },
      });
      expect(await countRows()).toEqual([
        {
          projects: 1,
          tasks: 4,
          project_events: 1,
          task_events: 8,
          instances: 1,
          copies: 4,
        },
      ]);
    });

    it('rejects unsupported or caller-controlled Template input without creating a Project, Task or success event', async () => {
      await grant('template');
      const invalid: unknown[] = [
        null,
        [],
        {},
        creation({ templateKey: 'UNAPPROVED' }),
        creation({ templateVersion: 2 }),
        creation({ templateVersion: '1' }),
        creation({ title: '   ' }),
        creation({ title: 'x'.repeat(201) }),
        creation({ clientAccountId: 'invalid' }),
        creation({ stages: [] }),
        creation({ status: 'active' }),
        creation({ assigneeMembershipId: membershipId }),
      ];
      for (const value of invalid)
        expect(
          (await request('/projects/from-template', { method: 'POST', value }))
            .status,
        ).toBe(400);
      expect(
        (
          await request('/projects/from-template', {
            method: 'POST',
            value: creation(),
            key: null,
          })
        ).status,
      ).toBe(400);
      expect(await countRows()).toEqual([
        {
          projects: 0,
          tasks: 0,
          project_events: 0,
          task_events: 0,
          instances: 0,
          copies: 0,
        },
      ]);
    });

    it('rolls back the Project and all copied Tasks and events if a later copied Task cannot be persisted, then retries the same key', async () => {
      await grant('template');
      const key = randomUUID();
      await harness.pool
        .query(`CREATE FUNCTION reject_template_second_task() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.title = 'Confirmer le périmètre' THEN RAISE EXCEPTION 'Injected persistence boundary failure'; END IF; RETURN NEW; END $$`);
      await harness.pool.query(
        `CREATE TRIGGER reject_template_second_task BEFORE INSERT ON tasks FOR EACH ROW EXECUTE FUNCTION reject_template_second_task()`,
      );
      try {
        expect(
          (
            await request('/projects/from-template', {
              method: 'POST',
              key,
              value: creation(),
            })
          ).status,
        ).toBe(500);
        expect(await countRows()).toEqual([
          {
            projects: 0,
            tasks: 0,
            project_events: 0,
            task_events: 0,
            instances: 0,
            copies: 0,
          },
        ]);
      } finally {
        await harness.pool.query(
          'DROP TRIGGER reject_template_second_task ON tasks',
        );
        await harness.pool.query('DROP FUNCTION reject_template_second_task()');
      }
      await createTemplate({ key });
      expect(await countRows()).toEqual([
        {
          projects: 1,
          tasks: 4,
          project_events: 1,
          task_events: 4,
          instances: 1,
          copies: 4,
        },
      ]);
    });
  },
);
