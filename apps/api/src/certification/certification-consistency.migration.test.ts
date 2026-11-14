import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { describe, expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

withPostgres('Dossier consistency schema', () => {
  it('accepts only the Discrepancy events and keeps the Discrepancy records immutable on a database migrated from empty', async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'certification1292_schema',
    });
    try {
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      // The Case and member do not matter to the action list, so this
      // isolated database drops the references instead of building them.
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
      await database.close();
    }
  }, 60_000);
});
