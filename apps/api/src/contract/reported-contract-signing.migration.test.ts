import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const WORKSPACE = '00000000-0000-4000-8000-000000008401';
const USER = '00000000-0000-4000-8000-000000008402';
const MEMBERSHIP = '00000000-0000-4000-8000-000000008403';
const COMPANY = '00000000-0000-4000-8000-000000008404';

it.skipIf(!databaseUrl)(
  'accepts the Contract signature declarer grant only as captured v1 on a database migrated from empty',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'reported_signing_schema',
    });
    try {
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);
      await query(
        `INSERT INTO workspaces (id, name) VALUES ($1, 'Reported signing grants')`,
        [WORKSPACE],
      );
      await query(
        `INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
         VALUES ($1, 'deterministic-test', 'signing-declarer', 'Ana Popescu', 'ana@example.test')`,
        [USER],
      );
      await query(
        `INSERT INTO workspace_memberships (id, workspace_id, internal_user_id) VALUES ($1, $2, $3)`,
        [MEMBERSHIP, WORKSPACE, USER],
      );
      await query(
        `INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id,
           created_by_workspace_membership_id, registration_idempotency_key)
         VALUES ($1, $2, 'Signing Company', $3, $4, 'signing-company')`,
        [COMPANY, WORKSPACE, USER, MEMBERSHIP],
      );
      const insert = (version: string | null) =>
        query(
          `INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id,
             bundle, permission_set_version)
           VALUES ($1, $2, $3, 'company_contract_signature_declarer', $4)`,
          [WORKSPACE, COMPANY, MEMBERSHIP, version],
        );
      for (const version of [null, 'v0', 'v2'])
        await expect(insert(version)).rejects.toHaveProperty('code', '23514');
      await insert('v1');
    } finally {
      await database.close();
    }
  },
  60_000,
);
