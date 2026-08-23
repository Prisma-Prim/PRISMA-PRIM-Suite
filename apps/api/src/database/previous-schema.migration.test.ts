import type { INestApplication } from '@nestjs/common';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { DATABASE } from './database.constants.js';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from './isolated-postgres-test-database.js';
import { runPreviousSchemaTestLifecycle } from './previous-schema-test-lifecycle.js';
import { assertLocalTestDatabaseUrl } from './test-database-target.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) assertLocalTestDatabaseUrl(databaseUrl);
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const previousSchemaMigrationTestTimeoutMs = 15_000;

describeWithPostgres('previous schema migration preflight', () => {
  it(
    'starts the current application after migration without promoting a membership outside bootstrap resolution',
    async () => {
      let isolatedDatabase: IsolatedPostgresTestDatabase | undefined;
      let migrationPool: Pool | undefined;
      let applicationPool: Pool | undefined;
      let application: INestApplication | undefined;
      let previousMigrationsDirectory: string | undefined;

      await runPreviousSchemaTestLifecycle(async () => {
        isolatedDatabase = await createIsolatedPostgresTestDatabase({
          baseDatabaseUrl: databaseUrl!,
          namePrefix: 'prisma_prim_previous',
        });
        migrationPool = isolatedDatabase.targetPool;
        const targetUrl = isolatedDatabase.targetUrl;

        const migrationsDirectory = resolve('drizzle');
        const journal = JSON.parse(
          await readFile(
            join(migrationsDirectory, 'meta', '_journal.json'),
            'utf8',
          ),
        );
        expect(journal.entries.length).toBeGreaterThan(1);
        const previousEntries = journal.entries.slice(0, -1);

        previousMigrationsDirectory = await mkdtemp(
          join(tmpdir(), 'prisma-prim-previous-schema-'),
        );
        await cp(
          join(migrationsDirectory, 'meta'),
          join(previousMigrationsDirectory, 'meta'),
          { recursive: true },
        );
        await writeFile(
          join(previousMigrationsDirectory, 'meta', '_journal.json'),
          `${JSON.stringify({ ...journal, entries: previousEntries }, null, 2)}\n`,
        );
        for (const entry of previousEntries) {
          await cp(
            join(migrationsDirectory, `${entry.tag}.sql`),
            join(previousMigrationsDirectory, `${entry.tag}.sql`),
          );
        }

        const database = drizzle(migrationPool);
        await migrate(database, {
          migrationsFolder: previousMigrationsDirectory,
        });
        await migrationPool.query(`
          WITH seeded_workspace AS (
            INSERT INTO workspaces (singleton_key, name)
            VALUES ('previous-schema-workspace', 'Previous Schema Workspace')
            RETURNING id
          )
          INSERT INTO internal_users (
            workspace_id, external_provider, external_subject,
            display_name, email
          )
          SELECT id, 'deterministic-test', 'previous-schema-owner',
            'Previous Owner', 'previous-owner@example.test'
          FROM seeded_workspace
        `);
        await migrationPool.query(`
          WITH seeded_membership AS (
            SELECT membership.workspace_id, membership.id,
              membership.internal_user_id
            FROM workspace_memberships AS membership
            INNER JOIN internal_users AS internal_user
              ON internal_user.workspace_id = membership.workspace_id
              AND internal_user.id = membership.internal_user_id
            INNER JOIN workspaces AS workspace
              ON workspace.id = membership.workspace_id
            WHERE workspace.singleton_key = 'previous-schema-workspace'
              AND internal_user.external_provider = 'deterministic-test'
              AND internal_user.external_subject = 'previous-schema-owner'
          ), seeded_company AS (
            INSERT INTO companies (
              id, workspace_id, display_name, created_by_internal_user_id,
              created_by_workspace_membership_id,
              registration_idempotency_key
            )
            SELECT '00000000-0000-4000-8000-000000001461', workspace_id,
              'Previous Provider', internal_user_id, id,
              'previous-provider-registration'
            FROM seeded_membership
            RETURNING workspace_id, id
          ), seeded_client AS (
            INSERT INTO client_accounts (
              id, workspace_id, display_name, created_by_internal_user_id,
              created_by_workspace_membership_id
            )
            SELECT '00000000-0000-4000-8000-000000001462', workspace_id,
              'Previous Shared Client', internal_user_id, id
            FROM seeded_membership
            RETURNING workspace_id, id
          )
          INSERT INTO client_company_relationships (
            id, workspace_id, client_account_id, company_id,
            created_by_internal_user_id, created_by_workspace_membership_id
          )
          SELECT '00000000-0000-4000-8000-000000001463',
            seeded_client.workspace_id, seeded_client.id, seeded_company.id,
            seeded_membership.internal_user_id, seeded_membership.id
          FROM seeded_client
          INNER JOIN seeded_company
            ON seeded_company.workspace_id = seeded_client.workspace_id
          INNER JOIN seeded_membership
            ON seeded_membership.workspace_id = seeded_client.workspace_id
        `);
        await migrate(database, { migrationsFolder: migrationsDirectory });
        const upgradedClient = await migrationPool.query<{
          id: string;
          relationship_id: string;
          version: number;
          contacts: unknown[];
        }>(`SELECT client.id, relationship.id AS relationship_id,
              client.version, client.contacts
            FROM client_accounts AS client
            INNER JOIN client_company_relationships AS relationship
              ON relationship.workspace_id = client.workspace_id
              AND relationship.client_account_id = client.id
            WHERE client.id = '00000000-0000-4000-8000-000000001462'`);
        expect(upgradedClient.rows).toEqual([
          {
            id: '00000000-0000-4000-8000-000000001462',
            relationship_id: '00000000-0000-4000-8000-000000001463',
            version: 1,
            contacts: [],
          },
        ]);
        const grantsAfterMigration = await migrationPool.query<{
          count: string;
        }>(`SELECT count(*)
            FROM workspace_permission_grants
            WHERE permission::text = 'client.manage'`);
        expect(grantsAfterMigration.rows[0]).toEqual({ count: '0' });

        process.env.NODE_ENV = 'test';
        process.env.ACCESS_IDENTITY_MODE = 'test';
        process.env.DATABASE_URL = targetUrl;
        process.env.ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER = 'deterministic-test';
        process.env.ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT = 'previous-schema-owner';
        process.env.ACCESS_BOOTSTRAP_WORKSPACE_KEY =
          'previous-schema-workspace';
        process.env.ACCESS_BOOTSTRAP_WORKSPACE_NAME =
          'Previous Schema Workspace';
        const moduleRef = await Test.createTestingModule({
          imports: [AppModule],
        }).compile();
        applicationPool = moduleRef.get(DATABASE).$client as Pool;
        application = moduleRef.createNestApplication();
        application.setGlobalPrefix('api');
        await application.listen(0, '127.0.0.1');

        const applicationUrl = await application.getUrl();
        const actorResponse = await fetch(
          `${applicationUrl}/api/access/current-actor`,
          {
            headers: {
              'x-test-external-provider': 'deterministic-test',
              'x-test-external-subject': 'previous-schema-owner',
              'x-test-display-name': 'Previous Owner',
              'x-test-email': 'previous-owner@example.test',
            },
          },
        );
        expect(actorResponse.status).toBe(200);
        await expect(actorResponse.json()).resolves.toMatchObject({
          workspacePermissions: expect.arrayContaining(['client.manage']),
        });
        const grantsAfterBootstrapResolution = await migrationPool.query<{
          count: string;
        }>(`SELECT count(*)
            FROM workspace_permission_grants
            WHERE permission::text = 'client.manage'`);
        expect(grantsAfterBootstrapResolution.rows[0]).toEqual({ count: '1' });

        const migratedClientResponse = await fetch(
          `${applicationUrl}/api/clients/00000000-0000-4000-8000-000000001462`,
          {
            headers: {
              'x-test-external-provider': 'deterministic-test',
              'x-test-external-subject': 'previous-schema-owner',
              'x-test-display-name': 'Previous Owner',
              'x-test-email': 'previous-owner@example.test',
              'x-company-context-id': '00000000-0000-4000-8000-000000001461',
            },
          },
        );
        expect(migratedClientResponse.status).toBe(200);
        await expect(migratedClientResponse.json()).resolves.toEqual({
          id: '00000000-0000-4000-8000-000000001462',
          displayName: 'Previous Shared Client',
          relatedToActiveCompany: true,
          taxId: null,
          address: null,
          telephone: null,
          generalEmail: null,
          contacts: [],
          businessActivity: null,
          version: 1,
          involvedCompanyDisplayNames: ['Previous Provider'],
        });

        const response = await fetch(`${applicationUrl}/api/health`);
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual(
          expect.objectContaining({ status: 'ok' }),
        );
      }, [
        {
          name: 'current application',
          cleanup: async () => {
            await application?.close();
          },
        },
        {
          name: 'current application database pool',
          cleanup: async () => {
            await applicationPool?.end();
          },
        },
        {
          name: 'isolated target database',
          cleanup: async () => {
            await isolatedDatabase?.close();
          },
        },
        {
          name: 'temporary previous-schema migrations',
          cleanup: async () => {
            if (!previousMigrationsDirectory) return;
            await rm(previousMigrationsDirectory, {
              recursive: true,
              force: true,
            });
          },
        },
      ]);
    },
    previousSchemaMigrationTestTimeoutMs,
  );
});
