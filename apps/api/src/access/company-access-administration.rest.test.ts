import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000081';

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
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Access Administration Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          {
            provider: 'deterministic-test',
            subject: 'active-member',
            workspaceId: WORKSPACE_ID,
          },
          {
            provider: 'deterministic-test',
            subject: 'inactive-member',
            workspaceId: WORKSPACE_ID,
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
    const inactiveMember = await currentActor(
      'inactive-member',
      'Zed Inactive',
    );
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
      INSERT INTO workspaces (id, name)
      VALUES ('00000000-0000-4000-8000-000000000082', 'Foreign Access Admin')
      RETURNING id
    `);
    const foreignUser = await pool.query<{ id: string }>(
      `INSERT INTO internal_users (
         external_provider, external_subject, display_name, email
       ) VALUES ('deterministic-test', 'foreign-user', 'Foreign User',
         'foreign-user@example.test') RETURNING id`,
    );
    await pool.query(
      `INSERT INTO workspace_memberships (workspace_id, internal_user_id)
       VALUES ($1, $2)
       ON CONFLICT (workspace_id, internal_user_id) DO NOTHING`,
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
        permissionSetVersion: null,
        active: true,
      }),
      expect.objectContaining({
        workspaceMembershipId: activeMember.workspaceMembershipId,
        companyId: activeCompany.id,
        bundle: 'Company Director Client Access',
        permissionSetVersion: 'v2',
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

  it('creates a fresh v2 Director assignment only after explicit revoke and grant', async () => {
    await currentActor('workspace-owner', 'Workspace Owner');
    const member = await currentActor('active-member', 'Ada Member');
    const company = await registerCompany('Versioned Director Company');

    const firstGrant = await grant(
      '/api/company-director-client-assignments',
      member.workspaceMembershipId,
      company.id,
      'director-version-one',
    );
    expect(firstGrant.status).toBe(201);
    const firstAssignment = await firstGrant.json();
    expect(firstAssignment).toMatchObject({ permissionSetVersion: 'v2' });

    const revoke = await fetch(
      `${origin}/api/company-director-client-assignments/${member.workspaceMembershipId}/${company.id}`,
      {
        method: 'DELETE',
        headers: {
          ...identityHeaders('workspace-owner', 'Workspace Owner'),
          'idempotency-key': 'director-version-revoke',
        },
      },
    );
    expect(revoke.status).toBe(200);

    const secondGrant = await grant(
      '/api/company-director-client-assignments',
      member.workspaceMembershipId,
      company.id,
      'director-version-two',
    );
    expect(secondGrant.status).toBe(201);
    const secondAssignment = await secondGrant.json();
    expect(secondAssignment).toMatchObject({ permissionSetVersion: 'v2' });
    expect(secondAssignment.id).not.toBe(firstAssignment.id);

    const generations = await pool.query<{
      id: string;
      permission_set_version: string;
      active: boolean;
    }>(
      `SELECT id::text, permission_set_version, revoked_at IS NULL AS active
        FROM company_role_assignments
        WHERE workspace_membership_id = $1 AND company_id = $2
          AND bundle::text = 'company_director_client_access'
        ORDER BY created_at, id`,
      [member.workspaceMembershipId, company.id],
    );
    expect(generations.rows).toEqual([
      {
        id: firstAssignment.id,
        permission_set_version: 'v2',
        active: false,
      },
      {
        id: secondAssignment.id,
        permission_set_version: 'v2',
        active: true,
      },
    ]);
  });

  it('does not promote an active legacy v1 assignment in place', async () => {
    await currentActor('workspace-owner', 'Workspace Owner');
    const member = await currentActor('active-member', 'Legacy Member');
    const company = await registerCompany('Legacy Director Company');
    const legacy = await pool.query<{ id: string }>(
      `INSERT INTO company_role_assignments (
         workspace_id, company_id, workspace_membership_id, bundle,
         permission_set_version
       )
       SELECT workspace_id, $1, id, 'company_director_client_access', 'v1'
       FROM workspace_memberships WHERE id = $2
       RETURNING id::text`,
      [company.id, member.workspaceMembershipId],
    );

    const replayedGrant = await grant(
      '/api/company-director-client-assignments',
      member.workspaceMembershipId,
      company.id,
      'legacy-active-grant',
    );
    expect(replayedGrant.status).toBe(201);
    await expect(replayedGrant.json()).resolves.toMatchObject({
      id: legacy.rows[0]?.id,
      permissionSetVersion: 'v1',
      active: true,
    });

    const generations = await pool.query<{
      id: string;
      permission_set_version: string;
    }>(
      `SELECT id::text, permission_set_version
       FROM company_role_assignments
       WHERE workspace_membership_id = $1 AND company_id = $2
         AND bundle::text = 'company_director_client_access'`,
      [member.workspaceMembershipId, company.id],
    );
    expect(generations.rows).toEqual([
      { id: legacy.rows[0]?.id, permission_set_version: 'v1' },
    ]);
  });

  it('converges concurrent fresh Director grants on one immutable generation', async () => {
    await currentActor('workspace-owner', 'Workspace Owner');
    const member = await currentActor('active-member', 'Concurrent Member');
    const company = await registerCompany('Concurrent Director Company');

    const responses = await Promise.all([
      grant(
        '/api/company-director-client-assignments',
        member.workspaceMembershipId,
        company.id,
        'director-concurrent-one',
      ),
      grant(
        '/api/company-director-client-assignments',
        member.workspaceMembershipId,
        company.id,
        'director-concurrent-two',
      ),
    ]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const results = await Promise.all(
      responses.map((response) => response.json()),
    );
    expect(new Set(results.map((result) => result.id)).size).toBe(1);
    expect(results[0]).toMatchObject({ permissionSetVersion: 'v2' });

    const assignments = await pool.query<{ count: string }>(
      `SELECT count(*) FROM company_role_assignments
       WHERE workspace_membership_id = $1 AND company_id = $2
         AND bundle::text = 'company_director_client_access'
         AND revoked_at IS NULL`,
      [member.workspaceMembershipId, company.id],
    );
    expect(assignments.rows[0]).toEqual({ count: '1' });
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
