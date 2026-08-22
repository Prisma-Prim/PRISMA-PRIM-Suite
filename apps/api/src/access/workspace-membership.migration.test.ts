import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  Controller,
  Get,
  Inject,
  type INestApplication,
  Req,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { DATABASE } from '../database/database.constants.js';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (process.env.REQUIRE_ACCESS_POSTGRES === 'true' && !databaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for the destructive Workspace Membership migration suite.',
  );
}
const describeWithPostgres = databaseUrl ? describe : describe.skip;

const LEGACY_POOL = Symbol('LEGACY_POOL');

interface LegacyRequest {
  header(name: string): string | undefined;
}

@Controller('access')
class LegacyAccessController {
  constructor(@Inject(LEGACY_POOL) private readonly pool: Pool) {}

  @Get('current-actor')
  currentActor(@Req() request: LegacyRequest) {
    return legacyResolveActor(this.pool, request);
  }
}

@Controller('activity-log')
class LegacyActivityLogController {
  constructor(@Inject(LEGACY_POOL) private readonly pool: Pool) {}

  @Get()
  async activityLog(@Req() request: LegacyRequest) {
    const actor = await legacyResolveActor(this.pool, request);
    const result = await this.pool.query(
      `SELECT event.id, event.action, event.occurred_at,
        actor.id AS actor_id, actor.display_name AS actor_name,
        target.id AS target_id, target.display_name AS target_name,
        event.metadata
       FROM activity_log_events AS event
       INNER JOIN internal_users AS actor
         ON actor.workspace_id = event.workspace_id
         AND actor.id = event.actor_internal_user_id
       INNER JOIN internal_users AS target
         ON target.workspace_id = event.workspace_id
         AND target.id = event.target_internal_user_id
       WHERE event.workspace_id = $1
       ORDER BY event.occurred_at DESC, event.id DESC`,
      [actor.workspaceId],
    );
    return {
      events: result.rows.map((event) => ({
        id: event.id,
        action: event.action,
        occurredAt: event.occurred_at.toISOString(),
        actor: {
          internalUserId: event.actor_id,
          displayName: event.actor_name,
        },
        target: {
          type: 'internal_user',
          internalUserId: event.target_id,
          displayName: event.target_name,
        },
        metadata: event.metadata,
      })),
    };
  }
}

