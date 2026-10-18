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
const workspaceId = '00000000-0000-4000-8000-000000000695';
const templateKey = 'CONSULTING_PREPARATION_ILLUSTRATIVE';
const owner = 'template-version-owner';
const assignments = {
  client: '/company-director-client-assignments',
  project: '/company-project-assignments',
  task: '/company-task-manager-assignments',
  template: '/company-project-template-user-assignments',
  configuration: '/company-project-template-configuration-assignments',
};
const originalTitles = [
  'Clarifier la demande',
  'Confirmer le périmètre',
  'Recueillir le questionnaire',
  'Préparer le plan',
];
const successorTitles = {
  clarify_request: 'Clarifier la demande {successeur} — Демо',
  confirm_scope: 'Confirmer le périmètre',
  collect_questionnaire: 'Recueillir le questionnaire',
  prepare_plan: 'Préparer le plan',
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
  'Company illustrative Template successors',
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
        namePrefix: 'template_version',
      });
      harness = await createPostgresRestTestHarness({
        databaseUrl: database.targetUrl,
        environment: {
          NODE_ENV: 'test',
          ACCESS_IDENTITY_MODE: 'test',
          ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
          ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: owner,
          ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
          ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Template successor tests',
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
        (await command('/companies', { displayName: 'Successor Company' })).id,
      );
      await grant('client');
      await grant('project');
      await grant('task');
      await grant('template');
      clientId = string(
        (await command('/clients', { displayName: 'Original Client' })).id,
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
          'x-test-display-name': subject === owner ? 'Version Owner' : subject,
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
    function creation(version: number, title: string) {
      return {
        title,
        clientAccountId: clientId,
        templateKey,
        templateVersion: version,
      };
    }

    async function grantAnaConfiguration() {
      const anaId = string(
        (await read('/access/current-actor', { subject: 'ana', company: '' }))
          .workspaceMembershipId,
      );
      await command('/company-context-assignments', {
        workspaceMembershipId: anaId,
        companyId,
      });
      for (const kind of [
        'project',
        'template',
        'configuration',
      ] satisfies (keyof typeof assignments)[])
        await grant(kind, anaId);
      return anaId;
    }

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

    it('publishes a compatible successor, selects its exact Version and preserves the original Project copies and histories', async () => {
      const projectA = string(
        (await command('/projects/from-template', creation(1, 'Original A')))
          .id,
      );
      await command('/company-project-stage-advancer-assignments', {
        workspaceMembershipId: membershipId,
        companyId,
      });
      const initialA = object(
        (await read(`/projects/${projectA}/stage-progress`)).progress,
      );
      const requiredA = objects(initialA.requiredTasks);
      const firstA = string(requiredA[0]?.taskId);
      const secondA = string(requiredA[1]?.taskId);
      await command(`/tasks/${firstA}/complete`, { expectedVersion: 1 });
      await command(`/tasks/${firstA}/reopen`, { expectedVersion: 2 });
      await command(`/tasks/${firstA}/complete`, { expectedVersion: 3 });
      await command(`/tasks/${secondA}/complete`, { expectedVersion: 1 });
      await command(`/projects/${projectA}/stage-advance`, {
        expectedStageKey: 'scoping',
        expectedStageRevision: 0,
        targetStageKey: 'preparation',
      });
      await command(`/tasks/${firstA}/reopen`, { expectedVersion: 4 });
      const progressA = await read(`/projects/${projectA}/stage-progress`);
      expect(progressA).toMatchObject({
        progress: {
          currentStageKey: 'preparation',
          stageRevision: 1,
          transitions: [
            {
              requiredTasks: [
                { taskId: firstA, version: 4 },
                { taskId: secondA, version: 2 },
              ],
            },
          ],
        },
      });
      const sourceA = await read(`/projects/${projectA}/template`);
      const tasksA = await read(`/projects/${projectA}/tasks`);
      const historiesA = await Promise.all(
        objects(tasksA.tasks).map((task) =>
          read(`/tasks/${string(task.id)}/history`),
        ),
      );
      const clientBefore = await read(`/clients/${clientId}`);
      await grant('configuration');
      const receipt = await command(
        `/project-templates/${templateKey}/versions`,
        {
          sourceVersion: 1,
          expectedHeadVersion: 1,
          taskTitles: successorTitles,
        },
      );
      expect(receipt).toMatchObject({
        templateKey,
        version: 2,
        sourceVersion: 1,
      });
      const exact = await read(`/project-templates/${templateKey}/versions/2`);
      expect(exact).toMatchObject({
        template: {
          templateKey,
          version: 2,
          title: 'Préparation d’une mission de conseil',
          illustrative: true,
        },
      });
      expect(await read(`/clients/${clientId}`)).toEqual(clientBefore);
      const projectB = string(
        (await command('/projects/from-template', creation(2, 'Successor B')))
          .id,
      );
      expect(projectB).not.toBe(projectA);
      expect(await read(`/projects/${projectA}/template`)).toEqual(sourceA);
      expect(await read(`/projects/${projectA}/tasks`)).toEqual(tasksA);
      expect(await read(`/projects/${projectA}/stage-progress`)).toEqual(
        progressA,
      );
      expect(
        await Promise.all(
          objects(tasksA.tasks).map((task) =>
            read(`/tasks/${string(task.id)}/history`),
          ),
        ),
      ).toEqual(historiesA);
      const planB = object(
        (await read(`/projects/${projectB}/template`)).template,
      );
      expect(planB.version).toBe(2);
      expect(
        objects(planB.stages).flatMap((stage) =>
          objects(stage.tasks).map((task) => task.title),
        ),
      ).toEqual(Object.values(successorTitles));
      const tasksB = objects((await read(`/projects/${projectB}/tasks`)).tasks);
      expect(tasksB).toHaveLength(4);
      const copiedB = objects(planB.stages).flatMap((stage) =>
        objects(stage.tasks),
      );
      expect(
        copiedB.map(
          (copy) => tasksB.find((task) => task.id === copy.taskId)?.title,
        ),
      ).toEqual(Object.values(successorTitles));
      const copiedA = objects(object(sourceA.template).stages).flatMap(
        (stage) => objects(stage.tasks),
      );
      expect(
        copiedA.map(
          (copy) =>
            objects(tasksA.tasks).find((task) => task.id === copy.taskId)
              ?.title,
        ),
      ).toEqual(originalTitles);
      for (const task of tasksB) {
        expect(task).toMatchObject({
          status: 'todo',
          priority: 'normal',
          assignee: null,
          dueDate: null,
        });
        expect(
          objects(tasksA.tasks).map((original) => original.id),
        ).not.toContain(task.id);
      }
      const stagePathB = `/projects/${projectB}/stage-advance`;
      const stageIntent = {
        expectedStageKey: 'scoping',
        expectedStageRevision: 0,
        targetStageKey: 'preparation',
      };
      expect(
        (await request(stagePathB, { method: 'POST', value: stageIntent }))
          .status,
      ).toBe(409);
      const requiredB = objects(
        object((await read(`/projects/${projectB}/stage-progress`)).progress)
          .requiredTasks,
      );
      for (const task of requiredB)
        await command(`/tasks/${string(task.taskId)}/complete`, {
          expectedVersion: 1,
        });
      await command(stagePathB, stageIntent);
      const reachedB = await read(`/projects/${projectB}/stage-progress`);
      expect(reachedB).toMatchObject({
        progress: {
          currentStageKey: 'preparation',
          stageRevision: 1,
          transitions: [
            {
              requiredTasks: requiredB.map((task) => ({
                taskId: task.taskId,
                version: 2,
              })),
            },
          ],
        },
      });
      await command(`/tasks/${string(requiredB[0]?.taskId)}/reopen`, {
        expectedVersion: 2,
      });
      expect(await read(`/projects/${projectB}/stage-progress`)).toEqual(
        reachedB,
      );
      expect(await read(`/projects/${projectA}/stage-progress`)).toEqual(
        progressA,
      );
      expect(await read(`/projects/${projectA}/tasks`)).toEqual(tasksA);
      expect(
        await Promise.all(
          objects(tasksA.tasks).map((task) =>
            read(`/tasks/${string(task.id)}/history`),
          ),
        ),
      ).toEqual(historiesA);
      const historical = string(
        (
          await command(
            '/projects/from-template',
            creation(1, 'Historical v1 after v2'),
          )
        ).id,
      );
      expect(
        object((await read(`/projects/${historical}/template`)).template)
          .version,
      ).toBe(1);
    });
    it('converges identical concurrent normalized intentions on one live-authorized receipt before rejecting its old head', async () => {
      await grant('configuration');
      const path = `/project-templates/${templateKey}/versions`;
      const key = randomUUID();
      const intent = {
        sourceVersion: 1,
        expectedHeadVersion: 1,
        taskTitles: successorTitles,
      };
      const normalizedRetry = {
        ...intent,
        taskTitles: {
          prepare_plan: '  Préparer le plan  ',
          collect_questionnaire: ' Recueillir le questionnaire ',
          confirm_scope: ' Confirmer le périmètre ',
          clarify_request: `  ${successorTitles.clarify_request}  `,
        },
      };
      const barrier = await harness.pool.connect();
      let first: Promise<Response> | undefined;
      let second: Promise<Response> | undefined;
      let receipt: Record<string, unknown> | undefined;
      try {
        await barrier.query('BEGIN');
        await barrier.query(
          'LOCK TABLE project_template_versions IN SHARE MODE',
        );
        first = request(path, { method: 'POST', value: intent, key });
        await observedWaiters('%insert into "project_template_versions"%', 1);
        second = request(path, { method: 'POST', value: normalizedRetry, key });
        await observedWaiters('%update "internal_users"%', 1);
        await barrier.query('COMMIT');
        const firstResponse = await first;
        const secondResponse = await second;
        expect([firstResponse.status, secondResponse.status]).toEqual([
          201, 201,
        ]);
        receipt = await body(firstResponse);
        expect(await body(secondResponse)).toEqual(receipt);
      } finally {
        await barrier.query('ROLLBACK');
        barrier.release();
        await first?.catch(() => undefined);
        await second?.catch(() => undefined);
      }
      expect(receipt).toMatchObject({
        templateKey,
        version: 2,
        sourceVersion: 1,
      });
      const catalogue = await read('/project-templates');
      expect(
        objects(catalogue.templates).map((template) => template.version),
      ).toEqual([2, 1]);
      const events = objects((await read('/activity-log')).events).filter(
        (event) => event.action === 'project.template.version.created',
      );
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        id: receipt?.versionId,
        target: {
          type: 'project_template_version',
          versionId: receipt?.versionId,
          companyId,
        },
        metadata: { templateKey, version: 2, sourceVersion: 1 },
      });
      expect(Object.keys(object(events[0]?.metadata)).sort()).toEqual([
        'sourceVersion',
        'templateKey',
        'version',
      ]);
      expect(JSON.stringify(events)).not.toContain(
        successorTitles.clarify_request,
      );
      for (const changed of [
        { ...intent, sourceVersion: 2, expectedHeadVersion: 2 },
        {
          ...intent,
          taskTitles: { ...successorTitles, prepare_plan: 'Changed intention' },
        },
      ]) {
        const response = await request(path, {
          method: 'POST',
          value: changed,
          key,
        });
        expect(response.status).toBe(409);
        expect(await body(response)).toMatchObject({
          code: 'template_publication_key_conflict',
        });
      }
      expect(
        (
          await request(
            `${assignments.configuration}/${membershipId}/${companyId}`,
            { method: 'DELETE' },
          )
        ).status,
      ).toBe(200);
      expect(
        (await request(path, { method: 'POST', value: intent, key })).status,
      ).toBe(403);
      await grant('configuration');
      expect(await command(path, normalizedRetry, { key })).toEqual(receipt);
      expect(await read('/project-templates')).toEqual(catalogue);
      expect(
        objects((await read('/activity-log')).events).filter(
          (event) => event.action === 'project.template.version.created',
        ),
      ).toEqual(events);
    });

    it('confers no implicit Company context or Project/source authority through Configuration alone', async () => {
      const anaId = string(
        (await read('/access/current-actor', { subject: 'ana', company: '' }))
          .workspaceMembershipId,
      );
      const path = `/project-templates/${templateKey}/versions`;
      const intent = {
        sourceVersion: 1,
        expectedHeadVersion: 1,
        taskTitles: successorTitles,
      };
      await grant('configuration', anaId);
      expect(
        (await request('/access/current-actor', { subject: 'ana' })).status,
      ).toBe(403);
      expect(
        (await request(path, { subject: 'ana', method: 'POST', value: intent }))
          .status,
      ).toBe(403);
      await command('/company-context-assignments', {
        workspaceMembershipId: anaId,
        companyId,
      });
      expect(
        (await request(path, { subject: 'ana', method: 'POST', value: intent }))
          .status,
      ).toBe(403);
      await grant('project', anaId);
      expect(
        (await request('/project-templates', { subject: 'ana' })).status,
      ).toBe(403);
      await grant('template', anaId);
      expect(await command(path, intent, { subject: 'ana' })).toMatchObject({
        version: 2,
        sourceVersion: 1,
      });
      const current = object(
        (await read('/access/current-actor', { subject: 'ana' })).activeCompany,
      );
      expect(current.clientPermissions).toEqual([]);
      expect(current.taskPermissions).toBeUndefined();
    });

    it.each(['revoke_first', 'publish_first'])(
      'serializes %s against successful Configuration revocation',
      async (order) => {
        const anaId = await grantAnaConfiguration();
        const path = `/project-templates/${templateKey}/versions`;
        const key = randomUUID();
        const intent = {
          sourceVersion: 1,
          expectedHeadVersion: 1,
          taskTitles: successorTitles,
        };
        const publish = () =>
          request(path, { method: 'POST', value: intent, subject: 'ana', key });
        const revoke = () =>
          request(`${assignments.configuration}/${anaId}/${companyId}`, {
            method: 'DELETE',
          });
        const barrier = await harness.pool.connect();
        let first: Promise<Response> | undefined;
        let second: Promise<Response> | undefined;
        try {
          await barrier.query('BEGIN');
          if (order === 'revoke_first') {
            await barrier.query(
              `SELECT id FROM company_role_assignments WHERE workspace_membership_id=$1 AND bundle='company_project_template_configuration' FOR SHARE`,
              [anaId],
            );
            first = revoke();
            await observedWaiters('%update "company_role_assignments"%', 1);
            second = publish();
            await observedWaiters('%update "internal_users"%', 1);
          } else {
            await barrier.query(
              'LOCK TABLE project_template_versions IN SHARE MODE',
            );
            first = publish();
            await observedWaiters(
              '%insert into "project_template_versions"%',
              1,
            );
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
        expect((await publish()).status).toBe(403);
        expect(
          await read('/project-templates', { subject: 'ana' }),
        ).toMatchObject({ headVersion: order === 'revoke_first' ? 1 : 2 });
        expect(
          object(
            (await read('/access/current-actor', { subject: 'ana' }))
              .activeCompany,
          ),
        ).toMatchObject({
          projectPermissions: expect.arrayContaining(['project.read']),
          projectTemplatePermissions: [
            'project.template.read',
            'project.template.instantiate',
          ],
        });
        const events = objects((await read('/activity-log')).events).filter(
          (event) => event.action === 'project.template.version.created',
        );
        expect(events).toHaveLength(order === 'revoke_first' ? 0 : 1);
        expect(
          objects(
            (await read('/activity-log', { subject: 'ana' })).events,
          ).filter(
            (event) => event.action === 'project.template.version.created',
          ),
        ).toEqual(events);
      },
    );

    it.each(['suspend_first', 'publish_first'])(
      'serializes %s against successful membership suspension',
      async (order) => {
        const anaId = await grantAnaConfiguration();
        const path = `/project-templates/${templateKey}/versions`;
        const intent = {
          sourceVersion: 1,
          expectedHeadVersion: 1,
          taskTitles: successorTitles,
        };
        const publish = () =>
          request(path, { method: 'POST', value: intent, subject: 'ana' });
        const suspend = () =>
          request('/workspace-membership-suspensions', {
            method: 'POST',
            value: { workspaceMembershipId: anaId },
          });
        const barrier = await harness.pool.connect();
        let first: Promise<Response> | undefined;
        let second: Promise<Response> | undefined;
        try {
          await barrier.query('BEGIN');
          if (order === 'suspend_first') {
            await barrier.query(
              'LOCK TABLE workspace_membership_suspension_commands IN SHARE MODE',
            );
            first = suspend();
            await observedWaiters(
              '%insert into "workspace_membership_suspension_commands"%',
              1,
            );
            second = publish();
            await observedWaiters('%update "internal_users"%', 1);
          } else {
            await barrier.query(
              'LOCK TABLE project_template_versions IN SHARE MODE',
            );
            first = publish();
            await observedWaiters(
              '%insert into "project_template_versions"%',
              1,
            );
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
        expect((await publish()).status).toBe(403);
        expect(
          (await request('/project-templates', { subject: 'ana' })).status,
        ).toBe(403);
        expect(await read('/project-templates')).toMatchObject({
          headVersion: order === 'suspend_first' ? 1 : 2,
        });
        expect(
          objects((await read('/activity-log')).events).filter(
            (event) => event.action === 'project.template.version.created',
          ),
        ).toHaveLength(order === 'suspend_first' ? 0 : 1);
      },
    );

    it('rolls back Version, derived head, receipt and event together when the final receipt insert fails', async () => {
      await grant('configuration');
      const path = `/project-templates/${templateKey}/versions`;
      const intent = {
        sourceVersion: 1,
        expectedHeadVersion: 1,
        taskTitles: successorTitles,
      };
      const key = randomUUID();
      const before = await read(`/clients/${clientId}`);
      await harness.pool.query(
        `CREATE FUNCTION fail_template_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic receipt failure'; END; $$; CREATE TRIGGER fail_template_receipt BEFORE INSERT ON project_template_version_commands FOR EACH ROW EXECUTE FUNCTION fail_template_receipt()`,
      );
      try {
        expect(
          (await request(path, { method: 'POST', value: intent, key })).status,
        ).toBe(500);
      } finally {
        await harness.pool.query(
          'DROP TRIGGER fail_template_receipt ON project_template_version_commands; DROP FUNCTION fail_template_receipt()',
        );
      }
      expect(await read('/project-templates')).toMatchObject({
        headVersion: 1,
      });
      expect((await request(`${path}/2`)).status).toBe(404);
      expect(
        objects((await read('/activity-log')).events).filter(
          (event) => event.action === 'project.template.version.created',
        ),
      ).toEqual([]);
      expect(
        (
          await harness.pool.query(
            'SELECT (SELECT count(*)::int FROM project_template_versions) versions, (SELECT count(*)::int FROM project_template_version_commands) receipts',
          )
        ).rows,
      ).toEqual([{ versions: 0, receipts: 0 }]);
      expect(await read(`/clients/${clientId}`)).toEqual(before);
      expect(await command(path, intent, { key })).toMatchObject({
        version: 2,
        sourceVersion: 1,
      });
    });

    it('rejects malformed, unchanged and unsupported selections without manufacturing publication state', async () => {
      const path = `/project-templates/${templateKey}/versions`;
      const intent = {
        sourceVersion: 1,
        expectedHeadVersion: 1,
        taskTitles: successorTitles,
      };
      expect(
        (await request(path, { method: 'POST', value: intent })).status,
      ).toBe(403);
      await grant('configuration');
      const unchanged = Object.fromEntries(
        Object.keys(successorTitles).map((key, index) => [
          key,
          `  ${originalTitles[index]}  `,
        ]),
      );
      for (const value of [
        null,
        [],
        {},
        { ...intent, extra: true },
        { ...intent, sourceVersion: 2 },
        { ...intent, sourceVersion: 0, expectedHeadVersion: 0 },
        { ...intent, sourceVersion: 1.5, expectedHeadVersion: 1.5 },
        {
          ...intent,
          sourceVersion: 2147483647,
          expectedHeadVersion: 2147483647,
        },
        {
          ...intent,
          sourceVersion: 2147483648,
          expectedHeadVersion: 2147483648,
        },
        { ...intent, taskTitles: unchanged },
        {
          ...intent,
          taskTitles: { ...successorTitles, clarify_request: '   ' },
        },
        {
          ...intent,
          taskTitles: { ...successorTitles, clarify_request: 'a'.repeat(201) },
        },
        { ...intent, taskTitles: { ...successorTitles, clarify_request: 42 } },
        { ...intent, taskTitles: { ...successorTitles, extra: 'structure' } },
        { ...intent, taskTitles: { clarify_request: 'incomplete' } },
      ]) {
        expect((await request(path, { method: 'POST', value })).status).toBe(
          400,
        );
      }
      expect(
        (await request(path, { method: 'POST', value: intent, key: null }))
          .status,
      ).toBe(400);
      for (const version of ['0', '-1', '01', '1.5', 'NaN', '2147483648']) {
        expect((await request(`${path}/${version}`)).status).toBe(400);
        expect(
          (await request(`/project-templates?beforeVersion=${version}`)).status,
        ).toBe(400);
      }
      expect((await request(`${path}/2`)).status).toBe(404);
      expect(
        (await request('/project-templates/UNKNOWN/versions/1')).status,
      ).toBe(400);
      expect(
        (
          await request('/projects/from-template', {
            method: 'POST',
            value: creation(2, 'Missing source'),
          })
        ).status,
      ).toBe(404);
      const catalogue = await read('/project-templates');
      expect(catalogue).toMatchObject({
        headVersion: 1,
        nextBeforeVersion: null,
      });
      expect(
        objects(catalogue.templates).map((template) => template.version),
      ).toEqual([1]);
      expect(
        (
          await harness.pool.query(
            'SELECT (SELECT count(*)::int FROM project_template_versions) versions, (SELECT count(*)::int FROM project_template_version_commands) receipts',
          )
        ).rows,
      ).toEqual([{ versions: 0, receipts: 0 }]);
      expect(
        objects((await read('/activity-log')).events).filter(
          (event) => event.action === 'project.template.version.created',
        ),
      ).toEqual([]);
    });

    it('bounds the newest-first catalogue with exclusive continuation while retaining every exact historical source', async () => {
      await grant('configuration');
      const path = `/project-templates/${templateKey}/versions`;
      for (let sourceVersion = 1; sourceVersion < 23; sourceVersion++) {
        expect(
          await command(path, {
            sourceVersion,
            expectedHeadVersion: sourceVersion,
            taskTitles: {
              ...successorTitles,
              clarify_request: `Literal publication ${sourceVersion + 1}`,
            },
          }),
        ).toMatchObject({ version: sourceVersion + 1, sourceVersion });
      }
      const first = await read('/project-templates');
      expect(first).toMatchObject({ headVersion: 23, nextBeforeVersion: 4 });
      expect(
        objects(first.templates).map((template) => template.version),
      ).toEqual(Array.from({ length: 20 }, (_, index) => 23 - index));
      const next = await read('/project-templates?beforeVersion=4');
      expect(next).toMatchObject({ headVersion: 23, nextBeforeVersion: null });
      expect(
        objects(next.templates).map((template) => template.version),
      ).toEqual([3, 2, 1]);
      expect(
        objects((await read('/project-templates?beforeVersion=1')).templates),
      ).toEqual([]);
      expect(object((await read(`${path}/2`)).template).version).toBe(2);
      expect(object((await read(`${path}/1`)).template).version).toBe(1);
    });

    it('isolates Company head, literal titles, identifiers, counts, receipts, creation and Activity', async () => {
      await grant('configuration');
      const path = `/project-templates/${templateKey}/versions`;
      const intent = {
        sourceVersion: 1,
        expectedHeadVersion: 1,
        taskTitles: successorTitles,
      };
      const key = randomUUID();
      const receipt = await command(path, intent, { key });
      const originalCompany = companyId;
      const otherCompany = string(
        (
          await command('/companies', {
            displayName: 'Isolated second Company',
          })
        ).id,
      );
      companyId = otherCompany;
      for (const kind of [
        'project',
        'template',
        'configuration',
      ] satisfies (keyof typeof assignments)[])
        await grant(kind);
      const catalogue = await read('/project-templates');
      expect(catalogue).toMatchObject({
        headVersion: 1,
        nextBeforeVersion: null,
      });
      expect(
        objects(catalogue.templates).map((template) => template.version),
      ).toEqual([1]);
      expect(JSON.stringify(catalogue)).not.toContain(
        successorTitles.clarify_request,
      );
      expect((await request(`${path}/2`)).status).toBe(404);
      expect(
        (
          await request('/projects/from-template', {
            method: 'POST',
            value: creation(2, 'Cross Company source'),
          })
        ).status,
      ).toBe(403);
      const conflict = await request(path, {
        method: 'POST',
        value: intent,
        key,
      });
      expect(conflict.status).toBe(409);
      expect(await body(conflict)).toMatchObject({
        code: 'template_publication_key_conflict',
      });
      const activity = await read('/activity-log');
      expect(
        objects(activity.events).filter(
          (event) => event.action === 'project.template.version.created',
        ),
      ).toEqual([]);
      expect(JSON.stringify(activity)).not.toContain(receipt.versionId);
      companyId = originalCompany;
      expect(await command(path, intent, { key })).toEqual(receipt);
      expect(
        (
          await request(
            `${assignments.template}/${membershipId}/${companyId}`,
            { method: 'DELETE' },
          )
        ).status,
      ).toBe(200);
      expect(
        (await request(path, { method: 'POST', value: intent, key })).status,
      ).toBe(403);
      expect((await request('/project-templates')).status).toBe(403);
      expect(
        objects((await read('/activity-log')).events).filter(
          (event) => event.action === 'project.template.version.created',
        ),
      ).toEqual([]);
      await grant('template');
      expect(await command(path, intent, { key })).toEqual(receipt);
    });

    it('fails closed for unrecognized captured Configuration versions and independently missing Project or source authority', async () => {
      await grant('configuration');
      const path = `/project-templates/${templateKey}/versions`;
      const intent = {
        sourceVersion: 1,
        expectedHeadVersion: 1,
        taskTitles: successorTitles,
      };
      for (const version of [null, 'v2', 'V1']) {
        await expect(
          harness.pool.query(
            `UPDATE company_role_assignments SET permission_set_version=$1 WHERE workspace_membership_id=$2 AND bundle='company_project_template_configuration'`,
            [version, membershipId],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      }
      const result = await harness.pool.query<{ definition: string }>(
        `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname='company_role_assignments_permission_set_version_check'`,
      );
      const definition = string(result.rows[0]?.definition);
      // Represent unknown legacy input at its persisted boundary; restore the exact constraint afterward.
      await harness.pool.query(
        'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
      );
      try {
        for (const version of [null, 'v2', 'V1']) {
          await harness.pool.query(
            `UPDATE company_role_assignments SET permission_set_version=$1 WHERE workspace_membership_id=$2 AND bundle='company_project_template_configuration'`,
            [version, membershipId],
          );
          expect(
            object((await read('/access/current-actor')).activeCompany)
              .projectTemplateConfigurationPermissions,
          ).toBeUndefined();
          expect(
            (await request(path, { method: 'POST', value: intent })).status,
          ).toBe(403);
          expect(await read('/project-templates')).toMatchObject({
            headVersion: 1,
          });
        }
      } finally {
        await harness.pool.query(
          `UPDATE company_role_assignments SET permission_set_version='v1' WHERE workspace_membership_id=$1 AND bundle='company_project_template_configuration'`,
          [membershipId],
        );
        await harness.pool.query(
          `ALTER TABLE company_role_assignments ADD CONSTRAINT company_role_assignments_permission_set_version_check ${definition}`,
        );
      }
      for (const kind of [
        'project',
        'template',
      ] satisfies (keyof typeof assignments)[]) {
        expect(
          (
            await request(`${assignments[kind]}/${membershipId}/${companyId}`, {
              method: 'DELETE',
            })
          ).status,
        ).toBe(200);
        expect(
          (await request(path, { method: 'POST', value: intent })).status,
        ).toBe(403);
        expect((await request('/project-templates')).status).toBe(403);
        await grant(kind);
      }
      expect(
        objects((await read('/activity-log')).events).filter(
          (event) => event.action === 'project.template.version.created',
        ),
      ).toEqual([]);
      expect(await command(path, intent)).toMatchObject({ version: 2 });
    });

    it('isolates authenticated Workspace catalogues, exact sources, Activity and actor-key receipts', async () => {
      await grant('configuration');
      const path = `/project-templates/${templateKey}/versions`;
      const intent = {
        sourceVersion: 1,
        expectedHeadVersion: 1,
        taskTitles: successorTitles,
      };
      const key = randomUUID();
      const first = await command(path, intent, { key });
      const otherWorkspace = '00000000-0000-4000-8000-000000000696';
      await harness.pool.query(
        'INSERT INTO workspaces(id,name) VALUES($1,$2)',
        [otherWorkspace, 'Isolated second Workspace'],
      );
      // Controlled membership fixture; every Company, captured grant and publication still uses REST.
      const membership = await harness.pool.query<{ id: string }>(
        `INSERT INTO workspace_memberships(workspace_id,internal_user_id) SELECT $1,internal_user_id FROM workspace_memberships WHERE id=$2 RETURNING id`,
        [otherWorkspace, membershipId],
      );
      const otherMember = string(membership.rows[0]?.id);
      await harness.pool.query(
        `INSERT INTO workspace_permission_grants(workspace_id,workspace_membership_id,permission) VALUES($1,$2,'company.manage'),($1,$2,'company.assignment.manage')`,
        [otherWorkspace, otherMember],
      );
      expect(
        await read('/access/current-actor', {
          workspace: otherWorkspace,
          company: '',
        }),
      ).toMatchObject({
        workspaceId: otherWorkspace,
        workspaceMembershipId: otherMember,
      });
      const otherCompany = string(
        (
          await command(
            '/companies',
            { displayName: 'Second Workspace Company' },
            { workspace: otherWorkspace, company: '' },
          )
        ).id,
      );
      for (const kind of [
        'project',
        'template',
        'configuration',
      ] satisfies (keyof typeof assignments)[])
        await command(
          assignments[kind],
          { workspaceMembershipId: otherMember, companyId: otherCompany },
          { workspace: otherWorkspace, company: '' },
        );
      const options = { workspace: otherWorkspace, company: otherCompany };
      expect(await read('/project-templates', options)).toMatchObject({
        headVersion: 1,
        nextBeforeVersion: null,
      });
      expect((await request(`${path}/2`, options)).status).toBe(404);
      expect(
        (await request(`${path}/2`, { workspace: otherWorkspace })).status,
      ).toBe(403);
      expect(
        JSON.stringify(await read('/activity-log', options)),
      ).not.toContain(first.versionId);
      const secondIntent = {
        ...intent,
        taskTitles: {
          ...successorTitles,
          clarify_request: 'Second Workspace private literal',
        },
      };
      const second = await command(path, secondIntent, { ...options, key });
      expect(second).toMatchObject({ version: 2, sourceVersion: 1 });
      expect(second.versionId).not.toBe(first.versionId);
      const otherCatalogue = await read('/project-templates', options);
      expect(otherCatalogue).toMatchObject({ headVersion: 2 });
      expect(JSON.stringify(otherCatalogue)).not.toContain(
        successorTitles.clarify_request,
      );
      expect(JSON.stringify(await read('/project-templates'))).not.toContain(
        'Second Workspace private literal',
      );
      expect(await command(path, intent, { key })).toEqual(first);
      expect(await command(path, secondIntent, { ...options, key })).toEqual(
        second,
      );
      const secondEvents = objects(
        (await read('/activity-log', options)).events,
      ).filter((event) => event.action === 'project.template.version.created');
      expect(secondEvents).toHaveLength(1);
      expect(secondEvents[0]).toMatchObject({ id: second.versionId });
      expect(JSON.stringify(secondEvents)).not.toContain(first.versionId);
    });

    it('fails closed at public source and creation boundaries when persisted successor identity or compatibility is invalid', async () => {
      await grant('configuration');
      const path = `/project-templates/${templateKey}/versions`;
      const intent = {
        sourceVersion: 1,
        expectedHeadVersion: 1,
        taskTitles: successorTitles,
      };
      const receipt = await command(path, intent);
      const source = object((await read(`${path}/2`)).template);
      const stages = objects(source.stages);
      const badSources = [
        { ...source, version: 3 },
        { ...source, templateKey: 'UNKNOWN' },
        { ...source, title: 'Changed fixed business model' },
        {
          ...source,
          stages: stages.map((stage, index) =>
            index === 0 ? { ...stage, title: 'Changed fixed stage' } : stage,
          ),
        },
        {
          ...source,
          stages: stages.map((stage, index) =>
            index === 0
              ? {
                  ...stage,
                  tasks: objects(stage.tasks).map((task, position) =>
                    position === 0
                      ? { ...task, key: 'unknown_stable_mapping' }
                      : task,
                  ),
                }
              : stage,
          ),
        },
      ];
      try {
        for (const invalid of badSources) {
          await harness.pool.query(
            'UPDATE project_template_versions SET snapshot=$1 WHERE id=$2',
            [JSON.stringify(invalid), receipt.versionId],
          );
          expect((await request(`${path}/2`)).status).toBe(500);
          expect((await request('/project-templates')).status).toBe(500);
          expect(
            (
              await request('/projects/from-template', {
                method: 'POST',
                value: creation(2, 'Refuse corrupt persisted source'),
              })
            ).status,
          ).toBe(500);
          expect(
            (
              await request(path, {
                method: 'POST',
                value: {
                  ...intent,
                  sourceVersion: 2,
                  expectedHeadVersion: 2,
                  taskTitles: {
                    ...successorTitles,
                    prepare_plan: 'Next title',
                  },
                },
              })
            ).status,
          ).toBe(500);
        }
      } finally {
        await harness.pool.query(
          'UPDATE project_template_versions SET snapshot=$1 WHERE id=$2',
          [JSON.stringify(source), receipt.versionId],
        );
      }
      expect(
        (
          await harness.pool.query(
            'SELECT (SELECT count(*)::int FROM project_template_versions) versions, (SELECT count(*)::int FROM project_template_version_commands) receipts',
          )
        ).rows,
      ).toEqual([{ versions: 1, receipts: 1 }]);
      expect(
        (
          await harness.pool.query(
            'SELECT count(*)::int AS count FROM projects',
          )
        ).rows,
      ).toEqual([{ count: 0 }]);
      expect(object((await read(`${path}/2`)).template)).toEqual(source);
    });

    it('commits one competing head and definitely rejects the stale publisher, without requiring Client or Task authority to configure', async () => {
      await grant('configuration');
      const anaId = string(
        (await read('/access/current-actor', { subject: 'ana', company: '' }))
          .workspaceMembershipId,
      );
      await command('/company-context-assignments', {
        workspaceMembershipId: anaId,
        companyId,
      });
      await grant('project', anaId);
      await grant('template', anaId);
      await grant('configuration', anaId);
      const actorAna = object(
        (await read('/access/current-actor', { subject: 'ana' })).activeCompany,
      );
      expect(actorAna.clientPermissions).toEqual([]);
      expect(actorAna.taskPermissions).toBeUndefined();
      expect(actorAna.projectTemplateConfigurationPermissions).toEqual([
        'project.template.version.create',
      ]);
      const before = await read(`/clients/${clientId}`);
      const path = `/project-templates/${templateKey}/versions`;
      const firstIntent = {
        sourceVersion: 1,
        expectedHeadVersion: 1,
        taskTitles: successorTitles,
      };
      const secondIntent = {
        ...firstIntent,
        taskTitles: {
          ...successorTitles,
          prepare_plan: 'Plan concurrent — {literal}',
        },
      };
      const secondKey = randomUUID();
      const barrier = await harness.pool.connect();
      let first: Promise<Response> | undefined;
      let second: Promise<Response> | undefined;
      try {
        await barrier.query('BEGIN');
        // Hold the first public command at its final immutable Version INSERT.
        // The next publisher must visibly wait before it can inspect this head.
        await barrier.query(
          'LOCK TABLE project_template_versions IN SHARE MODE',
        );
        first = request(path, { method: 'POST', value: firstIntent });
        await observedWaiters('%insert into "project_template_versions"%', 1);
        second = request(path, {
          method: 'POST',
          value: secondIntent,
          subject: 'ana',
          key: secondKey,
        });
        await observedWaiters('%pg_advisory_xact_lock%', 1);
        await barrier.query('COMMIT');
        const firstResponse = await first;
        const secondResponse = await second;
        expect([firstResponse.status, secondResponse.status]).toEqual([
          201, 409,
        ]);
        expect(await body(firstResponse)).toMatchObject({
          version: 2,
          sourceVersion: 1,
        });
        expect(await body(secondResponse)).toMatchObject({
          code: 'template_publication_stale_head',
        });
      } finally {
        await barrier.query('ROLLBACK');
        barrier.release();
        await first?.catch(() => undefined);
        await second?.catch(() => undefined);
      }
      expect(
        await read('/project-templates', { subject: 'ana' }),
      ).toMatchObject({ headVersion: 2, nextBeforeVersion: null });
      expect(
        (
          await request(path, {
            method: 'POST',
            value: secondIntent,
            subject: 'ana',
            key: secondKey,
          })
        ).status,
      ).toBe(409);
      expect(await read(`/clients/${clientId}`)).toEqual(before);
      const titles = objects(
        object(
          (
            await read(`/project-templates/${templateKey}/versions/2`, {
              subject: 'ana',
            })
          ).template,
        ).stages,
      ).flatMap((stage) => objects(stage.tasks).map((task) => task.title));
      expect(titles).toEqual(Object.values(successorTitles));
    });
  },
);
