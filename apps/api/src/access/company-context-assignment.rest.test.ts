import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../app.module.js';
import { DATABASE } from '../database/database.constants.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres('Company Context Access assignments REST API', () => {
  let app: INestApplication;
  let origin: string;
  let pool: Pool;
  let applicationPool: Pool;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.ACCESS_IDENTITY_MODE = 'test';
    process.env.ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER = 'deterministic-test';
    process.env.ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT = 'workspace-owner';
    process.env.ACCESS_BOOTSTRAP_WORKSPACE_KEY = 'assignment-workspace';
    process.env.ACCESS_BOOTSTRAP_WORKSPACE_NAME = 'Assignment Workspace';
    process.env.ACCESS_ACCEPTED_INVITATIONS_JSON = JSON.stringify([
      {
        provider: 'deterministic-test',
        subject: 'workspace-member',
        workspaceKey: 'assignment-workspace',
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
      'TRUNCATE activity_log_events, company_role_assignments, companies, workspace_permission_grants, workspace_memberships, internal_users, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await pool?.end();
    await app?.close();
    await applicationPool?.end();
  });

  it('grants and revokes only the fixed Company Context Access assignment', async () => {
    const owner = await currentActor('workspace-owner', 'Owner');
    const member = await currentActor('workspace-member', 'Member');
    const company = await registerCompany('Assigned Company');

    const grant = await fetch(`${origin}/api/company-context-assignments`, {
      method: 'POST',
      headers: {
        ...identityHeaders('workspace-owner', 'Owner'),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        workspaceMembershipId: member.workspaceMembershipId,
        companyId: company.id,
      }),
    });
    expect(grant.status).toBe(201);
    await expect(grant.json()).resolves.toMatchObject({
      workspaceMembershipId: member.workspaceMembershipId,
      companyId: company.id,
      bundle: 'Company Context Access',
      active: true,
    });

    const visible = await fetch(`${origin}/api/companies`, {
      headers: identityHeaders('workspace-member', 'Member'),
    });
    expect(visible.status).toBe(200);
    await expect(visible.json()).resolves.toEqual([company]);

    const selected = await fetch(`${origin}/api/access/current-actor`, {
      headers: {
        ...identityHeaders('workspace-member', 'Member'),
        'x-company-context-id': company.id,
      },
    });
    expect(selected.status).toBe(200);
    await expect(selected.json()).resolves.toMatchObject({
      activeCompany: { id: company.id },
    });

    const revoke = await fetch(
      `${origin}/api/company-context-assignments/${member.workspaceMembershipId}/${company.id}`,
      {
        method: 'DELETE',
        headers: identityHeaders('workspace-owner', 'Owner'),
      },
    );
    expect(revoke.status).toBe(200);

    const denied = await fetch(`${origin}/api/access/current-actor`, {
      headers: {
        ...identityHeaders('workspace-member', 'Member'),
        'x-company-context-id': company.id,
      },
    });
    expect(denied.status).toBe(403);

    const actions = await pool.query<{ action: string }>(
      "SELECT action FROM activity_log_events WHERE action LIKE 'company_context_assignment.%' ORDER BY occurred_at, id",
    );
    expect(actions.rows).toEqual([
      { action: 'company_context_assignment.granted' },
      { action: 'company_context_assignment.revoked' },
    ]);
    expect(owner.workspacePermissions).toContain('company.assignment.manage');
  });

  it('collapses concurrent grant and revoke retries into one event per transition', async () => {
    await currentActor('workspace-owner', 'Owner');
    const member = await currentActor('workspace-member', 'Member');
    const company = await registerCompany('Concurrent Company');
    const grantRequest = () =>
      fetch(`${origin}/api/company-context-assignments`, {
        method: 'POST',
        headers: {
          ...identityHeaders('workspace-owner', 'Owner'),
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          workspaceMembershipId: member.workspaceMembershipId,
          companyId: company.id,
        }),
      });
    const grants = await Promise.all([grantRequest(), grantRequest()]);
    expect(grants.map((response) => response.status)).toEqual([201, 201]);

    const revokeRequest = () =>
      fetch(
        `${origin}/api/company-context-assignments/${member.workspaceMembershipId}/${company.id}`,
        {
          method: 'DELETE',
          headers: identityHeaders('workspace-owner', 'Owner'),
        },
      );
    const revokes = await Promise.all([revokeRequest(), revokeRequest()]);
    expect(revokes.map((response) => response.status)).toEqual([200, 200]);

    const counts = await pool.query<{ action: string; count: string }>(
      "SELECT action, count(*) FROM activity_log_events WHERE action LIKE 'company_context_assignment.%' GROUP BY action ORDER BY action",
    );
    expect(counts.rows).toEqual([
      { action: 'company_context_assignment.granted', count: '1' },
      { action: 'company_context_assignment.revoked', count: '1' },
    ]);
  });

  async function currentActor(subject: string, displayName: string) {
    return fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders(subject, displayName),
    }).then((response) => response.json());
  }

  async function registerCompany(displayName: string) {
    return fetch(`${origin}/api/companies`, {
      method: 'POST',
      headers: {
        ...identityHeaders('workspace-owner', 'Owner'),
        'content-type': 'application/json',
        'idempotency-key': `register-${displayName.toLowerCase().replaceAll(' ', '-')}`,
      },
      body: JSON.stringify({ displayName }),
    }).then((response) => response.json());
  }
});

function identityHeaders(subject: string, displayName: string) {
  return {
    'x-test-external-provider': 'deterministic-test',
    'x-test-external-subject': subject,
    'x-test-display-name': displayName,
    'x-test-email': `${subject}@example.test`,
  };
}
