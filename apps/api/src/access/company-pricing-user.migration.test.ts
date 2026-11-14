import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { expect, it } from 'vitest';
import { createIsolatedPostgresTestDatabase } from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const WORKSPACE = '00000000-0000-4000-8000-000000039700';
const USER = '00000000-0000-4000-8000-000000039701';
const MEMBERSHIP = '00000000-0000-4000-8000-000000039702';
const COMPANY = '00000000-0000-4000-8000-000000039703';
const PRICING_USER_ASSIGNMENT = '00000000-0000-4000-8000-000000039705';
const CHECK_VIOLATION = '23514';

it.skipIf(!databaseUrl)(
  'accepts only the captured v1 of Company Pricing User and records both its assignment actions on a database migrated from empty',
  async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    const database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'pricing_user_schema',
    });
    try {
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      const query = (text: string, values: unknown[] = []) =>
        database.targetPool.query(text, values);

      await query(
        `INSERT INTO workspaces (id, name) VALUES ($1, 'Pricing access')`,
        [WORKSPACE],
      );
      await query(
        `INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
         VALUES ($1, 'deterministic-test', 'pricing-user', 'Pricing User', 'pricing-user@example.test')`,
        [USER],
      );
      await query(
        `INSERT INTO workspace_memberships (id, workspace_id, internal_user_id) VALUES ($1, $2, $3)`,
        [MEMBERSHIP, WORKSPACE, USER],
      );
      await query(
        `INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id,
           created_by_workspace_membership_id, registration_idempotency_key)
         VALUES ($1, $2, 'Pricing Company', $3, $4, 'pricing-user-company')`,
        [COMPANY, WORKSPACE, USER, MEMBERSHIP],
      );

      const insertAssignment = (bundle: string, version: string | null) =>
        query(
          `INSERT INTO company_role_assignments (workspace_id, company_id, workspace_membership_id,
             bundle, permission_set_version, revoked_at)
           VALUES ($1, $2, $3, $4, $5, now())`,
          [WORKSPACE, COMPANY, MEMBERSHIP, bundle, version],
        );
      await insertAssignment('company_pricing_configuration', 'v1');
      await insertAssignment('company_pricing_user', 'v1');
      for (const [bundle, version] of [
        ['company_pricing_user', null],
        ['company_pricing_user', 'v2'],
        ['company_pricing_user', 'V1'],
        ['company_pricing_configuration', 'v2'],
        ['company_service_catalogue', 'v2'],
        ['company_commercial_activity_reader', 'v2'],
        ['company_commercial_intake', 'v5'],
        ['company_project_access', 'v3'],
        ['company_director_client_access', null],
        ['company_document_registrar', 'v4'],
        ['company_task_manager', null],
        ['company_context_access', 'v1'],
      ] as const)
        await expect(insertAssignment(bundle, version)).rejects.toMatchObject({
          code: CHECK_VIOLATION,
        });

      // A live v1 assignment carries both lifecycle actions.
      await query(
        `INSERT INTO company_role_assignments (id, workspace_id, company_id, workspace_membership_id,
           bundle, permission_set_version)
         VALUES ($1, $2, $3, $4, 'company_pricing_user', 'v1')`,
        [PRICING_USER_ASSIGNMENT, WORKSPACE, COMPANY, MEMBERSHIP],
      );
      for (const action of [
        'company_pricing_user_assignment.granted',
        'company_pricing_user_assignment.revoked',
      ])
        await query(
          `INSERT INTO activity_log_events (workspace_id, actor_internal_user_id,
             actor_workspace_membership_id, action, target_type, target_internal_user_id,
             target_workspace_membership_id, target_company_id, target_company_role_assignment_id,
             metadata, idempotency_key)
           VALUES ($1, $2, $3, $4, 'company_role_assignment', $2, $3, $5, $6,
                   '{"bundle":"Company Pricing User"}'::jsonb, $7)`,
          [
            WORKSPACE,
            USER,
            MEMBERSHIP,
            action,
            COMPANY,
            PRICING_USER_ASSIGNMENT,
            `pricing-user-${action}`,
          ],
        );
    } finally {
      await database.close();
    }
  },
  60_000,
);
