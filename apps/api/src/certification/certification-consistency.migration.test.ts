import { randomUUID } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { describe, expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

withPostgres('Dossier consistency migration', () => {
  it('keeps recorded Case events, accepts the Discrepancy events and keeps the new records immutable', async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'certification1292_upgrade',
    });
    let previous: string | undefined;
    try {
      previous = await mkdtemp(join(tmpdir(), 'certification1292-previous-'));
      const directory = resolve('drizzle');
      const journal = record(
        JSON.parse(
          await readFile(join(directory, 'meta', '_journal.json'), 'utf8'),
        ),
      );
      if (!Array.isArray(journal.entries))
        throw new Error('Invalid migration journal.');
      const entries = journal.entries.map((entry: unknown) => {
        const value = record(entry);
        if (typeof value.tag !== 'string')
          throw new Error('Invalid migration tag.');
        return { ...value, tag: value.tag };
      });
      const index = entries.findIndex((entry) =>
        entry.tag.endsWith('_certification_consistency'),
      );
      expect(index).toBeGreaterThan(0);
      const old = entries.slice(0, index);
      await mkdir(join(previous, 'meta'));
      await writeFile(
        join(previous, 'meta', '_journal.json'),
        JSON.stringify({ ...journal, entries: old }),
      );
      for (const entry of old)
        await cp(
          join(directory, `${entry.tag}.sql`),
          join(previous, `${entry.tag}.sql`),
        );
      const connection = drizzle(database.targetPool);
      await migrate(connection, { migrationsFolder: previous });
      // An event recorded before the check existed. Its Case and member do
      // not matter to the action list, so this isolated database drops the
      // references instead of building them.
      await database.targetPool.query(
        'ALTER TABLE certification_events DROP CONSTRAINT certification_events_case_fk, DROP CONSTRAINT certification_events_actor_fk',
      );
      const insert = `INSERT INTO certification_events
        (workspace_id, company_id, case_id, revision, action, actor_membership_id, actor_internal_user_id, occurred_at, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, now(), '{"revision": 2}'::jsonb)`;
      const event = (revision: number, action: string) => [
        randomUUID(),
        randomUUID(),
        randomUUID(),
        revision,
        action,
        randomUUID(),
        randomUUID(),
      ];
      await database.targetPool.query(
        insert,
        event(19, 'certification_case.decision_recorded'),
      );
      await expect(
        database.targetPool.query(
          insert,
          event(20, 'certification_case.discrepancy_recorded'),
        ),
      ).rejects.toMatchObject({ code: '23514' });

      await migrate(connection, { migrationsFolder: directory });

      const existing = await database.targetPool.query(
        'SELECT revision, action FROM certification_events ORDER BY revision',
      );
      expect(existing.rows).toEqual([
        { revision: 19, action: 'certification_case.decision_recorded' },
      ]);
      for (const action of [
        'certification_case.discrepancy_recorded',
        'certification_case.discrepancy_resolved',
      ])
        await database.targetPool.query(insert, event(21, action));
      await expect(
        database.targetPool.query(
          insert,
          event(22, 'certification_case.discrepancy_deleted'),
        ),
      ).rejects.toMatchObject({ code: '23514' });
      const triggers = await database.targetPool.query<{ name: string }>(
        `SELECT tgname AS name FROM pg_trigger
          WHERE tgrelid IN ('certification_manual_discrepancies'::regclass, 'certification_discrepancy_resolutions'::regclass)
            AND NOT tgisinternal ORDER BY tgname`,
      );
      expect(triggers.rows.map((row) => row.name)).toEqual([
        'certification_discrepancy_resolution_immutable',
        'certification_manual_discrepancy_immutable',
      ]);
      const receipts = await database.targetPool.query<{ definition: string }>(
        `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
          WHERE conname = 'certification_receipts_kind_check'`,
      );
      expect(receipts.rows[0]?.definition).toContain('discrepancy_resolution');
    } finally {
      try {
        await database.close();
      } finally {
        if (previous) await rm(previous, { recursive: true, force: true });
      }
    }
  }, 60000);
});

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected journal object.');
  return Object.fromEntries(Object.entries(value));
}
