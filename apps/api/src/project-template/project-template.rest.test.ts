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
