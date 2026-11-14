import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const workspaceId = '00000000-0000-4000-8000-000000006340';
const userId = '00000000-0000-4000-8000-000000006341';
const membershipId = '00000000-0000-4000-8000-000000006342';
const companyId = '00000000-0000-4000-8000-000000006343';

it.skipIf(!databaseUrl)(
  'accepts the Project Template User grant only as captured v1 or v2 on a database migrated from empty',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'template_schema',
    });
    try {
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);
      await query(
        `INSERT INTO workspaces (id, name) VALUES ($1, 'Template grants')`,
        [workspaceId],
      );
      await query(
        `INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
         VALUES ($1, 'deterministic-test', 'template-owner', 'Ana Popescu', 'ana@example.test')`,
        [userId],
      );
      await query(
        `INSERT INTO workspace_memberships (id, workspace_id, internal_user_id) VALUES ($1, $2, $3)`,
        [membershipId, workspaceId, userId],
      );
      await query(
        `INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id,
           created_by_workspace_membership_id, registration_idempotency_key)
         VALUES ($1, $2, 'Template Company', $3, $4, 'template-company')`,
        [companyId, workspaceId, userId, membershipId],
      );
      const insert = (version: string | null) =>
        query(
          `INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id, bundle, permission_set_version, revoked_at) VALUES ($1, $2, $3, 'company_project_template_user', $4, now())`,
          [workspaceId, companyId, membershipId, version],
        );
      for (const version of [null, 'v3', 'V1'])
        await expect(insert(version)).rejects.toMatchObject({ code: '23514' });
      await insert('v1');
      await insert('v2');
    } finally {
      await database.close();
    }
  },
  60_000,
);
