import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const workspaceId = '00000000-0000-4000-8000-000000763001';
const userId = '00000000-0000-4000-8000-000000763002';
const membershipId = '00000000-0000-4000-8000-000000763003';
const companyId = '00000000-0000-4000-8000-000000763004';

describe.skipIf(!databaseUrl)(
  'Operational Risk role permission sets on a database migrated from empty',
  () => {
    let database: IsolatedPostgresTestDatabase | undefined;

    beforeAll(async () => {
      if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
      database = await createIsolatedPostgresTestDatabase({
        baseDatabaseUrl: databaseUrl,
        namePrefix: 'risk763_schema',
      });
      await migrate(drizzle(database.targetPool), {
        migrationsFolder: resolve('drizzle'),
      });
      await database.targetPool.query(
        "INSERT INTO workspaces (id,name) VALUES ($1,'Synthetic Risk Workspace')",
        [workspaceId],
      );
      await database.targetPool.query(
        "INSERT INTO internal_users (id,external_provider,external_subject,display_name,email) VALUES ($1,'synthetic-risk-migration','synthetic-risk-member','Synthetic Actor','actor@example.test')",
        [userId],
      );
      await database.targetPool.query(
        'INSERT INTO workspace_memberships (id,workspace_id,internal_user_id) VALUES ($1,$2,$3)',
        [membershipId, workspaceId, userId],
      );
      await database.targetPool.query(
        "INSERT INTO companies (id,workspace_id,display_name,created_by_internal_user_id,created_by_workspace_membership_id,registration_idempotency_key) VALUES ($1,$2,'Synthetic Risk Company',$3,$4,'risk-company')",
        [companyId, workspaceId, userId, membershipId],
      );
    }, 60_000);
    afterAll(async () => {
      await database?.close();
    });

    it.each([
      'company_operational_risk_reader',
      'company_operational_risk_recorder',
    ])('permits only explicit captured v1 for %s', async (bundle) => {
      for (const version of [null, 'v2', 'unknown'])
        await expect(
          databasePool().query(
            'INSERT INTO company_role_assignments (workspace_id,company_id,workspace_membership_id,bundle,permission_set_version) VALUES ($1,$2,$3,$4,$5)',
            [workspaceId, companyId, membershipId, bundle, version],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      const result = await databasePool().query(
        'INSERT INTO company_role_assignments (workspace_id,company_id,workspace_membership_id,bundle,permission_set_version) VALUES ($1,$2,$3,$4,$5) RETURNING permission_set_version',
        [workspaceId, companyId, membershipId, bundle, 'v1'],
      );
      expect(result.rows).toEqual([{ permission_set_version: 'v1' }]);
    });
    function databasePool() {
      if (!database) throw new Error('Synthetic schema database unavailable.');
      return database.targetPool;
    }
  },
);
