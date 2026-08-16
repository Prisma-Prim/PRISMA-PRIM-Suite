import { randomUUID } from 'node:crypto';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { DATABASE } from './database.constants.js';
import { assertLocalTestDatabaseUrl } from './test-database-target.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl) assertLocalTestDatabaseUrl(databaseUrl);
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres('previous schema migration preflight', () => {
  const databaseName = `prisma_prim_previous_${randomUUID().replaceAll('-', '')}_test`;
  let administrationPool: Pool;
  let targetPool: Pool;
  let targetUrl: string;
  let previousMigrationsDirectory: string;

  beforeAll(async () => {
    administrationPool = new Pool({ connectionString: databaseUrl });
    await administrationPool.query(`CREATE DATABASE "${databaseName}"`);
    const target = new URL(databaseUrl!);
    target.pathname = `/${databaseName}`;
    targetUrl = target.toString();
    targetPool = new Pool({ connectionString: targetUrl });
  });

  afterAll(async () => {
    await targetPool?.end();
    await administrationPool?.query(
      `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
    );
    await administrationPool?.end();
    if (previousMigrationsDirectory) {
      await rm(previousMigrationsDirectory, { recursive: true, force: true });
    }
  });

  it('starts the current application after migrating the immediately previous committed schema', async () => {
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

    const database = drizzle(targetPool);
    await migrate(database, { migrationsFolder: previousMigrationsDirectory });
    await migrate(database, { migrationsFolder: migrationsDirectory });

    process.env.NODE_ENV = 'test';
    process.env.ACCESS_IDENTITY_MODE = 'test';
    process.env.DATABASE_URL = targetUrl;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    const applicationPool = app.get(DATABASE).$client as Pool;

    try {
      const response = await fetch(`${await app.getUrl()}/api/health`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: 'ok' });
    } finally {
      await app.close();
      await applicationPool.end();
    }
  });
});
