import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { describe, expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;

withPostgres('Exchange register schema', () => {
  it('accepts only the exchange events, rules and role and keeps the exchange records immutable on a database migrated from empty', async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'certification1293_schema',
    });
    try {
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      // The Case and member do not matter to the constraint lists, so this
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
        'certification_case.exchange_recorded',
        'certification_case.reverification_item_added',
        'certification_case.reverification_item_withdrawn',
      ])
        await database.targetPool.query(insert, event(21, action));
      await expect(
        database.targetPool.query(
          insert,
          event(22, 'certification_case.exchange_deleted'),
        ),
      ).rejects.toMatchObject({ code: '23514' });
      const definition = async (name: string) =>
        (
          await database.targetPool.query<{ definition: string }>(
            'SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = $1',
            [name],
          )
        ).rows[0]?.definition ?? '';
      expect(
        await definition('certification_discrepancy_resolutions_values_check'),
      ).toContain("'R16'");
      expect(
        await definition('certification_case_documents_role_check'),
      ).toContain("'correspondence'");
      expect(await definition('certification_receipts_kind_check')).toContain(
        'reverification_withdrawal',
      );
      const triggers = await database.targetPool.query<{ name: string }>(
        `SELECT tgname AS name FROM pg_trigger
          WHERE tgrelid IN (
            'certification_exchange_records'::regclass,
            'certification_reverification_items'::regclass,
            'certification_reverification_withdrawals'::regclass,
            'certification_deadline_sets'::regclass,
            'certification_procedure_events'::regclass
          ) AND NOT tgisinternal ORDER BY tgname`,
      );
      expect(triggers.rows.map((row) => row.name)).toEqual([
        'certification_deadline_set_immutable',
        'certification_exchange_record_immutable',
        'certification_procedure_event_immutable',
        'certification_reverification_item_immutable',
        'certification_reverification_withdrawal_immutable',
      ]);
    } finally {
      await database.close();
    }
  }, 60_000);
});
