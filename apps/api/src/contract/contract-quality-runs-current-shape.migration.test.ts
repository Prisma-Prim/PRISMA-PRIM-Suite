import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  ADJUSTED,
  PLAIN,
  type Target,
  approveAdjusted,
  baseRecords,
  executedPlainContract,
  insertRun,
  pendingAdjustedContract,
} from './contract-adjusted-snapshot.test-support.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
const CURRENT_SHAPE_MIGRATION = '_contract_quality_runs_current_shape';
const REFUSAL =
  'contract_quality_runs holds a Contract Quality Check run under another rule set than its Contract Version binds; the development database must be recreated.';

withPostgres('Contract Quality Check run current-shape migration', () => {
  it.each([
    [
      'a v1 run recorded before rule set v2 on a pending version that binds v2',
      ADJUSTED,
      1,
    ],
    ['a v2 run on an executed version that binds v1', PLAIN, 2],
  ] satisfies [string, Target, number][])(
    'refuses %s and asks to recreate the development database',
    async (_name, target, ruleSetVersion) => {
      await withPreviousSchema('contract1402_refused', async (database) => {
        await seedContracts(database.targetPool);
        await insertUnboundRun(database.targetPool, target, ruleSetVersion);
        const stored = await storedRuns(database);
        const applied = await appliedMigrations(database);
        const refusal = raisedError(
          await migrate(drizzle(database.targetPool), {
            migrationsFolder: resolve('drizzle'),
          }).then(
            () => undefined,
            (error: unknown) => error,
          ),
        );
        expect(refusal).toEqual({ code: 'P0001', message: REFUSAL });
        expect(await appliedMigrations(database)).toBe(applied);
        expect(await storedRuns(database)).toEqual(stored);
      });
    },
    60_000,
  );

  it('applies over runs bound to rule sets v1 and v2, leaving them unchanged', async () => {
    await withPreviousSchema(
      'contract1402_current',
      async (database, through) => {
        await seedContracts(database.targetPool);
        await insertRun(database.targetPool, ADJUSTED, 2);
        await database.targetPool.query(approveAdjusted());
        const stored = await storedRuns(database);
        const applied = await appliedMigrations(database);
        await migrate(drizzle(database.targetPool), {
          migrationsFolder: through,
        });
        expect(await appliedMigrations(database)).toBe((applied ?? 0) + 1);
        expect(await storedRuns(database)).toEqual(stored);
        expect(stored.map((run) => run.ruleSetVersion)).toEqual([1, 1, 2, 2]);
      },
    );
  }, 60_000);
});

/**
 * Runs `test` on an isolated database migrated up to, but excluding, the
 * current-shape migration; `through` holds the migrations up to and including
 * it, so a later migration never changes what the test proves.
 */
async function withPreviousSchema(
  namePrefix: string,
  test: (
    database: IsolatedPostgresTestDatabase,
    through: string,
  ) => Promise<void>,
) {
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL required');
  const database = await createIsolatedPostgresTestDatabase({
    baseDatabaseUrl: databaseUrl,
    namePrefix,
  });
  let previous: string | undefined;
  let through: string | undefined;
  try {
    previous = await mkdtemp(join(tmpdir(), 'contract1402-previous-'));
    through = await mkdtemp(join(tmpdir(), 'contract1402-through-'));
    const directory = resolve('drizzle');
    const journal = object(
      JSON.parse(
        await readFile(join(directory, 'meta', '_journal.json'), 'utf8'),
      ),
    );
    if (!Array.isArray(journal.entries))
      throw new Error('Journal entries required');
    const entries = journal.entries.map((entry: unknown) => object(entry));
    const index = entries.findIndex(
      (entry) =>
        typeof entry.tag === 'string' &&
        entry.tag.endsWith(CURRENT_SHAPE_MIGRATION),
    );
    expect(index).toBeGreaterThan(0);
    for (const [folder, kept] of [
      [previous, entries.slice(0, index)],
      [through, entries.slice(0, index + 1)],
    ] as const) {
      await mkdir(join(folder, 'meta'));
      await writeFile(
        join(folder, 'meta', '_journal.json'),
        JSON.stringify({ ...journal, entries: kept }),
      );
      for (const entry of kept) {
        if (typeof entry.tag !== 'string') throw new Error('Tag required');
        await cp(
          join(directory, `${entry.tag}.sql`),
          join(folder, `${entry.tag}.sql`),
        );
      }
    }
    await migrate(drizzle(database.targetPool), { migrationsFolder: previous });
    await test(database, through);
  } finally {
    await database.close();
    for (const folder of [previous, through])
      if (folder) await rm(folder, { recursive: true, force: true });
  }
}

/** An executed Contract bound to v1 and a pending one bound to v2. */
async function seedContracts(pool: Pool) {
  await pool.query(baseRecords());
  await pool.query(executedPlainContract());
  await pool.query(pendingAdjustedContract());
}

/**
 * A run stored under another rule set than its version binds, as an earlier
 * application could record it; the insert guard is lifted for this statement
 * only, inside its transaction.
 */
async function insertUnboundRun(
  pool: Pool,
  target: Target,
  ruleSetVersion: number,
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'ALTER TABLE contract_quality_runs DISABLE TRIGGER contract_quality_runs_bound_rule_set',
    );
    await insertRun(client, target, ruleSetVersion);
    await client.query(
      'ALTER TABLE contract_quality_runs ENABLE TRIGGER contract_quality_runs_bound_rule_set',
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function storedRuns(database: IsolatedPostgresTestDatabase) {
  const result = await database.targetPool.query<{
    id: string;
    contractVersionId: string;
    ruleSetVersion: number;
    results: string;
  }>(
    'SELECT id, contract_version_id AS "contractVersionId", rule_set_version AS "ruleSetVersion", results::text AS results FROM contract_quality_runs ORDER BY sequence',
  );
  return result.rows;
}

async function appliedMigrations(database: IsolatedPostgresTestDatabase) {
  const result = await database.targetPool.query<{ total: number }>(
    'SELECT count(*)::int AS total FROM drizzle.__drizzle_migrations',
  );
  return result.rows[0]?.total;
}

/** The PostgreSQL error the migration raised, under the driver's wrapper. */
function raisedError(error: unknown): { code: unknown; message: unknown } {
  let current = error;
  while (current instanceof Error) {
    if ('code' in current && typeof current.code === 'string')
      return { code: current.code, message: current.message };
    current = current.cause;
  }
  throw new Error('Expected the migration to raise a PostgreSQL error.');
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Object required');
  return Object.fromEntries(Object.entries(value));
}
