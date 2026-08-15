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
    process.env.ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER = 'deterministic-test';
    process.env.ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT = 'subject-20';
    process.env.ACCESS_BOOTSTRAP_WORKSPACE_KEY = 'pilot-workspace';
    process.env.ACCESS_BOOTSTRAP_WORKSPACE_NAME = 'PRISMA Workspace';
    process.env.ACCESS_ACCEPTED_INVITATIONS_JSON = JSON.stringify([
      {
        provider: 'deterministic-test',
        subject: 'invited-subject',
        workspaceKey: 'pilot-workspace',
      },
      {
        provider: 'deterministic-test',
        subject: 'invited-to-missing-workspace',
        workspaceKey: 'missing-workspace',
      },
      {
        provider: 'deterministic-test',
        subject: 'invited-existing-subject',
        workspaceKey: 'invitation-target-workspace',
      },
    ]);
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
      'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
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
      workspaceMemberships: '0',
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
        workspaceMemberships: '0',
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
    expect(
      new Set(actors.map((actor) => actor.workspaceMembershipId)).size,
    ).toBe(1);
    expect(new Set(actors.map((actor) => actor.workspaceId)).size).toBe(1);
    expect(actors[0]).toMatchObject({
      displayName: 'Ada Ionescu',
      email: 'ada@example.test',
      workspaceName: 'PRISMA Workspace',
    });

    await expect(persistedRecordCounts()).resolves.toEqual({
      activityLogEvents: '1',
      internalUsers: '1',
      workspaceMemberships: '1',
      workspaces: '1',
    });
  });

  it('denies a verified principal that is not the configured bootstrap actor without creating state', async () => {
    const response = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders({
        'x-test-external-subject': 'uninvited-subject',
        'x-test-display-name': 'Hidden Principal',
        'x-test-email': 'hidden-principal@example.test',
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Forbidden',
      statusCode: 403,
    });
    await expect(persistedRecordCounts()).resolves.toEqual({
      activityLogEvents: '0',
      internalUsers: '0',
      workspaceMemberships: '0',
      workspaces: '0',
    });
  });

  it('admits an explicitly accepted invitation into an existing Workspace without duplicate state', async () => {
    const bootstrap = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders(),
    }).then((response) => response.json());
    const invitedHeaders = identityHeaders({
      'x-test-external-subject': 'invited-subject',
      'x-test-display-name': 'Invited User',
      'x-test-email': 'invited@example.test',
    });

    const [first, repeated] = await Promise.all([
      fetch(`${origin}/api/access/current-actor`, { headers: invitedHeaders }),
      fetch(`${origin}/api/access/current-actor`, { headers: invitedHeaders }),
    ]);
    const actors = await Promise.all([first.json(), repeated.json()]);

    expect(first.status).toBe(200);
    expect(repeated.status).toBe(200);
    expect(new Set(actors.map((actor) => actor.internalUserId)).size).toBe(1);
    expect(
      new Set(actors.map((actor) => actor.workspaceMembershipId)).size,
    ).toBe(1);
    expect(actors[0]).toMatchObject({
      workspaceId: bootstrap.workspaceId,
      workspaceName: 'PRISMA Workspace',
    });
    await expect(persistedRecordCounts()).resolves.toEqual({
      activityLogEvents: '2',
      internalUsers: '2',
      workspaceMemberships: '2',
      workspaces: '1',
    });
  });

  it('resolves an existing global Internal User through the explicitly invited Workspace Membership', async () => {
    const existing = await pool.query<{ user_id: string }>(`
      WITH existing_workspace AS (
        INSERT INTO workspaces (singleton_key, name)
        VALUES ('existing-workspace', 'Existing Workspace')
        RETURNING id
      )
      INSERT INTO internal_users (
        workspace_id, external_provider, external_subject, display_name, email
      )
      SELECT id, 'deterministic-test', 'invited-existing-subject',
        'Existing User', 'existing@example.test'
      FROM existing_workspace
      RETURNING id AS user_id
    `);
    const target = await pool.query<{ workspace_id: string }>(`
      INSERT INTO workspaces (singleton_key, name)
      VALUES ('invitation-target-workspace', 'Invitation Target Workspace')
      RETURNING id AS workspace_id
    `);

    const response = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders({
        'x-test-external-subject': 'invited-existing-subject',
        'x-test-display-name': 'Existing User',
        'x-test-email': 'existing@example.test',
      }),
    });
    const actor = await response.json();

    expect(response.status).toBe(200);
    expect(actor).toMatchObject({
      internalUserId: existing.rows[0]!.user_id,
      workspaceId: target.rows[0]!.workspace_id,
      workspaceName: 'Invitation Target Workspace',
      workspaceMembershipId: expect.any(String),
    });
    const memberships = await pool.query<{ workspace_id: string }>(
      `SELECT workspace_id FROM workspace_memberships
       WHERE internal_user_id = $1
       ORDER BY workspace_id`,
      [existing.rows[0]!.user_id],
    );
    expect(memberships.rows).toEqual(
      expect.arrayContaining([{ workspace_id: target.rows[0]!.workspace_id }]),
    );
    expect(memberships.rows).toHaveLength(2);

    await pool.query(
      `INSERT INTO activity_log_events (
        workspace_id, actor_internal_user_id, actor_workspace_membership_id,
        action, target_type, target_internal_user_id,
        target_workspace_membership_id, metadata, idempotency_key
      ) VALUES ($1, $2, $3, 'internal_user.provisioned', 'internal_user', $2, $3,
        '{"identityProvider":"deterministic-test"}'::jsonb, $4)`,
      [
        actor.workspaceId,
        actor.internalUserId,
        actor.workspaceMembershipId,
        `second-workspace-event:${actor.internalUserId}`,
      ],
    );
    const activity = await fetch(`${origin}/api/activity-log`, {
      headers: identityHeaders({
        'x-test-external-subject': 'invited-existing-subject',
        'x-test-display-name': 'Existing User',
        'x-test-email': 'existing@example.test',
      }),
    });
    expect(activity.status).toBe(200);
    await expect(activity.json()).resolves.toMatchObject({
      events: [
        {
          actor: { internalUserId: actor.internalUserId },
          target: { internalUserId: actor.internalUserId },
        },
      ],
    });
  });

  it('denies an invitation whose configured Workspace does not exist without orphan state', async () => {
    const response = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders({
        'x-test-external-subject': 'invited-to-missing-workspace',
      }),
    });

    expect(response.status).toBe(403);
    await expect(persistedRecordCounts()).resolves.toEqual({
      activityLogEvents: '0',
      internalUsers: '0',
      workspaceMemberships: '0',
      workspaces: '0',
    });
  });

  it('denies an Internal User without an active Workspace Membership without leaking Workspace metadata', async () => {
    await pool.query(`
      WITH memberless_workspace AS (
        INSERT INTO workspaces (singleton_key, name)
        VALUES ('memberless-workspace', 'Hidden Memberless Workspace')
        RETURNING id
      )
      INSERT INTO internal_users (
        workspace_id, external_provider, external_subject, display_name, email
      )
      SELECT id, 'deterministic-test', 'memberless-subject', 'Memberless User',
        'memberless@example.test'
      FROM memberless_workspace
    `);
    await pool.query(`
      DELETE FROM workspace_memberships AS membership
      USING internal_users AS internal_user
      WHERE membership.internal_user_id = internal_user.id
        AND internal_user.external_subject = 'memberless-subject'
    `);

    const response = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders({
        'x-test-external-subject': 'memberless-subject',
        'x-test-display-name': 'Changed Memberless User',
        'x-test-email': 'changed-memberless@example.test',
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Forbidden',
      statusCode: 403,
    });
    const persisted = await pool.query(
      `SELECT display_name, email FROM internal_users
       WHERE external_subject = 'memberless-subject'`,
    );
    expect(persisted.rows[0]).toEqual({
      display_name: 'Memberless User',
      email: 'memberless@example.test',
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
        workspaceMemberships: '0',
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
    await pool.query(
      `INSERT INTO internal_users (
        workspace_id, external_provider, external_subject, display_name, email
      ) VALUES ($1, 'deterministic-test', 'subject-bogdan', 'Bogdan Matei', 'bogdan@example.test')`,
      [ada.workspaceId],
    );
    await pool.query(
      `INSERT INTO activity_log_events (
        workspace_id, actor_internal_user_id, actor_workspace_membership_id,
        action, target_type, target_internal_user_id,
        target_workspace_membership_id, metadata, idempotency_key
      )
      SELECT membership.workspace_id, membership.internal_user_id, membership.id,
        'internal_user.provisioned',
        'internal_user', membership.internal_user_id, membership.id,
        '{"identityProvider":"deterministic-test"}'::jsonb,
        'internal_user.provisioned:' || membership.internal_user_id
      FROM workspace_memberships AS membership
      INNER JOIN internal_users AS internal_user
        ON internal_user.id = membership.internal_user_id
      WHERE internal_user.external_subject = 'subject-bogdan'`,
    );
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
        RETURNING id
      )
      SELECT id FROM hidden_user
    `);
    await pool.query(`
      INSERT INTO activity_log_events (
        workspace_id, actor_internal_user_id, actor_workspace_membership_id,
        action, target_type, target_internal_user_id,
        target_workspace_membership_id, metadata, idempotency_key
      )
      SELECT membership.workspace_id, membership.internal_user_id, membership.id,
        'internal_user.provisioned',
        'internal_user', membership.internal_user_id, membership.id,
        '{"identityProvider":"deterministic-test"}'::jsonb,
        'internal_user.provisioned:' || membership.internal_user_id
      FROM workspace_memberships AS membership
      INNER JOIN internal_users AS internal_user
        ON internal_user.id = membership.internal_user_id
      WHERE internal_user.external_subject = 'hidden-subject'
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

  it('rejects Activity Log associations whose actor or target belongs to another Workspace', async () => {
    const visibleActor = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders(),
    }).then((response) => response.json());
    await pool.query(`
      WITH hidden_workspace AS (
        INSERT INTO workspaces (singleton_key, name)
        VALUES ('cross-workspace', 'Cross Workspace')
        RETURNING id
      )
      INSERT INTO internal_users (
        workspace_id, external_provider, external_subject, display_name, email
      )
      SELECT id, 'deterministic-test', 'cross-subject', 'Cross User', 'cross@example.test'
      FROM hidden_workspace
    `);
    const hidden = await pool.query<{
      workspace_id: string;
      user_id: string;
      membership_id: string;
    }>(`
      SELECT membership.workspace_id,
        membership.internal_user_id AS user_id,
        membership.id AS membership_id
      FROM workspace_memberships AS membership
      INNER JOIN internal_users AS internal_user
        ON internal_user.id = membership.internal_user_id
      WHERE internal_user.external_subject = 'cross-subject'
    `);
    const hiddenUser = hidden.rows[0]!;

    await expect(
      pool.query(
        `INSERT INTO activity_log_events (
          workspace_id, actor_internal_user_id, actor_workspace_membership_id,
          action, target_type, target_internal_user_id,
          target_workspace_membership_id, metadata, idempotency_key
        ) VALUES ($1, $2, $3, 'internal_user.provisioned', 'internal_user', $4, $5,
          '{"identityProvider":"deterministic-test"}'::jsonb, 'cross-actor')`,
        [
          visibleActor.workspaceId,
          hiddenUser.user_id,
          hiddenUser.membership_id,
          visibleActor.internalUserId,
          visibleActor.workspaceMembershipId,
        ],
      ),
    ).rejects.toMatchObject({ code: '23503' });

    await expect(
      pool.query(
        `INSERT INTO activity_log_events (
          workspace_id, actor_internal_user_id, actor_workspace_membership_id,
          action, target_type, target_internal_user_id,
          target_workspace_membership_id, metadata, idempotency_key
        ) VALUES ($1, $2, $3, 'internal_user.provisioned', 'internal_user', $4, $5,
          '{"identityProvider":"deterministic-test"}'::jsonb, 'cross-target')`,
        [
          visibleActor.workspaceId,
          visibleActor.internalUserId,
          visibleActor.workspaceMembershipId,
          hiddenUser.user_id,
          hiddenUser.membership_id,
        ],
      ),
    ).rejects.toMatchObject({ code: '23503' });

    const response = await fetch(`${origin}/api/activity-log`, {
      headers: identityHeaders(),
    });
    const activity = await response.json();
    expect(activity.events).toHaveLength(1);
    expect(JSON.stringify(activity)).not.toContain(hiddenUser.user_id);
  });

  it('rejects a legacy Activity Log insert when no Workspace Membership can be resolved', async () => {
    const actor = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders(),
    }).then((response) => response.json());
    await pool.query(
      'DELETE FROM activity_log_events WHERE actor_internal_user_id = $1',
      [actor.internalUserId],
    );
    await pool.query(
      'DELETE FROM workspace_permission_grants WHERE workspace_membership_id = $1',
      [actor.workspaceMembershipId],
    );
    await pool.query('DELETE FROM workspace_memberships WHERE id = $1', [
      actor.workspaceMembershipId,
    ]);

    await expect(
      pool.query(
        `INSERT INTO activity_log_events (
          workspace_id, actor_internal_user_id, action, target_type,
          target_internal_user_id, metadata, idempotency_key
        ) VALUES ($1, $2, 'internal_user.provisioned', 'internal_user', $2,
          '{"identityProvider":"deterministic-test"}'::jsonb, 'missing-membership')`,
        [actor.workspaceId, actor.internalUserId],
      ),
    ).rejects.toMatchObject({ code: '23503' });
    const events = await pool.query(
      `SELECT id FROM activity_log_events
       WHERE idempotency_key = 'missing-membership'`,
    );
    expect(events.rows).toHaveLength(0);
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
      workspaceMembershipId: first.workspaceMembershipId,
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

  it('returns the same safe 403 for an inactive Workspace Membership', async () => {
    const actor = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders(),
    }).then((response) => response.json());
    await pool.query(
      `UPDATE workspace_memberships SET status = 'inactive'
       WHERE id = $1`,
      [actor.workspaceMembershipId],
    );

    const response = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders({
        'x-test-display-name': 'Denied membership profile change',
        'x-test-email': 'denied-membership@example.test',
      }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Forbidden',
      statusCode: 403,
    });
    expect(JSON.stringify(await persistedRecordCounts())).not.toContain(
      actor.workspaceId,
    );
  });

  it('server-selects one active membership without assuming the Internal User is global to one Workspace', async () => {
    const first = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders(),
    }).then((response) => response.json());
    await pool.query(
      `WITH second_workspace AS (
        INSERT INTO workspaces (singleton_key, name)
        VALUES ('second-workspace', 'Second Workspace')
        RETURNING id
      )
      INSERT INTO workspace_memberships (
        workspace_id, internal_user_id, created_at
      )
      SELECT id, $1, now() + interval '1 second'
      FROM second_workspace`,
      [first.internalUserId],
    );

    const repeated = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders(),
    });

    expect(repeated.status).toBe(200);
    await expect(repeated.json()).resolves.toMatchObject({
      internalUserId: first.internalUserId,
      workspaceMembershipId: first.workspaceMembershipId,
      workspaceId: first.workspaceId,
      workspaceName: 'PRISMA Workspace',
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
    const workspaceMembershipCount = await pool.query<{ count: string }>(
      'SELECT count(*) FROM workspace_memberships',
    );
    return {
      activityLogEvents: activityLogEventCount.rows[0]?.count,
      internalUsers: userCount.rows[0]?.count,
      workspaceMemberships: workspaceMembershipCount.rows[0]?.count,
      workspaces: workspaceCount.rows[0]?.count,
    };
  }
});
