import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { describe, expect, it } from 'vitest';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
const CURRENT_SHAPE_MIGRATION = '_task_receipts_current_shape';
const COMMANDS_REFUSAL =
  'task_commands holds a Task receipt recorded before Task descriptions; the development database must be recreated.';
const EVENTS_REFUSAL =
  'task_events holds a Task creation recorded before Task descriptions; the development database must be recreated.';
const actor = {
  internalUserId: randomUUID(),
  workspaceMembershipId: randomUUID(),
  displayName: 'Fictional manager',
};
const task = {
  id: randomUUID(),
  companyId: randomUUID(),
  projectId: randomUUID(),
  clientAccountId: randomUUID(),
  title: 'Prepare the audit notes',
  description: null,
  assignee: null,
  dueDate: null,
  priority: 'normal',
  status: 'todo',
  completion: null,
  version: 1,
  createdAt: '2026-11-14T08:00:00.000Z',
  updatedAt: '2026-11-14T08:00:00.000Z',
  createdBy: actor,
};
const initial = {
  title: task.title,
  description: null,
  assignee: null,
  dueDate: null,
  priority: 'normal',
};
const preDescriptionTask = without(task, ['description']);
const prePriorityTask = without(task, ['description', 'priority']);
const preDescriptionInitial = without(initial, ['description']);
const prePriorityInitial = without(initial, ['description', 'priority']);

type StoredRow =
  | { table: 'task_commands'; result: unknown }
  | { table: 'task_events'; meaning: unknown };

const creation = (fields: unknown): StoredRow => ({
  table: 'task_events',
  meaning: {
    action: 'task.created',
    metadata: { version: 1, initial: fields },
  },
});
const grouped = (tasks: unknown[]): StoredRow => ({
  table: 'task_commands',
  result: { schema: 'task-planning/v1', projectId: task.projectId, tasks },
});

withPostgres('Task receipt current-shape migration', () => {
  it.each([
    [
      'a receipt recorded before descriptions',
      { table: 'task_commands', result: preDescriptionTask },
      COMMANDS_REFUSAL,
    ],
    [
      'a receipt recorded before priorities',
      { table: 'task_commands', result: prePriorityTask },
      COMMANDS_REFUSAL,
    ],
    [
      'a grouped planning receipt with a Task recorded before descriptions',
      grouped([task, preDescriptionTask]),
      COMMANDS_REFUSAL,
    ],
    [
      'a creation recorded before descriptions',
      creation(preDescriptionInitial),
      EVENTS_REFUSAL,
    ],
    [
      'a creation recorded before priorities',
      creation(prePriorityInitial),
      EVENTS_REFUSAL,
    ],
  ] satisfies [string, StoredRow, string][])(
    'refuses %s and asks to recreate the development database',
    async (_name, row, message) => {
      await withPreviousSchema('task1348_refused', async (database) => {
        await insert(database, row);
        const stored = await storedRows(database);
        const applied = await appliedMigrations(database);
        const refusal = raisedError(
          await migrate(drizzle(database.targetPool), {
            migrationsFolder: resolve('drizzle'),
          }).then(
            () => undefined,
            (error: unknown) => error,
          ),
        );
        expect(refusal).toEqual({ code: 'P0001', message });
        expect(await appliedMigrations(database)).toBe(applied);
        expect(await storedRows(database)).toEqual(stored);
      });
    },
    60_000,
  );

  it('applies over current-shape receipts and creations and leaves them byte-identical', async () => {
    await withPreviousSchema('task1348_current', async (database, through) => {
      for (const row of [
        { table: 'task_commands', result: task },
        grouped([task, { ...task, id: randomUUID(), priority: 'critical' }]),
        creation(initial),
        {
          table: 'task_events',
          meaning: {
            action: 'task.updated',
            metadata: {
              version: 2,
              changes: { title: { before: task.title, after: 'Corrected' } },
            },
          },
        },
      ] satisfies StoredRow[])
        await insert(database, row);
      const stored = await storedRows(database);
      const applied = await appliedMigrations(database);
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: through,
      });
      expect(await appliedMigrations(database)).toBe((applied ?? 0) + 1);
      expect(await storedRows(database)).toEqual(stored);
      expect(stored.commands).toHaveLength(2);
      expect(stored.events).toHaveLength(2);
    });
  }, 60_000);
});

/**
 * Runs `test` on an isolated database migrated up to, but excluding, the
 * current-shape migration; `through` holds the migrations up to and including
 * it, so a later migration never changes what the test proves. The Task and actor references do not matter to the
 * stored JSON, so the database drops them instead of building those records.
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
    previous = await mkdtemp(join(tmpdir(), 'task1348-previous-'));
    through = await mkdtemp(join(tmpdir(), 'task1348-through-'));
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
    await database.targetPool.query(
      'ALTER TABLE task_commands DROP CONSTRAINT task_commands_task_fk, DROP CONSTRAINT task_commands_actor_fk',
    );
    await database.targetPool.query(
      'ALTER TABLE task_events DROP CONSTRAINT task_events_task_fk, DROP CONSTRAINT task_events_actor_fk',
    );
    await test(database, through);
  } finally {
    await database.close();
    for (const folder of [previous, through])
      if (folder) await rm(folder, { recursive: true, force: true });
  }
}

async function insert(database: IsolatedPostgresTestDatabase, row: StoredRow) {
  if (row.table === 'task_commands')
    await database.targetPool.query(
      'INSERT INTO task_commands (workspace_id, company_id, task_id, actor_membership_id, idempotency_key, command, result) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [
        randomUUID(),
        task.companyId,
        task.id,
        actor.workspaceMembershipId,
        randomUUID(),
        '{}',
        JSON.stringify(row.result),
      ],
    );
  else
    await database.targetPool.query(
      'INSERT INTO task_events (workspace_id, company_id, task_id, version, actor_internal_user_id, actor_membership_id, actor_display_name, meaning) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        randomUUID(),
        task.companyId,
        task.id,
        1,
        actor.internalUserId,
        actor.workspaceMembershipId,
        actor.displayName,
        JSON.stringify(row.meaning),
      ],
    );
}

/** Text renderings compare the stored receipts and history exactly. */
async function storedRows(database: IsolatedPostgresTestDatabase) {
  const commands = await database.targetPool.query<{ result: string }>(
    'SELECT result::text AS result FROM task_commands ORDER BY result::text',
  );
  const events = await database.targetPool.query<{ meaning: string }>(
    'SELECT meaning::text AS meaning FROM task_events ORDER BY meaning::text',
  );
  return {
    commands: commands.rows.map((row) => row.result),
    events: events.rows.map((row) => row.meaning),
  };
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

/** The same stored JSON as an earlier application wrote it, without later keys. */
function without(value: object, keys: readonly string[]) {
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key)),
  );
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Object required');
  return Object.fromEntries(Object.entries(value));
}
