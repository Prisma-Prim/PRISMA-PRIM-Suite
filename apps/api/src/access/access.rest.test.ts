import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { DATABASE } from '../database/database.constants.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (process.env.REQUIRE_ACCESS_POSTGRES === 'true' && !databaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for the destructive PostgreSQL Access REST suite.',
  );
}
if (databaseUrl) {
  const databaseTarget = new URL(databaseUrl);
  const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
  const databaseName = decodeURIComponent(databaseTarget.pathname.slice(1));
  const isSafeTestTarget =
    new Set(['postgres:', 'postgresql:']).has(databaseTarget.protocol) &&
    !databaseTarget.search &&
    !databaseTarget.hash &&
    localHosts.has(databaseTarget.hostname) &&
    databaseName.endsWith('_test');

  if (!isSafeTestTarget) {
    throw new Error(
      'TEST_DATABASE_URL must identify a local database whose name ends with "_test", without connection-target overrides.',
    );
  }
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
  });

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ACCESS_IDENTITY_MODE = 'test';
    await pool.query(
      'TRUNCATE activity_log_events, internal_users, workspaces CASCADE',
    );
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
    await expect(persistedRecordCounts()).resolves.toEqual({
      activityLogEvents: '0',
      internalUsers: '0',
      workspaces: '0',
    });
  });

  it.each(['test', 'local-demo'])(
    'rejects %s identity injection when NODE_ENV is production',
    async (identityMode) => {
      process.env.NODE_ENV = 'production';
      process.env.ACCESS_IDENTITY_MODE = identityMode;

      const response = await fetch(`${origin}/api/access/current-actor`, {
        headers: identityHeaders(),
      });

      expect(response.status).toBe(401);
      await expect(persistedRecordCounts()).resolves.toEqual({
        activityLogEvents: '0',
        internalUsers: '0',
        workspaces: '0',
      });
    },
  );

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

    await expect(persistedRecordCounts()).resolves.toEqual({
      activityLogEvents: '1',
      internalUsers: '1',
      workspaces: '1',
    });
  });

  it('records the first Internal User provisioning as an attributable Activity Log event', async () => {
    const actorResponse = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders(),
    });
    const actor = await actorResponse.json();

    const activityResponse = await fetch(`${origin}/api/activity-log`, {
      headers: identityHeaders(),
    });

    expect(activityResponse.status).toBe(200);
    await expect(activityResponse.json()).resolves.toEqual({
      events: [
        {
          id: expect.any(String),
          action: 'internal_user.provisioned',
          occurredAt: expect.any(String),
          actor: {
            internalUserId: actor.internalUserId,
            displayName: 'Ada Ionescu',
          },
          target: {
            type: 'internal_user',
            internalUserId: actor.internalUserId,
            displayName: 'Ada Ionescu',
          },
          metadata: { identityProvider: 'deterministic-test' },
        },
      ],
    });
  });

  it('leaves neither an Internal User nor a success event when event recording fails', async () => {
    await pool.query(`
      CREATE FUNCTION reject_activity_log_insert() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced Activity Log failure';
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_activity_log_insert
      BEFORE INSERT ON activity_log_events
      FOR EACH ROW EXECUTE FUNCTION reject_activity_log_insert();
    `);

    try {
      const response = await fetch(`${origin}/api/access/current-actor`, {
        headers: identityHeaders(),
      });

      expect(response.status).toBe(500);
      await expect(persistedRecordCounts()).resolves.toEqual({
        activityLogEvents: '0',
        internalUsers: '0',
        workspaces: '0',
      });
    } finally {
      await pool.query(`
        DROP TRIGGER reject_activity_log_insert ON activity_log_events;
        DROP FUNCTION reject_activity_log_insert();
      `);
    }
  });

  it('returns only current-Workspace events in reverse chronological order', async () => {
    const ada = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders(),
    }).then((response) => response.json());
    const bogdanHeaders = identityHeaders({
      'x-test-external-subject': 'subject-bogdan',
      'x-test-display-name': 'Bogdan Matei',
      'x-test-email': 'bogdan@example.test',
    });
    const bogdan = await fetch(`${origin}/api/access/current-actor`, {
      headers: bogdanHeaders,
    }).then((response) => response.json());

    await pool.query(
      `UPDATE activity_log_events
       SET occurred_at = CASE target_internal_user_id
         WHEN $1 THEN '2026-08-15T08:00:00.000Z'::timestamptz
         WHEN $2 THEN '2026-08-15T09:00:00.000Z'::timestamptz
       END`,
      [ada.internalUserId, bogdan.internalUserId],
    );
    await pool.query(`
      WITH hidden_workspace AS (
        INSERT INTO workspaces (singleton_key, name)
        VALUES ('hidden-workspace', 'Hidden Workspace')
        RETURNING id
      ), hidden_user AS (
        INSERT INTO internal_users (
          workspace_id, external_provider, external_subject, display_name, email
        )
        SELECT id, 'deterministic-test', 'hidden-subject', 'Hidden User', 'hidden@example.test'
        FROM hidden_workspace
        RETURNING id, workspace_id
      )
      INSERT INTO activity_log_events (
        workspace_id, actor_internal_user_id, action, target_type,
        target_internal_user_id, metadata, idempotency_key
      )
      SELECT workspace_id, id, 'internal_user.provisioned', 'internal_user', id,
        '{"identityProvider":"deterministic-test"}'::jsonb,
        'internal_user.provisioned:' || id
      FROM hidden_user
    `);

    const response = await fetch(`${origin}/api/activity-log`, {
      headers: bogdanHeaders,
    });
    const activity = await response.json();

    expect(response.status).toBe(200);
    expect(
      activity.events.map(
        (event: { target: { internalUserId: string } }) =>
          event.target.internalUserId,
      ),
    ).toEqual([bogdan.internalUserId, ada.internalUserId]);
    expect(JSON.stringify(activity)).not.toContain('Hidden');
    expect(JSON.stringify(activity)).not.toContain('hidden-subject');
  });

  it('protects Activity Log reads and exposes no mutation endpoint', async () => {
    const unauthorized = await fetch(`${origin}/api/activity-log`);
    const headers = identityHeaders();
    await fetch(`${origin}/api/access/current-actor`, { headers });

    const [updateResponse, deleteResponse] = await Promise.all([
      fetch(`${origin}/api/activity-log/not-an-event`, {
        method: 'PATCH',
        headers,
      }),
      fetch(`${origin}/api/activity-log/not-an-event`, {
        method: 'DELETE',
        headers,
      }),
    ]);

    expect(unauthorized.status).toBe(401);
    expect(updateResponse.status).toBe(404);
    expect(deleteResponse.status).toBe(404);
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
      display_name: 'Ada Ionescu',
      email: 'ada@example.test',
    });
  });

  async function persistedRecordCounts() {
    const activityLogEventCount = await pool.query<{ count: string }>(
      'SELECT count(*) FROM activity_log_events',
    );
    const userCount = await pool.query<{ count: string }>(
      'SELECT count(*) FROM internal_users',
    );
    const workspaceCount = await pool.query<{ count: string }>(
      'SELECT count(*) FROM workspaces',
    );
    return {
      activityLogEvents: activityLogEventCount.rows[0]?.count,
      internalUsers: userCount.rows[0]?.count,
      workspaces: workspaceCount.rows[0]?.count,
    };
  }
});
