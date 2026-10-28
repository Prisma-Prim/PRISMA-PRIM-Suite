import { cp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { Pool } from 'pg';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid frozen historical Task fixture.');
  return Object.fromEntries(Object.entries(value));
}
/** Genuine old facts are seeded without running today's ORM against columns that did not exist. */
export async function restoreFrozenTaskSetup(
  pool: Pool,
  name:
    | 'task-results'
    | 'project-template'
    | 'project-stage'
    | 'project-template-version'
    | 'project-pilot-plan'
    | 'mission-result-review'
    | 'mission-plan'
    | 'received-contract'
    | 'reported-contract-signing'
    | 'task-description',
) {
  const sql = await readFile(
    join('test-support/task-migration-fixtures', name + '.sql'),
    'utf8',
  );
  const context = sql
    .split('\n')
    .find((line) => line.startsWith('-- Context: '));
  if (!context) throw new Error('Missing frozen historical context.');
  const value: unknown = JSON.parse(context.slice('-- Context: '.length));
  await pool.query(sql);
  return record(value);
}

/** Assert the original owning upgrade first; only then upgrade further for today's application. */
export async function applyHistoricalTaskTarget(input: {
  pool: Pool;
  previous: string;
  journal: Record<string, unknown>;
  entries: unknown[];
  index: number;
}) {
  const entry = record(input.entries[input.index]);
  if (typeof entry.tag !== 'string' || !/^\d{4}_[a-z0-9_-]+$/u.test(entry.tag))
    throw new Error('Invalid historical migration target.');
  await cp(
    join('drizzle', entry.tag + '.sql'),
    join(input.previous, entry.tag + '.sql'),
  );
  await writeFile(
    join(input.previous, 'meta/_journal.json'),
    JSON.stringify({
      ...input.journal,
      entries: input.entries.slice(0, input.index + 1),
    }),
  );
  await migrate(drizzle(input.pool), { migrationsFolder: input.previous });
}