describeWithPostgres('Workspace Membership migration', () => {
  let isolatedDatabase: IsolatedPostgresTestDatabase;
  let migrationPool: Pool;
  let targetUrl: string;

  beforeAll(async () => {
    isolatedDatabase = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl!,
      namePrefix: 'prisma_prim_membership',
    });
    migrationPool = isolatedDatabase.targetPool;
    targetUrl = isolatedDatabase.targetUrl;
  });

  afterAll(async () => {
    await isolatedDatabase?.close();
  });

  it('keeps legacy and current Access and Activity Log routes compatible through expand/backfill', async () => {
    await applyMigration('0000_ordinary_stephen_strange.sql');
    await applyMigration('0001_fat_kylun.sql');

    const workspaceId = randomUUID();
    const internalUserId = randomUUID();
    const inactiveInternalUserId = randomUUID();
    const eventId = randomUUID();
    await seedLegacyActor({ workspaceId, internalUserId, eventId });
    await migrationPool.query(
      `INSERT INTO internal_users (
         id, workspace_id, external_provider, external_subject,
         display_name, email, status
       ) VALUES ($1, $2, 'deterministic-test', 'inactive-migrated-subject',
         'Inactive Migrated User', 'inactive-migrated@example.test', 'inactive')`,
      [inactiveInternalUserId, workspaceId],
    );
    const legacyBefore = await startLegacyApp();
    const beforeActor = await fetchActor(legacyBefore.origin, headers());
    const beforeActivity = await fetchActivity(legacyBefore.origin, headers());
    await legacyBefore.close();

    await applyMigration('0002_workspace-membership-authority.sql');

    const legacyAfter = await startLegacyApp();
    const afterActor = await fetchActor(legacyAfter.origin, headers());
    const afterActivity = await fetchActivity(legacyAfter.origin, headers());
    const legacyCreated = await fetchActor(
      legacyAfter.origin,
      headers({
        'x-test-external-subject': 'legacy-created-after-expand',
        'x-test-display-name': 'Legacy Created',
        'x-test-email': 'legacy-created@example.test',
      }),
    );
    const legacyAfterWriteActivity = await fetchActivity(
      legacyAfter.origin,
      headers(),
    );

    await applyMigration('0003_true_frank_castle.sql');
    await applyMigration('0004_daily_dazzler.sql');

    const legacyAfterCompanyMigrationsActor = await fetchActor(
      legacyAfter.origin,
      headers(),
    );
    const legacyAfterCompanyMigrationsActivity = await fetchActivity(
      legacyAfter.origin,
      headers(),
    );
    const legacyCreatedAfterCompanyMigrations = await fetchActor(
      legacyAfter.origin,
      headers({
        'x-test-external-subject': 'legacy-created-after-company-migrations',
        'x-test-display-name': 'Legacy Created After Company Migrations',
        'x-test-email': 'legacy-created-after-company-migrations@example.test',
      }),
    );
    const legacyAfterCompanyMigrationsWriteActivity = await fetchActivity(
      legacyAfter.origin,
      headers(),
    );
    await legacyAfter.close();

    expect(afterActor).toEqual(beforeActor);
    expect(afterActivity).toEqual(beforeActivity);
    expect(afterActor).toMatchObject({ internalUserId, workspaceId });
    expect(afterActivity.events[0]).toMatchObject({ id: eventId });
    expect(legacyAfterCompanyMigrationsActor).toEqual(afterActor);
    expect(legacyAfterCompanyMigrationsActivity).toEqual(
      legacyAfterWriteActivity,
    );
    expect(legacyCreatedAfterCompanyMigrations).toMatchObject({
      internalUserId: expect.any(String),
      workspaceId,
    });
    expect(legacyAfterCompanyMigrationsWriteActivity.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'internal_user.provisioned',
          actor: {
            internalUserId: legacyCreatedAfterCompanyMigrations.internalUserId,
            displayName: 'Legacy Created After Company Migrations',
          },
          target: {
            type: 'internal_user',
            internalUserId: legacyCreatedAfterCompanyMigrations.internalUserId,
            displayName: 'Legacy Created After Company Migrations',
          },
        }),
      ]),
    );

    await applyMigration('0005_modern_hammerhead.sql');
    const bootstrapOwnerMembership = await migrationPool.query<{ id: string }>(
      `SELECT id FROM workspace_memberships WHERE internal_user_id = $1`,
      [internalUserId],
    );
    await migrationPool.query(
      `INSERT INTO workspace_permission_grants (
         workspace_id, workspace_membership_id, permission
       ) VALUES ($1, $2, 'company.manage')`,
      [workspaceId, bootstrapOwnerMembership.rows[0]!.id],
    );
    await applyMigration('0006_sudden_dark_phoenix.sql');
    await applyMigration('0007_wakeful_moonstone.sql');
    await applyMigration('0008_backfill_company_assignment_authority.sql');
    await applyMigration('0008_backfill_company_assignment_authority.sql');
    await applyMigration('0009_open_night_thrasher.sql');

    const upgradedOwnerPermissions = await migrationPool.query<{
      permission: string;
    }>(
      `SELECT permission::text AS permission
       FROM workspace_permission_grants
       WHERE workspace_membership_id = $1
       ORDER BY permission::text`,
      [bootstrapOwnerMembership.rows[0]!.id],
    );
    expect(upgradedOwnerPermissions.rows).toEqual([
      { permission: 'company.assignment.manage' },
      { permission: 'company.manage' },
    ]);

    const current = await startCurrentApp();
    const currentActor = await fetchActor(current.origin, headers());
    const currentActivity = await fetchActivity(current.origin, headers());
    const currentLegacyCreated = await fetchActor(
      current.origin,
      headers({
        'x-test-external-subject': 'legacy-created-after-expand',
        'x-test-display-name': 'Legacy Created',
        'x-test-email': 'legacy-created@example.test',
      }),
    );
    await current.close();

    expect(currentActor).toMatchObject(beforeActor);
    expect(currentActor.workspaceMembershipId).toEqual(expect.any(String));
    expect(currentActivity).toEqual(legacyAfterCompanyMigrationsWriteActivity);
    expect(currentLegacyCreated).toMatchObject({
      internalUserId: legacyCreated.internalUserId,
      workspaceId: legacyCreated.workspaceId,
      workspaceMembershipId: expect.any(String),
    });

    const preserved = await migrationPool.query<{
      workspace_id: string;
      internal_user_id: string;
      event_id: string;
      actor_membership_id: string;
      target_membership_id: string;
    }>(
      `SELECT internal_user.workspace_id, membership.internal_user_id,
        event.id AS event_id,
        event.actor_workspace_membership_id AS actor_membership_id,
        event.target_workspace_membership_id AS target_membership_id
      FROM internal_users AS internal_user
      INNER JOIN workspace_memberships AS membership
        ON membership.workspace_id = internal_user.workspace_id
        AND membership.internal_user_id = internal_user.id
      INNER JOIN activity_log_events AS event
        ON event.workspace_id = membership.workspace_id
        AND event.actor_internal_user_id = membership.internal_user_id
       WHERE internal_user.id = $1`,
      [internalUserId],
    );
    expect(preserved.rows).toEqual([
      expect.objectContaining({
        workspace_id: workspaceId,
        internal_user_id: internalUserId,
        event_id: eventId,
      }),
    ]);
    expect(preserved.rows[0]!.actor_membership_id).toBe(
      preserved.rows[0]!.target_membership_id,
    );
    const inactiveMembership = await migrationPool.query<{ status: string }>(
      `SELECT status FROM workspace_memberships
       WHERE internal_user_id = $1`,
      [inactiveInternalUserId],
    );
    expect(inactiveMembership.rows[0]).toEqual({ status: 'inactive' });
    const counts = await migrationPool.query<{ users: string; events: string }>(
      `SELECT
        (SELECT count(*) FROM internal_users) AS users,
        (SELECT count(*) FROM activity_log_events) AS events`,
    );
    expect(counts.rows[0]).toEqual({ users: '4', events: '3' });
  });

  async function startLegacyApp() {
    const moduleRef = await Test.createTestingModule({
      controllers: [LegacyAccessController, LegacyActivityLogController],
      providers: [{ provide: LEGACY_POOL, useValue: migrationPool }],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    return applicationHandle(app);
  }

  async function startCurrentApp() {
    process.env.NODE_ENV = 'test';
    process.env.ACCESS_IDENTITY_MODE = 'test';
    process.env.DATABASE_URL = targetUrl;
    delete process.env.ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER;
    delete process.env.ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT;
    delete process.env.ACCESS_BOOTSTRAP_WORKSPACE_KEY;
    delete process.env.ACCESS_BOOTSTRAP_WORKSPACE_NAME;
    delete process.env.ACCESS_ACCEPTED_INVITATIONS_JSON;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    const applicationPool = app.get(DATABASE).$client as Pool;
    const handle = await applicationHandle(app);
    return {
      origin: handle.origin,
      async close() {
        await handle.close();
        await applicationPool.end();
      },
    };
  }

  async function applicationHandle(app: INestApplication) {
    return {
      origin: await app.getUrl(),
      async close() {
        await app.close();
      },
    };
  }

  async function applyMigration(filename: string): Promise<void> {
    const migration = await readFile(`./drizzle/${filename}`, 'utf8');
    for (const statement of migration.split('--> statement-breakpoint')) {
      if (statement.trim()) await migrationPool.query(statement);
    }
  }

  async function seedLegacyActor(ids: {
    workspaceId: string;
    internalUserId: string;
    eventId: string;
  }) {
    await migrationPool.query(
      `INSERT INTO workspaces (id, singleton_key, name)
       VALUES ($1, 'migrated-workspace', 'Migrated Workspace')`,
      [ids.workspaceId],
    );
    await migrationPool.query(
      `INSERT INTO internal_users (
         id, workspace_id, external_provider, external_subject, display_name, email
       ) VALUES ($1, $2, 'deterministic-test', 'migrated-subject',
         'Migrated User', 'migrated@example.test')`,
      [ids.internalUserId, ids.workspaceId],
    );
    await migrationPool.query(
      `INSERT INTO activity_log_events (
         id, workspace_id, actor_internal_user_id, action, target_type,
         target_internal_user_id, metadata, idempotency_key
       ) VALUES ($1, $2, $3, 'internal_user.provisioned', 'internal_user',
         $3, '{"identityProvider":"deterministic-test"}'::jsonb, $4)`,
      [
        ids.eventId,
        ids.workspaceId,
        ids.internalUserId,
        `internal_user.provisioned:${ids.internalUserId}`,
      ],
    );
  }
});

