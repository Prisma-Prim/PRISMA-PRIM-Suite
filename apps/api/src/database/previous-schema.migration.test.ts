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
        await migrate(database, { migrationsFolder: migrationsDirectory });
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
