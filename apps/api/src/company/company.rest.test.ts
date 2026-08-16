import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { DATABASE } from '../database/database.constants.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (process.env.REQUIRE_COMPANY_POSTGRES === 'true' && !databaseUrl) {
  throw new Error(
    'TEST_DATABASE_URL is required for the destructive PostgreSQL Company REST suite.',
  );
}
if (databaseUrl) assertSafeTestDatabase(databaseUrl);
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres('Company REST API', () => {
  let app: INestApplication;
  let origin: string;
  let pool: Pool;
  let applicationPool: Pool;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ACCESS_IDENTITY_MODE = 'test';
    process.env.ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER = 'deterministic-test';
    process.env.ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT = 'workspace-owner';
    process.env.ACCESS_BOOTSTRAP_WORKSPACE_KEY = 'company-workspace';
    process.env.ACCESS_BOOTSTRAP_WORKSPACE_NAME = 'Company Workspace';
    process.env.ACCESS_ACCEPTED_INVITATIONS_JSON = JSON.stringify([
      {
        provider: 'deterministic-test',
        subject: 'workspace-member',
        workspaceKey: 'company-workspace',
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
    await pool.query(
      'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await pool?.end();
    await app?.close();
    await applicationPool?.end();
  });

  it('lets the authorized Workspace owner register and read one active provider Company', async () => {
    const createResponse = await fetch(`${origin}/api/companies`, {
      method: 'POST',
      headers: {
        ...identityHeaders('workspace-owner', 'Ada Ionescu'),
        'content-type': 'application/json',
        'idempotency-key': 'register-north-star-consulting',
      },
      body: JSON.stringify({ displayName: 'North Star Consulting' }),
    });
    const created = await createResponse.json();

    expect(createResponse.status).toBe(201);
    expect(created).toEqual({
      id: expect.any(String),
      workspaceId: expect.any(String),
      displayName: 'North Star Consulting',
      status: 'active',
      createdAt: expect.any(String),
      createdByInternalUserId: expect.any(String),
    });

    const readResponse = await fetch(`${origin}/api/companies/${created.id}`, {
      headers: identityHeaders('workspace-owner', 'Ada Ionescu'),
    });

    expect(readResponse.status).toBe(200);
    await expect(readResponse.json()).resolves.toEqual(created);
  });

  it('lets the Workspace owner select one active Company from the visible Company query', async () => {
    const northStar = await registerCompany({
      subject: 'workspace-owner',
      displayName: 'North Star Consulting',
      idempotencyKey: 'register-visible-north-star',
    });
    const atlas = await registerCompany({
      subject: 'workspace-owner',
      displayName: 'Atlas Assurance',
      idempotencyKey: 'register-visible-atlas',
    });

    const visibleResponse = await fetch(`${origin}/api/companies`, {
      headers: identityHeaders('workspace-owner', 'Ada Ionescu'),
    });

    expect(visibleResponse.status).toBe(200);
    await expect(visibleResponse.json()).resolves.toEqual([atlas, northStar]);

    const contextResponse = await fetch(`${origin}/api/access/current-actor`, {
      headers: {
        ...identityHeaders('workspace-owner', 'Ada Ionescu'),
        'x-company-context-id': northStar.id,
      },
    });

    expect(contextResponse.status).toBe(200);
    await expect(contextResponse.json()).resolves.toMatchObject({
      workspaceName: 'Company Workspace',
      activeCompany: {
        id: northStar.id,
        displayName: 'North Star Consulting',
      },
    });

    const otherCompanyResponse = await fetch(
      `${origin}/api/companies/${atlas.id}`,
      {
        headers: {
          ...identityHeaders('workspace-owner', 'Ada Ionescu'),
          'x-company-context-id': northStar.id,
        },
      },
    );

    expect(otherCompanyResponse.status).toBe(200);
    await expect(otherCompanyResponse.json()).resolves.toEqual(atlas);
  });

  it('uses one metadata-safe denial for invalid, inactive, foreign, and unauthorized Company selections', async () => {
    const activeCompany = await registerCompany({
      subject: 'workspace-owner',
      displayName: 'Visible Provider',
      idempotencyKey: 'register-visible-provider-for-denials',
    });
    const inactiveCompany = await registerCompany({
      subject: 'workspace-owner',
      displayName: 'Inactive Provider',
      idempotencyKey: 'register-inactive-provider-for-denials',
    });
    await pool.query(`UPDATE companies SET status = 'inactive' WHERE id = $1`, [
      inactiveCompany.id,
    ]);

    const foreignCompanyId = '00000000-0000-4000-8000-000000000067';
    await pool.query(`
      INSERT INTO workspaces (id, singleton_key, name)
      VALUES ('00000000-0000-4000-8000-000000000061', 'foreign-context-workspace', 'Foreign Context Workspace');
      INSERT INTO internal_users (
        id, workspace_id, external_provider, external_subject, display_name, email
      ) VALUES (
        '00000000-0000-4000-8000-000000000062',
        '00000000-0000-4000-8000-000000000061',
        'deterministic-test', 'foreign-context-owner', 'Foreign Owner',
        'foreign-context-owner@example.test'
      );
      INSERT INTO companies (
        id, workspace_id, display_name, created_by_internal_user_id,
        created_by_workspace_membership_id, registration_idempotency_key
      ) VALUES (
        '${foreignCompanyId}',
        '00000000-0000-4000-8000-000000000061',
        'Foreign Provider',
        '00000000-0000-4000-8000-000000000062',
        (SELECT id FROM workspace_memberships
          WHERE workspace_id = '00000000-0000-4000-8000-000000000061'
            AND internal_user_id = '00000000-0000-4000-8000-000000000062'),
        'register-foreign-context-provider'
      )
    `);

    const ownerHeaders = identityHeaders('workspace-owner', 'Ada Ionescu');
    const attempts = [
      { selection: '', headers: ownerHeaders },
      { selection: 'not-a-company-id', headers: ownerHeaders },
      {
        selection: '00000000-0000-4000-8000-000000000099',
        headers: ownerHeaders,
      },
      { selection: inactiveCompany.id, headers: ownerHeaders },
      { selection: foreignCompanyId, headers: ownerHeaders },
      {
        selection: activeCompany.id,
        headers: identityHeaders('workspace-member', 'Mara Ionescu'),
      },
    ];

    for (const attempt of attempts) {
      const response = await fetch(`${origin}/api/access/current-actor`, {
        headers: {
          ...attempt.headers,
          'x-company-context-id': attempt.selection,
        },
      });

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        message: 'Forbidden',
        statusCode: 403,
      });
    }

    const visibleResponse = await fetch(`${origin}/api/companies`, {
      headers: ownerHeaders,
    });
    expect(visibleResponse.status).toBe(200);
    await expect(visibleResponse.json()).resolves.toEqual([activeCompany]);
  });

  it('revalidates a stale Company context on the next protected request without recording navigation activity', async () => {
    const selectedCompany = await registerCompany({
      subject: 'workspace-owner',
      displayName: 'Selected Provider',
      idempotencyKey: 'register-selected-provider-for-stale-context',
    });
    const contextHeaders = {
      ...identityHeaders('workspace-owner', 'Ada Ionescu'),
      'x-company-context-id': selectedCompany.id,
    };

    const selectedResponse = await fetch(`${origin}/api/access/current-actor`, {
      headers: contextHeaders,
    });
    expect(selectedResponse.status).toBe(200);

    const activityBefore = await pool.query<{ count: string }>(
      'SELECT count(*) FROM activity_log_events',
    );
    await pool.query(`UPDATE companies SET status = 'inactive' WHERE id = $1`, [
      selectedCompany.id,
    ]);

    const staleProtectedResponses = await Promise.all([
      fetch(`${origin}/api/access/current-actor`, { headers: contextHeaders }),
      fetch(`${origin}/api/activity-log`, { headers: contextHeaders }),
      fetch(`${origin}/api/companies`, { headers: contextHeaders }),
      fetch(`${origin}/api/companies`, {
        method: 'POST',
        headers: {
          ...contextHeaders,
          'content-type': 'application/json',
          'idempotency-key': 'stale-context-registration-attempt',
        },
        body: JSON.stringify({ displayName: 'Must Not Persist' }),
      }),
      fetch(`${origin}/api/companies/${selectedCompany.id}`, {
        headers: contextHeaders,
      }),
    ]);
    const visibleResponse = await fetch(`${origin}/api/companies`, {
      headers: identityHeaders('workspace-owner', 'Ada Ionescu'),
    });
    const activityAfter = await pool.query<{ count: string }>(
      'SELECT count(*) FROM activity_log_events',
    );

    for (const response of staleProtectedResponses) {
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        message: 'Forbidden',
        statusCode: 403,
      });
    }
    expect(visibleResponse.status).toBe(200);
    await expect(visibleResponse.json()).resolves.toEqual([]);
    expect(activityAfter.rows[0]).toEqual(activityBefore.rows[0]);
  });

  it('rejects a malformed Company identifier at the HTTP boundary', async () => {
    const response = await fetch(`${origin}/api/companies/not-a-uuid`, {
      headers: identityHeaders('workspace-owner', 'Ada Ionescu'),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'Validation failed (uuid is expected)',
      error: 'Bad Request',
      statusCode: 400,
    });
  });

  it('denies unauthenticated Company registration and reads', async () => {
    const createResponse = await fetch(`${origin}/api/companies`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': 'unauthenticated-company-registration',
      },
      body: JSON.stringify({ displayName: 'Unauthenticated Provider' }),
    });
    const readResponse = await fetch(
      `${origin}/api/companies/00000000-0000-4000-8000-000000000010`,
    );
    const listResponse = await fetch(`${origin}/api/companies`);

    expect(createResponse.status).toBe(401);
    expect(readResponse.status).toBe(401);
    expect(listResponse.status).toBe(401);
    await expect(createResponse.json()).resolves.toEqual({
      message: 'Unauthorized',
      statusCode: 401,
    });
    await expect(readResponse.json()).resolves.toEqual({
      message: 'Unauthorized',
      statusCode: 401,
    });
    await expect(listResponse.json()).resolves.toEqual({
      message: 'Unauthorized',
      statusCode: 401,
    });
    await expectPersistenceCounts(0, 0);
  });

  it('rejects an omitted Company display name without partial persistence', async () => {
    const response = await fetch(`${origin}/api/companies`, {
      method: 'POST',
      headers: {
        ...identityHeaders('workspace-owner', 'Ada Ionescu'),
        'content-type': 'application/json',
        'idempotency-key': 'omitted-company-name',
      },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'Company display name is required.',
      error: 'Bad Request',
      statusCode: 400,
    });
    await expectPersistenceCounts(0, 0);
  });

  it('records one attributable Company registration event across a retried command', async () => {
    const request = {
      method: 'POST',
      headers: {
        ...identityHeaders('workspace-owner', 'Ada Ionescu'),
        'content-type': 'application/json',
        'idempotency-key': 'retry-company-registration',
      },
      body: JSON.stringify({ displayName: 'Retryable Provider' }),
    };

    const firstResponse = await fetch(`${origin}/api/companies`, request);
    const retryResponse = await fetch(`${origin}/api/companies`, request);
    const first = await firstResponse.json();
    const retry = await retryResponse.json();

    expect(firstResponse.status).toBe(201);
    expect(retryResponse.status).toBe(201);
    expect(retry).toEqual(first);

    const activityResponse = await fetch(`${origin}/api/activity-log`, {
      headers: identityHeaders('workspace-owner', 'Ada Ionescu'),
    });
    expect(activityResponse.status).toBe(200);
    await expect(activityResponse.json()).resolves.toMatchObject({
      events: [
        {
          action: 'company.registered',
          actor: {
            internalUserId: first.createdByInternalUserId,
            displayName: 'Ada Ionescu',
          },
          target: {
            type: 'company',
            companyId: first.id,
            displayName: 'Retryable Provider',
          },
          metadata: {},
        },
        { action: 'internal_user.provisioned' },
      ],
    });
    await expectPersistenceCounts(1, 1);
  });

  it('denies Company registration and read without permission without leaking record metadata', async () => {
    const created = await registerCompany({
      subject: 'workspace-owner',
      displayName: 'Visible only to owner',
      idempotencyKey: 'owner-company',
    });
    const deniedHeaders = identityHeaders(
      'workspace-member',
      'Workspace Member',
    );

    const createResponse = await fetch(`${origin}/api/companies`, {
      method: 'POST',
      headers: {
        ...deniedHeaders,
        'content-type': 'application/json',
        'idempotency-key': 'denied-company',
      },
      body: JSON.stringify({ displayName: 'Denied Provider' }),
    });
    const readResponse = await fetch(`${origin}/api/companies/${created.id}`, {
      headers: deniedHeaders,
    });
    const listResponse = await fetch(`${origin}/api/companies`, {
      headers: deniedHeaders,
    });

    expect(createResponse.status).toBe(403);
    expect(readResponse.status).toBe(403);
    expect(listResponse.status).toBe(200);
    await expect(createResponse.json()).resolves.toEqual({
      message: 'Forbidden',
      statusCode: 403,
    });
    await expect(readResponse.json()).resolves.toEqual({
      message: 'Forbidden',
      statusCode: 403,
    });
    await expect(listResponse.json()).resolves.toEqual([]);
    const responseText = JSON.stringify([
      await fetch(`${origin}/api/companies`, {
        method: 'POST',
        headers: {
          ...deniedHeaders,
          'content-type': 'application/json',
          'idempotency-key': 'second-denied-company',
        },
        body: JSON.stringify({ displayName: 'Second Denied Provider' }),
      }).then((response) => response.json()),
    ]);
    expect(responseText).not.toContain(created.id);
    expect(responseText).not.toContain(created.displayName);

    const deniedActivity = await fetch(`${origin}/api/activity-log`, {
      headers: deniedHeaders,
    });
    expect(deniedActivity.status).toBe(200);
    const deniedActivityText = await deniedActivity.text();
    expect(deniedActivityText).not.toContain('company.registered');
    expect(deniedActivityText).not.toContain(created.id);
    expect(deniedActivityText).not.toContain(created.displayName);

    const persisted = await pool.query<{ count: string }>(
      'SELECT count(*) FROM companies',
    );
    expect(persisted.rows[0]).toEqual({ count: '1' });
  });

  it('uses only the actor Workspace when a request supplies another Workspace id', async () => {
    const hidden = await pool.query<{ id: string }>(`
      INSERT INTO workspaces (singleton_key, name)
      VALUES ('hidden-company-workspace', 'Hidden Company Workspace')
      RETURNING id
    `);

    const response = await fetch(`${origin}/api/companies`, {
      method: 'POST',
      headers: {
        ...identityHeaders('workspace-owner', 'Ada Ionescu'),
        'content-type': 'application/json',
        'idempotency-key': 'workspace-injection-attempt',
      },
      body: JSON.stringify({
        displayName: 'Actor Scoped Provider',
        workspaceId: hidden.rows[0]!.id,
      }),
    });
    const company = await response.json();

    expect(response.status).toBe(201);
    expect(company.workspaceId).not.toBe(hidden.rows[0]!.id);
    const persisted = await pool.query<{
      workspace_id: string;
      hidden_count: string;
    }>(
      `SELECT company.workspace_id,
        (SELECT count(*) FROM companies WHERE workspace_id = $1) AS hidden_count
       FROM companies AS company WHERE company.id = $2`,
      [hidden.rows[0]!.id, company.id],
    );
    expect(persisted.rows[0]).toEqual({
      workspace_id: company.workspaceId,
      hidden_count: '0',
    });
  });

  it('keeps Company identity independent from a non-unique display name', async () => {
    const [first, second] = await Promise.all([
      registerCompany({
        subject: 'workspace-owner',
        displayName: 'Shared Display Name',
        idempotencyKey: 'same-name-one',
      }),
      registerCompany({
        subject: 'workspace-owner',
        displayName: 'Shared Display Name',
        idempotencyKey: 'same-name-two',
      }),
    ]);

    expect(first.id).not.toBe(second.id);
    expect(first.displayName).toBe(second.displayName);
  });

  it('rejects a blank display name clearly without a Company or registration event', async () => {
    const response = await fetch(`${origin}/api/companies`, {
      method: 'POST',
      headers: {
        ...identityHeaders('workspace-owner', 'Ada Ionescu'),
        'content-type': 'application/json',
        'idempotency-key': 'blank-company-name',
      },
      body: JSON.stringify({ displayName: '   ' }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'Company display name is required.',
      error: 'Bad Request',
      statusCode: 400,
    });
    await expectPersistenceCounts(0, 0);
  });

  it('collapses concurrent retries into one Company and one registration event', async () => {
    const responses = await Promise.all(
      Array.from({ length: 10 }, () =>
        fetch(`${origin}/api/companies`, {
          method: 'POST',
          headers: {
            ...identityHeaders('workspace-owner', 'Ada Ionescu'),
            'content-type': 'application/json',
            'idempotency-key': 'concurrent-company-registration',
          },
          body: JSON.stringify({ displayName: 'Concurrent Provider' }),
        }),
      ),
    );
    const companies = await Promise.all(
      responses.map((response) => response.json()),
    );

    expect(responses.every((response) => response.status === 201)).toBe(true);
    expect(new Set(companies.map((company) => company.id)).size).toBe(1);
    await expectPersistenceCounts(1, 1);
  });

  it('rolls back Company registration when its Activity Log event cannot be recorded', async () => {
    await pool.query(`
      CREATE FUNCTION reject_company_activity_log_insert() RETURNS trigger AS $$
      BEGIN
        IF NEW.action::text = 'company.registered' THEN
          RAISE EXCEPTION 'forced Company Activity Log failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_company_activity_log_insert
      BEFORE INSERT ON activity_log_events
      FOR EACH ROW EXECUTE FUNCTION reject_company_activity_log_insert();
    `);

    try {
      const response = await fetch(`${origin}/api/companies`, {
        method: 'POST',
        headers: {
          ...identityHeaders('workspace-owner', 'Ada Ionescu'),
          'content-type': 'application/json',
          'idempotency-key': 'failed-company-registration',
        },
        body: JSON.stringify({ displayName: 'Rolled Back Provider' }),
      });

      expect(response.status).toBe(500);
      await expectPersistenceCounts(0, 0);
    } finally {
      await pool.query(`
        DROP TRIGGER reject_company_activity_log_insert ON activity_log_events;
        DROP FUNCTION reject_company_activity_log_insert();
      `);
    }
  });

  it('does not expose a Company from another Workspace through the public read', async () => {
    const owner = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders('workspace-owner', 'Ada Ionescu'),
    }).then((response) => response.json());
    await pool.query(`
      WITH hidden_workspace AS (
        INSERT INTO workspaces (singleton_key, name)
        VALUES ('hidden-read-workspace', 'Hidden Read Workspace')
        RETURNING id
      )
      INSERT INTO internal_users (
        workspace_id, external_provider, external_subject, display_name, email
      )
      SELECT id, 'deterministic-test', 'hidden-company-owner',
        'Hidden Company Owner', 'hidden-company-owner@example.test'
      FROM hidden_workspace
    `);
    const hidden = await pool.query<{ company_id: string }>(`
      INSERT INTO companies (
        workspace_id, display_name, created_by_internal_user_id,
        created_by_workspace_membership_id, registration_idempotency_key
      )
      SELECT membership.workspace_id, 'Hidden Provider', membership.internal_user_id,
        membership.id, 'hidden-provider-registration'
      FROM workspace_memberships AS membership
      INNER JOIN internal_users AS internal_user
        ON internal_user.id = membership.internal_user_id
      WHERE internal_user.external_subject = 'hidden-company-owner'
      RETURNING id AS company_id
    `);

    const response = await fetch(
      `${origin}/api/companies/${hidden.rows[0]!.company_id}`,
      { headers: identityHeaders('workspace-owner', 'Ada Ionescu') },
    );

    expect(response.status).toBe(404);
    const responseText = await response.text();
    expect(responseText).not.toContain(hidden.rows[0]!.company_id);
    expect(responseText).not.toContain('Hidden Provider');
    expect(responseText).not.toContain(owner.workspaceId);
  });

  it('rejects cross-Workspace Company creator and Activity Log target associations', async () => {
    const owner = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders('workspace-owner', 'Ada Ionescu'),
    }).then((response) => response.json());
    await pool.query(`
      WITH hidden_workspace AS (
        INSERT INTO workspaces (singleton_key, name)
        VALUES ('constraint-workspace', 'Constraint Workspace')
        RETURNING id
      )
      INSERT INTO internal_users (
        workspace_id, external_provider, external_subject, display_name, email
      )
      SELECT id, 'deterministic-test', 'constraint-user',
        'Constraint User', 'constraint-user@example.test'
      FROM hidden_workspace
    `);
    const hiddenMembership = await pool.query<{
      workspace_id: string;
      internal_user_id: string;
      membership_id: string;
    }>(`
      SELECT membership.workspace_id, membership.internal_user_id,
        membership.id AS membership_id
      FROM workspace_memberships AS membership
      INNER JOIN internal_users AS internal_user
        ON internal_user.id = membership.internal_user_id
      WHERE internal_user.external_subject = 'constraint-user'
    `);
    const hidden = hiddenMembership.rows[0]!;

    await expect(
      pool.query(
        `INSERT INTO companies (
          workspace_id, display_name, created_by_internal_user_id,
          created_by_workspace_membership_id, registration_idempotency_key
        ) VALUES ($1, 'Invalid Cross Workspace Provider', $2, $3, $4)`,
        [
          owner.workspaceId,
          hidden.internal_user_id,
          hidden.membership_id,
          'invalid-cross-workspace-provider',
        ],
      ),
    ).rejects.toMatchObject({ code: '23503' });

    const hiddenCompany = await pool.query<{ id: string }>(
      `INSERT INTO companies (
        workspace_id, display_name, created_by_internal_user_id,
        created_by_workspace_membership_id, registration_idempotency_key
      ) VALUES ($1, 'Hidden Constraint Provider', $2, $3, $4)
      RETURNING id`,
      [
        hidden.workspace_id,
        hidden.internal_user_id,
        hidden.membership_id,
        'hidden-constraint-provider',
      ],
    );
    await expect(
      pool.query(
        `INSERT INTO activity_log_events (
          workspace_id, actor_internal_user_id, actor_workspace_membership_id,
          action, target_type, target_company_id, metadata, idempotency_key
        ) VALUES ($1, $2, $3, 'company.registered', 'company', $4,
          '{}'::jsonb, 'invalid-cross-workspace-company-event')`,
        [
          owner.workspaceId,
          owner.internalUserId,
          owner.workspaceMembershipId,
          hiddenCompany.rows[0]!.id,
        ],
      ),
    ).rejects.toMatchObject({ code: '23503' });
  });

  async function registerCompany(input: {
    subject: string;
    displayName: string;
    idempotencyKey: string;
  }) {
    const response = await fetch(`${origin}/api/companies`, {
      method: 'POST',
      headers: {
        ...identityHeaders(input.subject, 'Ada Ionescu'),
        'content-type': 'application/json',
        'idempotency-key': input.idempotencyKey,
      },
      body: JSON.stringify({ displayName: input.displayName }),
    });
    expect(response.status).toBe(201);
    return response.json();
  }

  async function expectPersistenceCounts(
    expectedCompanies: number,
    expectedRegistrationEvents: number,
  ): Promise<void> {
    const persisted = await pool.query<{
      companies: string;
      registration_events: string;
    }>(`SELECT
      (SELECT count(*) FROM companies) AS companies,
      (SELECT count(*) FROM activity_log_events
        WHERE action::text = 'company.registered') AS registration_events`);
    expect(persisted.rows[0]).toEqual({
      companies: String(expectedCompanies),
      registration_events: String(expectedRegistrationEvents),
    });
  }

  function identityHeaders(subject: string, displayName: string) {
    return {
      'x-test-external-provider': 'deterministic-test',
      'x-test-external-subject': subject,
      'x-test-display-name': displayName,
      'x-test-email': `${subject}@example.test`,
    };
  }
});

function assertSafeTestDatabase(connectionString: string): void {
  const target = new URL(connectionString);
  const localHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);
  const databaseName = decodeURIComponent(target.pathname.slice(1));
  if (
    !new Set(['postgres:', 'postgresql:']).has(target.protocol) ||
    target.search ||
    target.hash ||
    !localHosts.has(target.hostname) ||
    !databaseName.endsWith('_test')
  ) {
    throw new Error(
      'TEST_DATABASE_URL must identify a local database whose name ends with "_test", without connection-target overrides.',
    );
  }
}