async function legacyResolveActor(pool: Pool, request: LegacyRequest) {
  const provider = requiredHeader(request, 'x-test-external-provider');
  const subject = requiredHeader(request, 'x-test-external-subject');
  const displayName = requiredHeader(request, 'x-test-display-name');
  const email = requiredHeader(request, 'x-test-email');
  const workspace = await pool.query<{ id: string; name: string }>(
    `INSERT INTO workspaces (singleton_key, name)
     VALUES ('migrated-workspace', 'Migrated Workspace')
     ON CONFLICT (singleton_key) DO UPDATE SET name = excluded.name
     RETURNING id, name`,
  );
  const created = await pool.query<{ id: string }>(
    `INSERT INTO internal_users (
       workspace_id, external_provider, external_subject, display_name, email
     ) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (external_provider, external_subject) DO NOTHING
     RETURNING id`,
    [workspace.rows[0]!.id, provider, subject, displayName, email],
  );
  const internalUser = await pool.query<{
    id: string;
    workspace_id: string;
    display_name: string;
    email: string;
  }>(
    `UPDATE internal_users SET display_name = $3, email = $4, updated_at = now()
     WHERE external_provider = $1 AND external_subject = $2
     RETURNING id, workspace_id, display_name, email`,
    [provider, subject, displayName, email],
  );
  const actor = internalUser.rows[0]!;
  if (created.rowCount) {
    await pool.query(
      `INSERT INTO activity_log_events (
         workspace_id, actor_internal_user_id, action, target_type,
         target_internal_user_id, metadata, idempotency_key
       ) VALUES ($1, $2, 'internal_user.provisioned', 'internal_user', $2,
         jsonb_build_object('identityProvider', $3::text), $4)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        actor.workspace_id,
        actor.id,
        provider,
        `internal_user.provisioned:${actor.id}`,
      ],
    );
  }
  return {
    internalUserId: actor.id,
    workspaceId: actor.workspace_id,
    workspaceName: workspace.rows[0]!.name,
    displayName: actor.display_name,
    email: actor.email,
    active: true,
  };
}

function requiredHeader(request: LegacyRequest, name: string): string {
  const value = request.header(name)?.trim();
  if (!value) throw new Error(`Missing test header ${name}`);
  return value;
}

function headers(overrides: Record<string, string> = {}) {
  return {
    'x-test-external-provider': 'deterministic-test',
    'x-test-external-subject': 'migrated-subject',
    'x-test-display-name': 'Migrated User',
    'x-test-email': 'migrated@example.test',
    ...overrides,
  };
}

async function fetchActor(
  origin: string,
  requestHeaders: Record<string, string>,
) {
  const response = await fetch(`${origin}/api/access/current-actor`, {
    headers: requestHeaders,
  });
  expect(response.status).toBe(200);
  return response.json();
}

async function fetchActivity(
  origin: string,
  requestHeaders: Record<string, string>,
) {
  const response = await fetch(`${origin}/api/activity-log`, {
    headers: requestHeaders,
  });
  expect(response.status).toBe(200);
  return response.json();
}
