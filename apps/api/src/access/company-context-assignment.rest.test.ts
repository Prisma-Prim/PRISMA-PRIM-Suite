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
  let commandSequence = 0;

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
    const unassignedCompany = await registerCompany('Unassigned Company');

    const grant = await fetch(`${origin}/api/company-context-assignments`, {
      method: 'POST',
      headers: {
        ...identityHeaders('workspace-owner', 'Owner'),
        'content-type': 'application/json',
        'idempotency-key': 'grant-assigned-company',
      },
      body: JSON.stringify({
        workspaceMembershipId: member.workspaceMembershipId,
        companyId: company.id,
      }),
    });
    expect(grant.status).toBe(201);
    const grantedAssignment = await grant.json();
    expect(grantedAssignment).toMatchObject({
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
    const unassignedSelection = await fetch(
      `${origin}/api/access/current-actor`,
      {
        headers: {
          ...identityHeaders('workspace-member', 'Member'),
          'x-company-context-id': unassignedCompany.id,
        },
      },
    );
    expect(unassignedSelection.status).toBe(403);

    const revoke = await fetch(
      `${origin}/api/company-context-assignments/${member.workspaceMembershipId}/${company.id}`,
      {
        method: 'DELETE',
        headers: {
          ...identityHeaders('workspace-owner', 'Owner'),
          'idempotency-key': 'revoke-assigned-company',
        },
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

    const actions = await pool.query<{
      action: string;
      actor_internal_user_id: string;
      actor_workspace_membership_id: string;
      target_internal_user_id: string;
      target_workspace_membership_id: string;
      target_company_id: string;
      target_company_role_assignment_id: string;
      bundle: string;
    }>(
      `SELECT action, actor_internal_user_id, actor_workspace_membership_id,
         target_internal_user_id, target_workspace_membership_id,
         target_company_id, target_company_role_assignment_id,
         metadata->>'bundle' AS bundle
       FROM activity_log_events
       WHERE action::text LIKE 'company_context_assignment.%'
       ORDER BY occurred_at, id`,
    );
    expect(actions.rows).toEqual([
      {
        action: 'company_context_assignment.granted',
        actor_internal_user_id: owner.internalUserId,
        actor_workspace_membership_id: owner.workspaceMembershipId,
        target_internal_user_id: member.internalUserId,
        target_workspace_membership_id: member.workspaceMembershipId,
        target_company_id: company.id,
        target_company_role_assignment_id: grantedAssignment.id,
        bundle: 'Company Context Access',
      },
      {
        action: 'company_context_assignment.revoked',
        actor_internal_user_id: owner.internalUserId,
        actor_workspace_membership_id: owner.workspaceMembershipId,
        target_internal_user_id: member.internalUserId,
        target_workspace_membership_id: member.workspaceMembershipId,
        target_company_id: company.id,
        target_company_role_assignment_id: grantedAssignment.id,
        bundle: 'Company Context Access',
      },
    ]);
    expect(owner.workspacePermissions).toContain('company.assignment.manage');
  });

  it('rejects replay results that reference a different assignment target', async () => {
    await currentActor('workspace-owner', 'Owner');
    const member = await currentActor('workspace-member', 'Member');
    const firstCompany = await registerCompany('First Replay Company');
    const secondCompany = await registerCompany('Second Replay Company');

    const firstGrant = await grantAs(
      'workspace-owner',
      member.workspaceMembershipId,
      firstCompany.id,
    );
    expect(firstGrant.status).toBe(201);
    const firstAssignment = await firstGrant.json();
    const secondGrant = await grantAs(
      'workspace-owner',
      member.workspaceMembershipId,
      secondCompany.id,
    );
    expect(secondGrant.status).toBe(201);
    const secondAssignment = await secondGrant.json();

    await expect(
      pool.query(
        `UPDATE company_context_assignment_commands
         SET result_assignment_id = $1
         WHERE result_assignment_id = $2`,
        [secondAssignment.id, firstAssignment.id],
      ),
    ).rejects.toMatchObject({ code: '23503' });
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
          'idempotency-key': 'concurrent-grant',
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
          headers: {
            ...identityHeaders('workspace-owner', 'Owner'),
            'idempotency-key': 'concurrent-revoke',
          },
        },
      );
    const revokes = await Promise.all([revokeRequest(), revokeRequest()]);
    expect(revokes.map((response) => response.status)).toEqual([200, 200]);

    const counts = await pool.query<{ action: string; count: string }>(
      "SELECT action, count(*) FROM activity_log_events WHERE action::text LIKE 'company_context_assignment.%' GROUP BY action ORDER BY action",
    );
    expect(counts.rows).toEqual([
      { action: 'company_context_assignment.granted', count: '1' },
      { action: 'company_context_assignment.revoked', count: '1' },
    ]);
  });

  it('holds active target rows stable until a grant commits', async () => {
    await currentActor('workspace-owner', 'Owner');
    const member = await currentActor('workspace-member', 'Member');
    const company = await registerCompany('Locked Target Company');
    const blocker = await pool.connect();
    const advisoryLock = 90_867_530;

    await pool.query(`
      CREATE OR REPLACE FUNCTION pause_company_context_assignment_command()
      RETURNS trigger AS $$
      BEGIN
        PERFORM pg_advisory_xact_lock(${advisoryLock});
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER pause_company_context_assignment_command
      BEFORE INSERT ON company_context_assignment_commands
      FOR EACH ROW EXECUTE FUNCTION pause_company_context_assignment_command();
    `);

    try {
      await blocker.query('BEGIN');
      await blocker.query('SELECT pg_advisory_xact_lock($1)', [advisoryLock]);
      const grant = grantAs(
        'workspace-owner',
        member.workspaceMembershipId,
        company.id,
      );
      await waitForBlockedAssignmentInsert();

      await expectTargetUpdateLocked(
        `UPDATE internal_users SET status = 'inactive'
         WHERE id = (SELECT internal_user_id FROM workspace_memberships WHERE id = $1)`,
        member.workspaceMembershipId,
      );
      await expectTargetUpdateLocked(
        "UPDATE workspace_memberships SET status = 'inactive' WHERE id = $1",
        member.workspaceMembershipId,
      );
      await expectTargetUpdateLocked(
        "UPDATE companies SET status = 'inactive' WHERE id = $1",
        company.id,
      );

      await blocker.query('COMMIT');
      expect((await grant).status).toBe(201);
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
      await pool.query(
        'DROP TRIGGER IF EXISTS pause_company_context_assignment_command ON company_context_assignment_commands',
      );
      await pool.query(
        'DROP FUNCTION IF EXISTS pause_company_context_assignment_command()',
      );
    }
  });

  async function waitForBlockedAssignmentInsert() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const blocked = await pool.query<{ blocked: boolean }>(`
        SELECT EXISTS (
          SELECT 1 FROM pg_stat_activity
          WHERE datname = current_database()
            AND wait_event = 'advisory'
            AND query ILIKE '%company_context_assignment_commands%'
        ) AS blocked
      `);
      if (blocked.rows[0]?.blocked) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('The assignment command did not reach the lock barrier.');
  }

  async function expectTargetUpdateLocked(query: string, id: string) {
    const updater = await pool.connect();
    try {
      await updater.query('BEGIN');
      await updater.query("SET LOCAL lock_timeout = '100ms'");
      await expect(updater.query(query, [id])).rejects.toMatchObject({
        code: '55P03',
      });
    } finally {
      await updater.query('ROLLBACK');
      updater.release();
    }
  }

  it('replays delayed commands without changing a newer assignment generation', async () => {
    await currentActor('workspace-owner', 'Owner');
    const member = await currentActor('workspace-member', 'Member');
    const company = await registerCompany('Replay Company');
    const post = (key: string) =>
      fetch(`${origin}/api/company-context-assignments`, {
        method: 'POST',
        headers: {
          ...identityHeaders('workspace-owner', 'Owner'),
          'content-type': 'application/json',
          'idempotency-key': key,
        },
        body: JSON.stringify({
          workspaceMembershipId: member.workspaceMembershipId,
          companyId: company.id,
        }),
      });
    const remove = (key: string) =>
      fetch(
        `${origin}/api/company-context-assignments/${member.workspaceMembershipId}/${company.id}`,
        {
          method: 'DELETE',
          headers: {
            ...identityHeaders('workspace-owner', 'Owner'),
            'idempotency-key': key,
          },
        },
      );

    await post('grant-generation-one');
    await remove('revoke-generation-one');
    expect((await post('grant-generation-one')).status).toBe(201);
    await expect(
      activeAssignmentCount(member.workspaceMembershipId, company.id),
    ).resolves.toBe('0');

    await post('grant-generation-two');
    expect((await remove('revoke-generation-one')).status).toBe(200);
    await expect(
      activeAssignmentCount(member.workspaceMembershipId, company.id),
    ).resolves.toBe('1');

    for (let generation = 3; generation <= 5; generation += 1) {
      await remove(`revoke-generation-${generation}`);
      await post(`grant-generation-${generation}`);
    }
    const transitions = await pool.query<{ transition_id: string }>(
      `SELECT DISTINCT transition_id FROM company_context_assignment_commands
       WHERE workspace_id = $1`,
      [(await currentActor('workspace-owner', 'Owner')).workspaceId],
    );
    expect(transitions.rows).toHaveLength(9);
  });

  it('uses one metadata-safe denial for unauthorized actors and invalid grant targets', async () => {
    const owner = await currentActor('workspace-owner', 'Owner');
    const member = await currentActor('workspace-member', 'Member');
    const company = await registerCompany('Protected Company');
    const unknownId = '00000000-0000-4000-8000-000000000099';

    const deniedActor = await grantAs(
      'workspace-member',
      member.workspaceMembershipId,
      company.id,
    );
    await expectForbidden(deniedActor);

    await pool.query(
      `UPDATE internal_users SET status = 'inactive'
       WHERE id = (SELECT internal_user_id FROM workspace_memberships WHERE id = $1)`,
      [member.workspaceMembershipId],
    );
    await expectForbidden(
      await grantAs(
        'workspace-owner',
        member.workspaceMembershipId,
        company.id,
      ),
    );
    await pool.query(
      `UPDATE internal_users SET status = 'active'
       WHERE id = (SELECT internal_user_id FROM workspace_memberships WHERE id = $1)`,
      [member.workspaceMembershipId],
    );

    await pool.query(
      "UPDATE workspace_memberships SET status = 'inactive' WHERE id = $1",
      [member.workspaceMembershipId],
    );
    await expectForbidden(
      await grantAs(
        'workspace-owner',
        member.workspaceMembershipId,
        company.id,
      ),
    );
    await pool.query(
      "UPDATE workspace_memberships SET status = 'active' WHERE id = $1",
      [member.workspaceMembershipId],
    );

    await pool.query("UPDATE companies SET status = 'inactive' WHERE id = $1", [
      company.id,
    ]);
    await expectForbidden(
      await grantAs(
        'workspace-owner',
        member.workspaceMembershipId,
        company.id,
      ),
    );
    await pool.query("UPDATE companies SET status = 'active' WHERE id = $1", [
      company.id,
    ]);

    await expectForbidden(
      await grantAs('workspace-owner', unknownId, company.id),
    );
    await expectForbidden(
      await grantAs('workspace-owner', member.workspaceMembershipId, unknownId),
    );

    const foreignWorkspace = await pool.query<{ id: string }>(`
      INSERT INTO workspaces (singleton_key, name)
      VALUES ('foreign-assignment-workspace', 'Foreign Assignment Workspace')
      RETURNING id
    `);
    const foreignUser = await pool.query<{ id: string }>(
      `INSERT INTO internal_users (
         workspace_id, external_provider, external_subject, display_name, email
       ) VALUES ($1, 'deterministic-test', 'foreign-member', 'Foreign Member',
         'foreign-member@example.test')
       RETURNING id`,
      [foreignWorkspace.rows[0]!.id],
    );
    const foreignMembership = await pool.query<{ id: string }>(
      'SELECT id FROM workspace_memberships WHERE internal_user_id = $1',
      [foreignUser.rows[0]!.id],
    );
    const foreignCompany = await pool.query<{ id: string }>(
      `INSERT INTO companies (
         workspace_id, display_name, created_by_internal_user_id,
         created_by_workspace_membership_id, registration_idempotency_key
       ) VALUES ($1, 'Foreign Company', $2, $3, 'foreign-assignment-company')
       RETURNING id`,
      [
        foreignWorkspace.rows[0]!.id,
        foreignUser.rows[0]!.id,
        foreignMembership.rows[0]!.id,
      ],
    );
    await expectForbidden(
      await grantAs(
        'workspace-owner',
        foreignMembership.rows[0]!.id,
        company.id,
      ),
    );
    await expectForbidden(
      await grantAs(
        'workspace-owner',
        member.workspaceMembershipId,
        foreignCompany.rows[0]!.id,
      ),
    );

    const recipientCompanyMutation = await fetch(`${origin}/api/companies`, {
      method: 'POST',
      headers: {
        ...identityHeaders('workspace-member', 'Member'),
        'content-type': 'application/json',
        'idempotency-key': 'recipient-must-not-register',
      },
      body: JSON.stringify({ displayName: 'Forbidden Company' }),
    });
    await expectForbidden(recipientCompanyMutation);
    await expectForbidden(
      await grantAs(
        'workspace-member',
        owner.workspaceMembershipId,
        company.id,
      ),
    );
    await expectForbidden(
      await fetch(
        `${origin}/api/company-context-assignments/${member.workspaceMembershipId}/${company.id}`,
        {
          method: 'DELETE',
          headers: {
            ...identityHeaders('workspace-member', 'Member'),
            'idempotency-key': 'recipient-must-not-revoke',
          },
        },
      ),
    );
  });

  it('requires active same-Workspace targets when revoking', async () => {
    await currentActor('workspace-owner', 'Owner');
    const member = await currentActor('workspace-member', 'Member');
    const company = await registerCompany('Revocation Boundary Company');
    await grantAs('workspace-owner', member.workspaceMembershipId, company.id);
    const revoke = (
      key: string,
      membershipId = member.workspaceMembershipId,
      companyId = company.id,
    ) =>
      fetch(
        `${origin}/api/company-context-assignments/${membershipId}/${companyId}`,
        {
          method: 'DELETE',
          headers: {
            ...identityHeaders('workspace-owner', 'Owner'),
            'idempotency-key': key,
          },
        },
      );

    await pool.query(
      `UPDATE internal_users SET status = 'inactive'
       WHERE id = (SELECT internal_user_id FROM workspace_memberships WHERE id = $1)`,
      [member.workspaceMembershipId],
    );
    await expectForbidden(await revoke('inactive-user-revoke'));
    await pool.query(
      `UPDATE internal_users SET status = 'active'
       WHERE id = (SELECT internal_user_id FROM workspace_memberships WHERE id = $1)`,
      [member.workspaceMembershipId],
    );
    await pool.query(
      "UPDATE workspace_memberships SET status = 'inactive' WHERE id = $1",
      [member.workspaceMembershipId],
    );
    await expectForbidden(await revoke('inactive-membership-revoke'));
    await pool.query(
      "UPDATE workspace_memberships SET status = 'active' WHERE id = $1",
      [member.workspaceMembershipId],
    );
    await pool.query("UPDATE companies SET status = 'inactive' WHERE id = $1", [
      company.id,
    ]);
    await expectForbidden(await revoke('inactive-company-revoke'));
    await pool.query("UPDATE companies SET status = 'active' WHERE id = $1", [
      company.id,
    ]);
    await expectForbidden(
      await revoke(
        'unknown-target-revoke',
        '00000000-0000-4000-8000-000000000099',
      ),
    );
  });

  it('rolls back grant and revoke when their Activity Log event cannot be recorded', async () => {
    await currentActor('workspace-owner', 'Owner');
    const member = await currentActor('workspace-member', 'Member');
    const company = await registerCompany('Atomic Company');
    await installAssignmentEventFailureTrigger();

    const failedGrant = await grantAs(
      'workspace-owner',
      member.workspaceMembershipId,
      company.id,
    );
    expect(failedGrant.status).toBe(500);
    await expect(
      activeAssignmentCount(member.workspaceMembershipId, company.id),
    ).resolves.toBe('0');

    await removeAssignmentEventFailureTrigger();
    expect(
      (
        await grantAs(
          'workspace-owner',
          member.workspaceMembershipId,
          company.id,
        )
      ).status,
    ).toBe(201);
    await installAssignmentEventFailureTrigger();

    const failedRevoke = await fetch(
      `${origin}/api/company-context-assignments/${member.workspaceMembershipId}/${company.id}`,
      {
        method: 'DELETE',
        headers: {
          ...identityHeaders('workspace-owner', 'Owner'),
          'idempotency-key': 'rollback-revoke',
        },
      },
    );
    expect(failedRevoke.status).toBe(500);
    await expect(
      activeAssignmentCount(member.workspaceMembershipId, company.id),
    ).resolves.toBe('1');
    await removeAssignmentEventFailureTrigger();
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

  function grantAs(
    subject: string,
    workspaceMembershipId: string,
    companyId: string,
  ) {
    return fetch(`${origin}/api/company-context-assignments`, {
      method: 'POST',
      headers: {
        ...identityHeaders(subject, subject),
        'content-type': 'application/json',
        'idempotency-key': `test-command-${++commandSequence}`,
      },
      body: JSON.stringify({ workspaceMembershipId, companyId }),
    });
  }

  async function expectForbidden(response: Response) {
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Forbidden',
      statusCode: 403,
    });
  }

  async function activeAssignmentCount(
    workspaceMembershipId: string,
    companyId: string,
  ) {
    const result = await pool.query<{ count: string }>(
      `SELECT count(*) FROM company_role_assignments
       WHERE workspace_membership_id = $1 AND company_id = $2 AND revoked_at IS NULL`,
      [workspaceMembershipId, companyId],
    );
    return result.rows[0]!.count;
  }

  async function installAssignmentEventFailureTrigger() {
    await pool.query(`
      CREATE OR REPLACE FUNCTION reject_assignment_activity_log_insert()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.action::text LIKE 'company_context_assignment.%' THEN
          RAISE EXCEPTION 'forced assignment Activity Log failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_assignment_activity_log_insert
      BEFORE INSERT ON activity_log_events
      FOR EACH ROW EXECUTE FUNCTION reject_assignment_activity_log_insert();
    `);
  }

  async function removeAssignmentEventFailureTrigger() {
    await pool.query(`
      DROP TRIGGER IF EXISTS reject_assignment_activity_log_insert ON activity_log_events;
      DROP FUNCTION IF EXISTS reject_assignment_activity_log_insert();
    `);
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
