import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { describe, expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
describe.skipIf(!databaseUrl)('Working Evidence persisted cursor keys', () => {
  it('provisions a key for each new Company atomically and enforces scope and immutability on a database migrated from empty', async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'cursor1185_schema',
    });
    try {
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      const workspace = randomUUID(),
        user = randomUUID(),
        member = randomUUID(),
        company = randomUUID();
      await database.targetPool.query(
        'INSERT INTO workspaces (id,name) VALUES ($1,$2)',
        [workspace, 'Fictional cursor Workspace'],
      );
      await database.targetPool.query(
        'INSERT INTO internal_users (id,external_provider,external_subject,display_name,email) VALUES ($1,$2,$3,$4,$5)',
        [
          user,
          'deterministic-test',
          'cursor1185',
          'Fictional member',
          'cursor@example.test',
        ],
      );
      await database.targetPool.query(
        'INSERT INTO workspace_memberships (id,workspace_id,internal_user_id) VALUES ($1,$2,$3)',
        [member, workspace, user],
      );
      const insert =
        'INSERT INTO companies (id,workspace_id,display_name,created_by_internal_user_id,created_by_workspace_membership_id,registration_idempotency_key) VALUES ($1,$2,$3,$4,$5,$6)';
      await database.targetPool.query(insert, [
        company,
        workspace,
        'First fictional Company',
        user,
        member,
        randomUUID(),
      ]);
      const keys = async () =>
        (
          await database.targetPool.query<{
            workspace_id: string;
            company_id: string;
            key: string;
          }>('SELECT * FROM working_evidence_cursor_keys ORDER BY company_id')
        ).rows;
      const provisioned = await keys();
      expect(provisioned).toEqual([
        {
          workspace_id: workspace,
          company_id: company,
          key: expect.stringMatching(/^[a-f0-9-]{72}$/u),
        },
      ]);
      await expect(
        database.targetPool.query(
          "UPDATE working_evidence_cursor_keys SET key='changed'",
        ),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        database.targetPool.query('DELETE FROM working_evidence_cursor_keys'),
      ).rejects.toMatchObject({ code: '23514' });
      await expect(
        database.targetPool.query(
          'INSERT INTO working_evidence_cursor_keys (workspace_id,company_id) VALUES ($1,$2)',
          [randomUUID(), company],
        ),
      ).rejects.toMatchObject({ code: '23503' });
      const transaction = await database.targetPool.connect();
      try {
        await transaction.query('BEGIN');
        const rolledBack = randomUUID();
        await transaction.query(insert, [
          rolledBack,
          workspace,
          'Rolled back Company',
          user,
          member,
          randomUUID(),
        ]);
        const insertedKeys = await transaction.query<{ company_id: string }>(
          'SELECT company_id FROM working_evidence_cursor_keys',
        );
        expect(
          insertedKeys.rows.some((row) => row.company_id === rolledBack),
        ).toBe(true);
      } finally {
        try {
          await transaction.query('ROLLBACK');
        } finally {
          transaction.release();
        }
      }
      expect(await keys()).toEqual(provisioned);
      const fresh = randomUUID();
      await database.targetPool.query(insert, [
        fresh,
        workspace,
        'New fictional Company',
        user,
        member,
        randomUUID(),
      ]);
      expect(
        (await keys()).find((row) => row.company_id === fresh)?.key,
      ).toMatch(/^[a-f0-9-]{72}$/u);
    } finally {
      await database.close();
    }
  }, 60_000);
});
