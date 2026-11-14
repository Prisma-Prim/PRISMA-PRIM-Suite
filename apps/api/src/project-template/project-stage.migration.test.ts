import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const workspaceId = '00000000-0000-4000-8000-000000006870';
const userId = '00000000-0000-4000-8000-000000006871';
const memberId = '00000000-0000-4000-8000-000000006872';
const companyId = '00000000-0000-4000-8000-000000006873';

it.skipIf(!databaseUrl)(
  'accepts the Project stage advancer grant only as captured v1 on a database migrated from empty',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'stage_schema',
    });
    try {
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);
      await query(
        `INSERT INTO workspaces (id, name) VALUES ($1, 'Stage grants')`,
        [workspaceId],
      );
      await query(
        `INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
         VALUES ($1, 'deterministic-test', 'stage-owner', 'Ana Popescu', 'ana@example.test')`,
        [userId],
      );
      await query(
        `INSERT INTO workspace_memberships (id, workspace_id, internal_user_id) VALUES ($1, $2, $3)`,
        [memberId, workspaceId, userId],
      );
      await query(
        `INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id,
           created_by_workspace_membership_id, registration_idempotency_key)
         VALUES ($1, $2, 'Stage Company', $3, $4, 'stage-company')`,
        [companyId, workspaceId, userId, memberId],
      );
      const insert = (version: string | null) =>
        query(
          `INSERT INTO company_role_assignments(workspace_id,company_id,workspace_membership_id,bundle,permission_set_version,revoked_at) VALUES($1,$2,$3,'company_project_stage_advancer',$4,now())`,
          [workspaceId, companyId, memberId, version],
        );
      for (const version of [null, 'v2', 'V1'])
        await expect(insert(version)).rejects.toMatchObject({ code: '23514' });
      await insert('v1');
    } finally {
      await database.close();
    }
  },
  60_000,
);
