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
      const frozen = await restoreFrozenTaskSetup(
        database.targetPool,
        'project-stage',
      );
      const companyId = string(frozen.companyId),
        memberId = string(frozen.memberId),
        projectId = string(frozen.projectId);
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
            `SELECT (to_jsonb(preserved) ${table === 'tasks' ? "- 'description'" : ''} ${table === 'project_template_instances' ? "- 'current_stage_key' - 'stage_revision'" : ''})::text AS row FROM "${table}" preserved`,
          );
          result[table] = rows.rows.map((row) => row.row).sort();
        }
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
      const counts = await database.targetPool.query(
        `SELECT (SELECT count(*)::int FROM project_stage_commands) receipts,(SELECT count(*)::int FROM project_stage_transitions) transitions,(SELECT count(*)::int FROM company_role_assignments WHERE bundle::text='company_project_stage_advancer') grants`,
      );
      expect(counts.rows).toEqual([{ receipts: 0, transitions: 0, grants: 0 }]);
      expect(
        (
          await database.targetPool.query(
            'SELECT stage_revision,current_stage_key FROM project_template_instances WHERE project_id=$1',
            [projectId],
          )
        ).rows,
      ).toEqual([{ stage_revision: 0, current_stage_key: null }]);
      for (const version of [null, 'v2', 'V1'])
        await expect(
          database.targetPool.query(
            `INSERT INTO company_role_assignments(workspace_id,company_id,workspace_membership_id,bundle,permission_set_version,revoked_at) VALUES($1,$2,$3,'company_project_stage_advancer',$4,now())`,
            [workspaceId, companyId, memberId, version],
          ),
        ).rejects.toMatchObject({ code: '23514' });
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
