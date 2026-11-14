import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { describe, expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
withPostgres('Certification Case schema', () => {
  it('refuses uncaptured Certification role versions and guards Case history on a database migrated from empty', async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'certification1131_schema',
    });
    try {
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      const workspace = randomUUID(),
        user = randomUUID(),
        membership = randomUUID(),
        company = randomUUID();
      await database.targetPool.query(
        'INSERT INTO workspaces (id, name) VALUES ($1, $2)',
        [workspace, 'Synthetic certification workspace'],
      );
      await database.targetPool.query(
        'INSERT INTO internal_users (id, external_provider, external_subject, display_name, email) VALUES ($1, $2, $3, $4, $5)',
        [
          user,
          'deterministic-test',
          'certification-schema',
          'Synthetic member',
          'certification-schema@example.test',
        ],
      );
      await database.targetPool.query(
        'INSERT INTO workspace_memberships (id, workspace_id, internal_user_id) VALUES ($1, $2, $3)',
        [membership, workspace, user],
      );
      await database.targetPool.query(
        'INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id, created_by_workspace_membership_id, registration_idempotency_key) VALUES ($1, $2, $3, $4, $5, $6)',
        [
          company,
          workspace,
          'Synthetic certifying Company',
          user,
          membership,
          'certification-company-key',
        ],
      );
      for (const role of ['reader', 'programme_manager'])
        for (const version of [null, 'v2'])
          await expect(
            database.targetPool.query(
              'INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id, bundle, permission_set_version) VALUES ($1, $2, $3, $4, $5)',
              [
                workspace,
                company,
                membership,
                `company_certification_${role}`,
                version,
              ],
            ),
          ).rejects.toMatchObject({ code: '23514' });
      const triggers = await database.targetPool.query<{ name: string }>(
        "SELECT tgname AS name FROM pg_trigger WHERE tgname LIKE 'certification_%' AND NOT tgisinternal ORDER BY tgname",
      );
      expect(triggers.rows.map((row) => row.name)).toEqual(
        expect.arrayContaining([
          'certification_case_not_deleted',
          'certification_event_immutable',
          'certification_receipt_immutable',
          'certification_step_version_immutable',
        ]),
      );
    } finally {
      await database.close();
    }
  }, 60_000);
});
