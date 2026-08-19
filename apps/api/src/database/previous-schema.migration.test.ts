import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
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
  runPreviousSchemaTestLifecycle,
  waitForTargetDatabaseConnectionsToClose,
} from './previous-schema-test-lifecycle.js';
import { assertLocalTestDatabaseUrl } from './test-database-target.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) assertLocalTestDatabaseUrl(databaseUrl);
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres('previous schema migration preflight', () => {
  it('starts the current application after migrating the immediately previous committed schema', async () => {
    const databaseName = `prisma_prim_previous_${randomUUID().replaceAll('-', '')}_test`;
    let administrationPool: Pool | undefined;
    let migrationPool: Pool | undefined;
    let applicationPool: Pool | undefined;
    let application: INestApplication | undefined;
    let targetDatabaseCreated = false;
    let previousMigrationsDirectory: string | undefined;

    await runPreviousSchemaTestLifecycle(async () => {
      administrationPool = new Pool({ connectionString: databaseUrl });
      await administrationPool.query(`CREATE DATABASE "${databaseName}"`);
      targetDatabaseCreated = true;

      const target = new URL(databaseUrl!);
      target.pathname = `/${databaseName}`;
      const targetUrl = target.toString();
      migrationPool = new Pool({ connectionString: targetUrl });

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
      await migrate(database, { migrationsFolder: migrationsDirectory });

      process.env.NODE_ENV = 'test';
      process.env.ACCESS_IDENTITY_MODE = 'test';
      process.env.DATABASE_URL = targetUrl;
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      applicationPool = moduleRef.get(DATABASE).$client as Pool;
      application = moduleRef.createNestApplication();
      application.setGlobalPrefix('api');
      await application.listen(0, '127.0.0.1');

      const response = await fetch(`${await application.getUrl()}/api/health`);
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
        name: 'migration database pool',
        cleanup: async () => {
          await migrationPool?.end();
        },
      },
      {
        name: 'target database connections',
        cleanup: async () => {
          if (!administrationPool || !targetDatabaseCreated) return;
          await waitForTargetDatabaseConnectionsToClose(async () => {
            const result = await administrationPool!.query<{
              connectionCount: number;
            }>(
              `SELECT count(*)::integer AS "connectionCount"
                 FROM pg_stat_activity
                 WHERE datname = $1`,
              [databaseName],
            );
            return result.rows[0]?.connectionCount ?? 0;
          });
        },
      },
      {
        name: 'isolated target database',
        cleanup: async () => {
          if (!administrationPool || !targetDatabaseCreated) return;
          await administrationPool.query(
            `DROP DATABASE IF EXISTS "${databaseName}"`,
          );
          targetDatabaseCreated = false;
        },
      },
      {
        name: 'administration database pool',
        cleanup: async () => {
          await administrationPool?.end();
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
  });
});
