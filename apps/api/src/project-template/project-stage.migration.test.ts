import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';
import { CONSULTING_PREPARATION_V1 } from './project-template.definition.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const workspaceId = '00000000-0000-4000-8000-000000006870';
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected object.');
  return Object.fromEntries(Object.entries(value));
}
function string(value: unknown) {
  if (typeof value !== 'string') throw new Error('Expected string.');
  return value;
}

it.skipIf(!databaseUrl)(
  'preserves pre-stage copies, Task history and captured grants without manufacturing authority or completed stages during migration',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'stage_upgrade',
    });
    const previous = await mkdtemp(join(tmpdir(), 'prisma-687-upgrade-'));
    let harness: PostgresRestTestHarness | undefined;
    try {
      const raw: unknown = JSON.parse(
        await readFile('drizzle/meta/_journal.json', 'utf8'),
      );
      const journal = record(raw);
      if (!Array.isArray(journal.entries))
        throw new Error('Invalid migration journal.');
      const entries: unknown[] = journal.entries;
      const tags = entries.map((entry) => string(record(entry).tag));
      const index = tags.findIndex((tag) =>
        tag.endsWith('_project_stage_advance'),
      );
      expect(index).toBeGreaterThan(0);
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta/_journal.json'),
        JSON.stringify({ ...journal, entries: entries.slice(0, index) }),
      );
      for (const tag of tags.slice(0, index))
        await cp(join('drizzle', tag + '.sql'), join(previous, tag + '.sql'));
      harness = await createPostgresRestTestHarness({
        databaseUrl: database.targetUrl,
        migrationsFolder: previous,
        environment: {
          NODE_ENV: 'test',
          ACCESS_IDENTITY_MODE: 'test',
          ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
          ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'stage-upgrade-owner',
          ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
          ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Stage upgrade',
        },
      });
      const origin = harness.origin;
      let companyId = '';
      async function request(path: string, value?: unknown) {
        const response = await fetch(`${origin}/api${path}`, {
          method: value === undefined ? 'GET' : 'POST',
          headers: {
            'x-test-external-provider': 'deterministic-test',
            'x-test-external-subject': 'stage-upgrade-owner',
            'x-test-display-name': 'Stage upgrade owner',
            'x-test-email': 'upgrade@example.test',
            'content-type': 'application/json',
            'idempotency-key': randomUUID(),
            ...(companyId ? { 'x-company-context-id': companyId } : {}),
          },
          ...(value === undefined ? {} : { body: JSON.stringify(value) }),
        });
        expect(response.status).toBe(value === undefined ? 200 : 201);
        const body: unknown = await response.json();
        return record(body);
      }
      const memberId = string(
        (await request('/access/current-actor')).workspaceMembershipId,
      );
      companyId = string(
        (await request('/companies', { displayName: 'Preserved Company' })).id,
      );
      for (const path of [
        '/company-director-client-assignments',
        '/company-project-assignments',
        '/company-task-manager-assignments',
        '/company-project-template-user-assignments',
      ])
        await request(path, { workspaceMembershipId: memberId, companyId });
      const clientId = string(
        (
          await request('/clients', {
            displayName: 'Preserved original Client',
          })
        ).id,
      );
      const projectId = string(
        (
          await request('/projects', {
            title: 'Existing copied preparation',
            clientAccountId: clientId,
          })
        ).id,
      );
      const taskIds: string[] = [];
      for (const title of CONSULTING_PREPARATION_V1.stages.flatMap((stage) =>
        stage.tasks.map((task) => task.title),
      )) {
        const taskId = string(
          (await request(`/projects/${projectId}/tasks`, { title })).id,
        );
        taskIds.push(taskId);
        if (taskIds.length <= 2)
          await request(`/tasks/${taskId}/complete`, { expectedVersion: 1 });
      }
      // Exact 0068 stored-copy fixture. Current endpoints cannot select columns that do not exist until 0069.
      await database.targetPool.query(
        `INSERT INTO project_template_instances(project_id,workspace_id,company_id,client_account_id,created_by_membership_id,idempotency_key,fingerprint,snapshot) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          projectId,
          workspaceId,
          companyId,
          clientId,
          memberId,
          'preserved-copy-key',
          'preserved-copy-intent',
          JSON.stringify(CONSULTING_PREPARATION_V1),
        ],
      );
      for (const [position, taskId] of taskIds.entries())
        await database.targetPool.query(
          'INSERT INTO project_template_task_copies(workspace_id,company_id,project_id,task_id,position) VALUES($1,$2,$3,$4,$5)',
          [workspaceId, companyId, projectId, taskId, position],
        );
      const tables = (
        await database.targetPool.query<{ name: string }>(
          `SELECT table_name AS name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`,
        )
      ).rows.map((row) => row.name);
      async function snapshot() {
        const result: Record<string, string[]> = {};
        for (const table of tables) {
          // Compare all original fields; added progress columns are checked explicitly below.
          const rows = await database.targetPool.query<{ row: string }>(
            `SELECT (to_jsonb(preserved) ${table === 'project_template_instances' ? "- 'current_stage_key' - 'stage_revision'" : ''})::text AS row FROM "${table}" preserved`,
          );
          result[table] = rows.rows.map((row) => row.row).sort();
        }
        return result;
      }
      const before = await snapshot();
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      expect(await snapshot()).toEqual(before);
      const counts = await database.targetPool.query(
        `SELECT (SELECT count(*)::int FROM project_stage_commands) receipts,(SELECT count(*)::int FROM project_stage_transitions) transitions,(SELECT count(*)::int FROM company_role_assignments WHERE bundle::text='company_project_stage_advancer') grants`,
      );
      expect(counts.rows).toEqual([{ receipts: 0, transitions: 0, grants: 0 }]);
      expect(
        await request(`/projects/${projectId}/stage-progress`),
      ).toMatchObject({
        progress: {
          currentStageKey: 'scoping',
          stageRevision: 0,
          gate: 'advance_authority_required',
          transitions: [],
        },
      });
      expect(
        (
          await database.targetPool.query(
            'SELECT stage_revision,current_stage_key FROM project_template_instances WHERE project_id=$1',
            [projectId],
          )
        ).rows,
      ).toEqual([{ stage_revision: 0, current_stage_key: null }]);
      const afterRead = await snapshot();
      // The existing ActorContextAdapter synchronizes external profile updated_at on every GET.
      // Check that sole expected Auth effect explicitly; migration itself preserved the full row above.
      function withoutProfileTimestamp(rows: string[] | undefined) {
        return (rows ?? []).map((row) => {
          const value: unknown = JSON.parse(row);
          const fields = record(value);
          delete fields.updated_at;
          return JSON.stringify(fields);
        });
      }
      expect({
        ...afterRead,
        internal_users: withoutProfileTimestamp(afterRead.internal_users),
      }).toEqual({
        ...before,
        internal_users: withoutProfileTimestamp(before.internal_users),
      });
      const oldProfile: unknown = JSON.parse(
        string(before.internal_users?.[0]),
      );
      const newProfile: unknown = JSON.parse(
        string(afterRead.internal_users?.[0]),
      );
      expect(
        Date.parse(string(record(newProfile).updated_at)),
      ).toBeGreaterThanOrEqual(
        Date.parse(string(record(oldProfile).updated_at)),
      );
      for (const version of [null, 'v2', 'V1'])
        await expect(
          database.targetPool.query(
            `INSERT INTO company_role_assignments(workspace_id,company_id,workspace_membership_id,bundle,permission_set_version,revoked_at) VALUES($1,$2,$3,'company_project_stage_advancer',$4,now())`,
            [workspaceId, companyId, memberId, version],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      const beforeRepeat = await snapshot();
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      expect(await snapshot()).toEqual(beforeRepeat);
    } finally {
      try {
        await harness?.close();
      } finally {
        try {
          await database.close();
        } finally {
          await rm(previous, { recursive: true, force: true });
        }
      }
    }
  },
  60_000,
);
