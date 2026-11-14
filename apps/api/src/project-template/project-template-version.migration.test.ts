import {
  restoreFrozenTaskSetup,
  applyHistoricalTaskTarget,
} from '../task/frozen-task-migration.test-support.js';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  'preserves every 0069 row, receipt, copied plan and nonempty Task and stage history without creating successors or Configuration grants during its own migration',
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
      await restoreFrozenTaskSetup(
        database.targetPool,
        'project-template-version',
      );
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
      // Migration 0116 refuses these pre-description receipts (#1348), so the
      // upgrade proof stops at its own migration (#1343 A6).
      expect(
        (
          await database.targetPool.query(
            `SELECT (SELECT count(*)::int FROM project_template_versions) versions, (SELECT count(*)::int FROM project_template_version_commands) receipts, (SELECT count(*)::int FROM company_role_assignments WHERE bundle::text='company_project_template_configuration') grants`,
          )
        ).rows,
      ).toEqual([{ versions: 0, receipts: 0, grants: 0 }]);
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
