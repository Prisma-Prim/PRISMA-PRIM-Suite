import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { DATABASE } from '../database/database.constants.js';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (process.env.REQUIRE_ACCESS_POSTGRES === 'true' && !databaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL or DATABASE_URL is required for the PostgreSQL Access REST suite.',
  );
}
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres('Access REST API', () => {
  let app: INestApplication;
  let origin: string;
  let pool: Pool;
  let applicationPool: Pool;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ACCESS_IDENTITY_MODE = 'test';
    process.env.DATABASE_URL = databaseUrl;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();

    const database = app.get(DATABASE);
    applicationPool = database.$client;
    await migrate(database, { migrationsFolder: './drizzle' });
    pool = new Pool({ connectionString: databaseUrl });
    await pool.query('TRUNCATE internal_users, workspaces CASCADE');
  });

  afterAll(async () => {
    await pool?.end();
    await app?.close();
    await applicationPool?.end();
  });

  function identityHeaders(
    overrides: Partial<Record<string, string>> = {},
  ): Record<string, string> {
    return {
      'x-test-external-provider': 'deterministic-test',
      'x-test-external-subject': 'subject-20',
      'x-test-display-name': 'Ada Ionescu',
      'x-test-email': 'ada@example.test',
      ...overrides,
    };
  }

  it('returns 401 when no verified External Principal is available', async () => {
    const response = await fetch(`${origin}/api/access/current-actor`);

    expect(response.status).toBe(401);
  });

  it('provisions one persistent actor for repeated and concurrent requests', async () => {
    const responses = await Promise.all(
      Array.from({ length: 12 }, () =>
        fetch(`${origin}/api/access/current-actor`, {
          headers: identityHeaders(),
        }),
      ),
    );
    const actors = await Promise.all(
      responses.map((response) => response.json()),
    );

    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(new Set(actors.map((actor) => actor.internalUserId)).size).toBe(1);
    expect(new Set(actors.map((actor) => actor.workspaceId)).size).toBe(1);
    expect(actors[0]).toMatchObject({
      displayName: 'Ada Ionescu',
      email: 'ada@example.test',
      workspaceName: 'PRISMA Workspace',
    });

    const userCount = await pool.query<{ count: string }>(
      'SELECT count(*) FROM internal_users',
    );
    const workspaceCount = await pool.query<{ count: string }>(
      'SELECT count(*) FROM workspaces',
    );
    expect(userCount.rows[0]?.count).toBe('1');
    expect(workspaceCount.rows[0]?.count).toBe('1');
  });

  it('synchronizes profile attributes without changing local identity', async () => {
    const first = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders(),
    }).then((response) => response.json());
    const updatedResponse = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders({
        'x-test-display-name': 'Ada Popescu',
        'x-test-email': 'ada.popescu@example.test',
      }),
    });
    const updated = await updatedResponse.json();

    expect(updatedResponse.status).toBe(200);
    expect(updated).toMatchObject({
      internalUserId: first.internalUserId,
      workspaceId: first.workspaceId,
      displayName: 'Ada Popescu',
      email: 'ada.popescu@example.test',
    });
  });

  it('returns 403 for an inactive Internal User', async () => {
    await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders(),
    });
    await pool.query(
      "UPDATE internal_users SET status = 'inactive' WHERE external_subject = $1",
      ['subject-20'],
    );

    const response = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders({
        'x-test-display-name': 'Denied profile change',
        'x-test-email': 'denied@example.test',
      }),
    });

    expect(response.status).toBe(403);
    const persistedProfile = await pool.query<{
      display_name: string;
      email: string;
    }>(
      'SELECT display_name, email FROM internal_users WHERE external_subject = $1',
      ['subject-20'],
    );
    expect(persistedProfile.rows[0]).toEqual({
      display_name: 'Ada Popescu',
      email: 'ada.popescu@example.test',
    });
  });
});
