import {
  restoreFrozenTaskSetup,
  applyHistoricalTaskTarget,
} from '../task/frozen-task-migration.test-support.js';
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

const databaseUrl = process.env.TEST_DATABASE_URL;
const workspaceId = '00000000-0000-4000-8000-000000006950';
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected object.');
  return Object.fromEntries(Object.entries(value));
}
function string(value: unknown) {
  if (typeof value !== 'string') throw new Error('Expected string.');
  return value;
}
function records(value: unknown) {
  if (!Array.isArray(value)) throw new Error('Expected array.');
  const rows: unknown[] = value;
  return rows.map(record);
}

it.skipIf(!databaseUrl)(
  'preserves every 0069 row, receipt, copied plan and nonempty Task and stage history without creating successors or Configuration grants',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'successor_upgrade',
    });
    const previous = await mkdtemp(join(tmpdir(), 'prisma-695-upgrade-'));
    let harness: PostgresRestTestHarness | undefined;
    try {
      const journal = record(
        JSON.parse(await readFile('drizzle/meta/_journal.json', 'utf8')),
      );
      const entries = records(journal.entries);
      const tags = entries.map((entry) => string(entry.tag));
      const index = tags.findIndex((tag) =>
        tag.endsWith('_project_template_successors'),
      );
      expect(index).toBeGreaterThan(0);
      expect(tags[index - 1]).toBe('0069_project_stage_advance');
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
          ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'successor-upgrade-owner',
          ACCESS_BOOTSTRAP_WORKSPACE_ID: workspaceId,
          ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Successor upgrade',
        },
      });
      const origin = harness.origin;
      let companyId = '';
      async function request(
        path: string,
        value?: unknown,
        key: string = randomUUID(),
      ) {
        const response = await fetch(`${origin}/api${path}`, {
          method: value === undefined ? 'GET' : 'POST',
          headers: {
            'x-test-external-provider': 'deterministic-test',
            'x-test-external-subject': 'successor-upgrade-owner',
            'x-test-display-name': 'Upgrade owner',
            'x-test-email': 'upgrade@example.test',
            'content-type': 'application/json',
            'idempotency-key': key,
            ...(companyId ? { 'x-company-context-id': companyId } : {}),
          },
          ...(value === undefined ? {} : { body: JSON.stringify(value) }),
        });
        expect(response.status).toBe(value === undefined ? 200 : 201);
        const result: unknown = await response.json();
        return record(result);
      }
      const frozen = await restoreFrozenTaskSetup(
        database.targetPool,
        'project-template-version',
      );
      companyId = string(frozen.companyId);
      const projectId = string(frozen.projectId),
        creationKey = string(frozen.creationKey),
        stageKey = string(frozen.stageKey);
      const creation = frozen.creation,
        stageIntent = frozen.stageIntent,
        stageReceipt = frozen.stageReceipt,
        source = frozen.source,
        progress = frozen.progress,
        tasks = record(frozen.tasks),
        histories = frozen.histories;
      const tables = (
        await database.targetPool.query<{ name: string }>(
          `SELECT table_name AS name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name`,
        )
      ).rows.map((row) => row.name);
      async function snapshot() {
        const result: Record<string, string[]> = {};
        for (const table of tables)
          result[table] = (
            await database.targetPool.query<{ row: string }>(
              `SELECT (to_jsonb(preserved) ${table === 'tasks' ? "- 'description'" : ''})::text AS row FROM "${table}" preserved`,
            )
          ).rows
            .map((row) => row.row)
            .sort();
        return result;
      }
      const before = await snapshot();
      await applyHistoricalTaskTarget({
        pool: database.targetPool,
        previous,
        journal,
        entries,
        index,
      });
      expect(await snapshot()).toEqual(before);
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      expect(
        (
          await database.targetPool.query(
            `SELECT (SELECT count(*)::int FROM project_template_versions) versions, (SELECT count(*)::int FROM project_template_version_commands) receipts, (SELECT count(*)::int FROM company_role_assignments WHERE bundle::text='company_project_template_configuration') grants`,
          )
        ).rows,
      ).toEqual([{ versions: 0, receipts: 0, grants: 0 }]);
      expect(await request(`/projects/${projectId}/template`)).toEqual(source);
      expect(await request(`/projects/${projectId}/stage-progress`)).toEqual(
        progress,
      );
      expect(await request(`/projects/${projectId}/tasks`)).toEqual({
        ...tasks,
        tasks: records(tasks.tasks).map((task) => ({
          ...task,
          description: null,
        })),
      });
      expect(
        await Promise.all(
          records(tasks.tasks).map((task) =>
            request(`/tasks/${string(task.id)}/history`),
          ),
        ),
      ).toEqual(histories);
      expect(
        string(
          (await request('/projects/from-template', creation, creationKey)).id,
        ),
      ).toBe(projectId);
      expect(
        await request(
          `/projects/${projectId}/stage-advance`,
          stageIntent,
          stageKey,
        ),
      ).toEqual(stageReceipt);
      expect(await request('/project-templates')).toMatchObject({
        headVersion: 1,
        nextBeforeVersion: null,
      });
      expect(
        record((await request('/access/current-actor')).activeCompany)
          .projectTemplateConfigurationPermissions,
      ).toBeUndefined();
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
