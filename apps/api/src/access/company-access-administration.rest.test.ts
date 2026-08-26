import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres('Company access administration REST API', () => {
  let harness: PostgresRestTestHarness;
  let origin: string;
  let pool: Pool;

  beforeAll(async () => {
    if (!databaseUrl)
      throw new Error('TEST_DATABASE_URL is required to start this suite.');
    harness = await createPostgresRestTestHarness({
      databaseUrl,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'workspace-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_KEY: 'access-admin-workspace',
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Access Administration Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          {
            provider: 'deterministic-test',
            subject: 'active-member',
            workspaceKey: 'access-admin-workspace',
          },
          {
            provider: 'deterministic-test',
            subject: 'inactive-member',
            workspaceKey: 'access-admin-workspace',
          },
        ]),
      },
    });
    ({ origin, pool } = harness);
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE activity_log_events, company_context_assignment_commands, company_role_assignments, companies, workspace_permission_grants, workspace_memberships, internal_users, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await harness?.close();
  });

  it('returns only active same-Workspace members, Companies and approved bundle assignments', async () => {
    const owner = await currentActor('workspace-owner', 'Workspace Owner');
    const activeMember = await currentActor('active-member', 'Ada Member');
    const inactiveMember = await currentActor('inactive-member', 'Zed Inactive');
    const activeCompany = await registerCompany('Alpha Company');
    const inactiveCompany = await registerCompany('Zeta Inactive Company');

    expect(
      (
        await grant(
          '/api/company-context-assignments',
          activeMember.workspaceMembershipId,
          activeCompany.id,
          'context-active',
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await grant(
          '/api/company-director-client-assignments',
          activeMember.workspaceMembershipId,
          activeCompany.id,
          'director-active',
        )
      ).status,
    ).toBe(201);

    await pool.query(
      "UPDATE workspace_memberships SET status = 'inactive' WHERE id = $1",
      [inactiveMember.workspaceMembershipId],
    );
    await pool.query("UPDATE companies SET status = 'inactive' WHERE id = $1", [
      inactiveCompany.id,
    ]);

    const foreignWorkspace = await pool.query<{ id: string }>(`
      INSERT INTO workspaces (singleton_key, name)
      VALUES ('foreign-access-admin', 'Foreign Access Admin')
      RETURNING id
    `);
    const foreignUser = await pool.query<{ id: string }>(
      `INSERT INTO internal_users (
         workspace_id, external_provider, external_subject, display_name, email
       ) VALUES ($1, 'deterministic-test', 'foreign-user', 'Foreign User',
         'foreign-user@example.test') RETURNING id`,
      [foreignWorkspace.rows[0]!.id],
    );
    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, internal_user_id)
       VALUES ($1, $2)`,
      [foreignWorkspace.rows[0]!.id, foreignUser.rows[0]!.id],
    );

    const response = await fetch(
      `${origin}/api/company-context-assignments/administration`,
      { headers: identityHeaders('workspace-owner', 'Workspace Owner') },
    );
    expect(response.status).toBe(200);
    const state = await response.json();

    expect(state.members).toEqual([
      {
        workspaceMembershipId: activeMember.workspaceMembershipId,
        displayName: 'Ada Member',
        email: 'active-member@example.test',
      },
      {
        workspaceMembershipId: owner.workspaceMembershipId,
        displayName: 'Workspace Owner',
        email: 'workspace-owner@example.test',
      },
    ]);
    expect(state.companies).toEqual([
      { id: activeCompany.id, displayName: 'Alpha Company' },
    ]);
    expect(state.assignments).toEqual([
      expect.objectContaining({
        workspaceMembershipId: activeMember.workspaceMembershipId,
        companyId: activeCompany.id,
        bundle: 'Company Context Access',
        active: true,
      }),
      expect.objectContaining({
        workspaceMembershipId: activeMember.workspaceMembershipId,
        companyId: activeCompany.id,
        bundle: 'Company Director Client Access',
        active: true,
      }),
    ]);

    const denied = await fetch(
      `${origin}/api/company-context-assignments/administration`,
      { headers: identityHeaders('active-member', 'Ada Member') },
    );
    await expectForbidden(denied);
  });

  it('reloads the canonical assignment state after grant and revoke', async () => {
    await currentActor('workspace-owner', 'Workspace Owner');
    const member = await currentActor('active-member', 'Ada Member');
    const company = await registerCompany('Canonical Company');

    const initial = await administrationState();
    expect(initial.assignments).toEqual([]);

    expect(
      (
        await grant(
          '/api/company-context-assignments',
          member.workspaceMembershipId,
          company.id,
          'canonical-grant',
        )
      ).status,
    ).toBe(201);
    const granted = await administrationState();
    expect(granted.assignments).toEqual([
      expect.objectContaining({
        workspaceMembershipId: member.workspaceMembershipId,
        companyId: company.id,
        bundle: 'Company Context Access',
        active: true,
      }),
    ]);

    const revoke = await fetch(
      `${origin}/api/company-context-assignments/${member.workspaceMembershipId}/${company.id}`,
      {
        method: 'DELETE',
        headers: {
          ...identityHeaders('workspace-owner', 'Workspace Owner'),
          'idempotency-key': 'canonical-revoke',
        },
      },
    );
    expect(revoke.status).toBe(200);
    const revoked = await administrationState();
    expect(revoked.assignments).toEqual([]);
  });

  async function currentActor(subject: string, displayName: string) {
    const response = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders(subject, displayName),
    });
    expect(response.status).toBe(200);
    return response.json();
  }

  async function registerCompany(displayName: string) {
    const response = await fetch(`${origin}/api/companies`, {
      method: 'POST',
      headers: {
        ...identityHeaders('workspace-owner', 'Workspace Owner'),
        'content-type': 'application/json',
        'idempotency-key': `register-${displayName.toLowerCase().replaceAll(' ', '-')}`,
      },
      body: JSON.stringify({ displayName }),
    });
    expect(response.status).toBe(201);
    return response.json();
  }

  function grant(
    path: string,
    workspaceMembershipId: string,
    companyId: string,
    idempotencyKey: string,
  ) {
    return fetch(`${origin}${path}`, {
      method: 'POST',
      headers: {
        ...identityHeaders('workspace-owner', 'Workspace Owner'),
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify({ workspaceMembershipId, companyId }),
    });
  }

  async function administrationState() {
    const response = await fetch(
      `${origin}/api/company-context-assignments/administration`,
      { headers: identityHeaders('workspace-owner', 'Workspace Owner') },
    );
    expect(response.status).toBe(200);
    return response.json();
  }

  async function expectForbidden(response: Response) {
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Forbidden',
      statusCode: 403,
    });
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
