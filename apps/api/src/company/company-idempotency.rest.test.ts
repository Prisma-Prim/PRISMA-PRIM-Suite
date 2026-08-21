import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { DATABASE } from '../database/database.constants.js';
import { assertLocalTestDatabaseUrl } from '../database/test-database-target.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (process.env.REQUIRE_COMPANY_POSTGRES === 'true' && !databaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for the destructive PostgreSQL Company idempotency REST suite.',
  );
}
if (databaseUrl) assertLocalTestDatabaseUrl(databaseUrl);
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres('Company registration idempotency REST API', () => {
  let app: INestApplication;
  let origin: string;
  let pool: Pool;
  let applicationPool: Pool;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ACCESS_IDENTITY_MODE = 'test';
    process.env.ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER = 'deterministic-test';
    process.env.ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT = 'workspace-owner';
    process.env.ACCESS_BOOTSTRAP_WORKSPACE_KEY = 'company-idempotency-workspace';
    process.env.ACCESS_BOOTSTRAP_WORKSPACE_NAME = 'Company Idempotency Workspace';
    process.env.ACCESS_ACCEPTED_INVITATIONS_JSON = '[]';
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
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await pool?.end();
    await app?.close();
    await applicationPool?.end();
  });

  it('replays the same registration command but rejects a different command using the same key', async () => {
    const idempotencyKey = 'register-command-equivalence';
    const firstResponse = await registerCompany({
      idempotencyKey,
      displayName: '  Atlas Assurance  ',
    });
    const firstCompany = await firstResponse.json();

    expect(firstResponse.status).toBe(201);
    expect(firstCompany).toMatchObject({
      displayName: 'Atlas Assurance',
      status: 'active',
    });

    const replayResponse = await registerCompany({
      idempotencyKey,
      displayName: 'Atlas Assurance',
    });
    expect(replayResponse.status).toBe(201);
    await expect(replayResponse.json()).resolves.toEqual(firstCompany);

    const mismatchResponse = await registerCompany({
      idempotencyKey,
      displayName: 'Different Provider',
    });
    expect(mismatchResponse.status).toBe(400);
    await expect(mismatchResponse.json()).resolves.toEqual({
      message: 'Idempotency-Key was already used for another command.',
      error: 'Bad Request',
      statusCode: 400,
    });

    const companies = await pool.query<{
      display_name: string;
      registration_idempotency_key: string;
    }>(
      `SELECT display_name, registration_idempotency_key
       FROM companies
       WHERE registration_idempotency_key = $1`,
      [idempotencyKey],
    );
    expect(companies.rows).toEqual([
      {
        display_name: 'Atlas Assurance',
        registration_idempotency_key: idempotencyKey,
      },
    ]);

    const events = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM activity_log_events
       WHERE action = 'company.registered'`,
    );
    expect(events.rows[0]?.count).toBe('1');
  });

  function registerCompany(input: {
    idempotencyKey: string;
    displayName: string;
  }): Promise<Response> {
    return fetch(`${origin}/api/companies`, {
      method: 'POST',
      headers: {
        ...identityHeaders(),
        'content-type': 'application/json',
        'idempotency-key': input.idempotencyKey,
      },
      body: JSON.stringify({ displayName: input.displayName }),
    });
  }

  function identityHeaders(): Record<string, string> {
    return {
      'x-test-external-provider': 'deterministic-test',
      'x-test-external-subject': 'workspace-owner',
      'x-test-display-name': 'Ada Ionescu',
      'x-test-email': 'ada@example.test',
    };
  }
});
