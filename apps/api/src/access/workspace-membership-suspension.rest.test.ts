import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000101';

describeWithPostgres('Workspace Membership suspension REST API', () => {
  let harness: PostgresRestTestHarness;
  let origin: string;
  let pool: Pool;
  let commandSequence = 0;

  beforeAll(async () => {
    if (!databaseUrl) {
      throw new Error('TEST_DATABASE_URL is required to start this suite.');
    }
    harness = await createPostgresRestTestHarness({
      databaseUrl,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'workspace-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Suspension Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          {
            provider: 'deterministic-test',
            subject: 'workspace-member',
            workspaceId: WORKSPACE_ID,
          },
          {
            provider: 'deterministic-test',
            subject: 'workspace-company-manager',
            workspaceId: WORKSPACE_ID,
          },
        ]),
      },
    });
    ({ origin, pool } = harness);
  });

  beforeEach(async () => {
    commandSequence = 0;
    await pool.query(
      'TRUNCATE activity_log_events, workspace_membership_suspension_commands, company_context_assignment_commands, company_role_assignments, companies, workspace_permission_grants, workspace_memberships, internal_users, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await harness?.close();
  });

  it('suspends non-destructively, denies the next request, and collapses exact retries into one event', async () => {
    const owner = await currentActor('workspace-owner', 'Workspace Owner');
    const member = await currentActor('workspace-member', 'Workspace Member');
    const company = await registerCompany('Preserved Company');
    const assignment = await grantCompanyAccess(
      member.workspaceMembershipId,
      company.id,
    );
    const preservedBefore = await preservedCounts(member.workspaceMembershipId);

    const suspend = () =>
      suspendAs(
        'workspace-owner',
        member.workspaceMembershipId,
        'suspend-member-once',
      );
    const responses = await Promise.all([suspend(), suspend()]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const results = await Promise.all(
      responses.map((response) => response.json()),
    );
    expect(results[0]).toEqual({
      workspaceMembershipId: member.workspaceMembershipId,
      status: 'inactive',
    });
    expect(results[1]).toEqual(results[0]);

    const deniedActor = await fetch(`${origin}/api/access/current-actor`, {
      headers: identityHeaders('workspace-member', 'Workspace Member'),
    });
    await expectForbidden(deniedActor);
    const deniedCompanies = await fetch(`${origin}/api/companies`, {
      headers: identityHeaders('workspace-member', 'Workspace Member'),
    });
    await expectForbidden(deniedCompanies);

    const preservedAfter = await preservedCounts(member.workspaceMembershipId);
    expect(preservedAfter).toEqual({
      ...preservedBefore,
      membershipStatus: 'inactive',
      historical_event_count: String(
        Number(preservedBefore.historical_event_count) + 1,
      ),
    });
    expect(preservedAfter.assignmentId).toBe(assignment.id);

    const audit = await pool.query<{
      action: string;
      actor_internal_user_id: string;
      actor_workspace_membership_id: string;
      target_internal_user_id: string;
      target_workspace_membership_id: string;
      metadata: Record<string, never>;
    }>(
      `SELECT action, actor_internal_user_id, actor_workspace_membership_id,
        target_internal_user_id, target_workspace_membership_id, metadata
       FROM activity_log_events
       WHERE action::text = 'workspace_membership.suspended'`,
    );
    expect(audit.rows).toEqual([
      {
        action: 'workspace_membership.suspended',
        actor_internal_user_id: owner.internalUserId,
        actor_workspace_membership_id: owner.workspaceMembershipId,
        target_internal_user_id: member.internalUserId,
        target_workspace_membership_id: member.workspaceMembershipId,
        metadata: {},
      },
    ]);
    const commands = await pool.query<{ count: string }>(
      'SELECT count(*) FROM workspace_membership_suspension_commands',
    );
    expect(commands.rows[0]).toEqual({ count: '1' });

    const mismatchedReplay = await suspendAs(
      'workspace-owner',
      owner.workspaceMembershipId,
      'suspend-member-once',
    );
    expect(mismatchedReplay.status).toBe(400);
    await expect(mismatchedReplay.json()).resolves.toEqual({
      message: 'Idempotency-Key was already used for another suspension.',
      error: 'Bad Request',
      statusCode: 400,
    });

    const activityResponse = await fetch(`${origin}/api/activity-log`, {
      headers: identityHeaders('workspace-owner', 'Workspace Owner'),
    });
    expect(activityResponse.status).toBe(200);
    await expect(activityResponse.json()).resolves.toMatchObject({
      events: expect.arrayContaining([
        expect.objectContaining({
          action: 'workspace_membership.suspended',
          target: {
            type: 'workspace_membership',
            workspaceMembershipId: member.workspaceMembershipId,
            internalUserId: member.internalUserId,
            displayName: 'Workspace Member',
          },
        }),
      ]),
    });
  });

  it('protects the last active holder of access-administration authority under concurrent suspensions', async () => {
    const owner = await currentActor('workspace-owner', 'Workspace Owner');

    await expectForbidden(
      await suspendAs(
        'workspace-owner',
        owner.workspaceMembershipId,
        'last-holder-self-suspension',
      ),
    );

    const member = await currentActor('workspace-member', 'Workspace Member');
    await pool.query(
      `INSERT INTO workspace_permission_grants (
         workspace_id, workspace_membership_id, permission
       ) VALUES ($1, $2, 'company.assignment.manage')`,
      [owner.workspaceId, member.workspaceMembershipId],
    );

    const [ownerAttempt, memberAttempt] = await Promise.all([
      suspendAs(
        'workspace-owner',
        member.workspaceMembershipId,
        'owner-suspends-member',
      ),
      suspendAs(
        'workspace-member',
        owner.workspaceMembershipId,
        'member-suspends-owner',
      ),
    ]);
    expect([ownerAttempt.status, memberAttempt.status].sort()).toEqual([
      201, 403,
    ]);

    const activeHolders = await pool.query<{ count: string }>(
      `SELECT count(DISTINCT grant_row.workspace_membership_id)
       FROM workspace_permission_grants AS grant_row
       INNER JOIN workspace_memberships AS membership
         ON membership.workspace_id = grant_row.workspace_id
         AND membership.id = grant_row.workspace_membership_id
       INNER JOIN internal_users AS internal_user
         ON internal_user.id = membership.internal_user_id
       WHERE grant_row.workspace_id = $1
         AND grant_row.permission = 'company.assignment.manage'
         AND membership.status = 'active'
         AND internal_user.status = 'active'`,
      [owner.workspaceId],
    );
    expect(activeHolders.rows[0]).toEqual({ count: '1' });
    const transitionCounts = await pool.query<{
      commands: string;
      events: string;
    }>(
      `SELECT
        (SELECT count(*) FROM workspace_membership_suspension_commands) AS commands,
        (SELECT count(*) FROM activity_log_events
          WHERE action::text = 'workspace_membership.suspended') AS events`,
    );
    expect(transitionCounts.rows[0]).toEqual({ commands: '1', events: '1' });
  });

  it('shows suspension events only to actors who can administer Workspace access', async () => {
    const owner = await currentActor('workspace-owner', 'Workspace Owner');
    const member = await currentActor('workspace-member', 'Workspace Member');
    const companyManager = await currentActor(
      'workspace-company-manager',
      'Workspace Company Manager',
    );
    await pool.query(
      `INSERT INTO workspace_permission_grants (
         workspace_id, workspace_membership_id, permission
       ) VALUES ($1, $2, 'company.manage')`,
      [owner.workspaceId, companyManager.workspaceMembershipId],
    );
    expect(
      (
        await suspendAs(
          'workspace-owner',
          member.workspaceMembershipId,
          'suspension-visibility',
        )
      ).status,
    ).toBe(201);

    const managerActivity = await fetch(`${origin}/api/activity-log`, {
      headers: identityHeaders(
        'workspace-company-manager',
        'Workspace Company Manager',
      ),
    });
    expect(managerActivity.status).toBe(200);
    await expect(managerActivity.json()).resolves.not.toMatchObject({
      events: expect.arrayContaining([
        expect.objectContaining({
          action: 'workspace_membership.suspended',
        }),
      ]),
    });

    await pool.query(
      `INSERT INTO workspace_permission_grants (
         workspace_id, workspace_membership_id, permission
       ) VALUES ($1, $2, 'company.assignment.manage')`,
      [owner.workspaceId, companyManager.workspaceMembershipId],
    );
    const accessManagerActivity = await fetch(`${origin}/api/activity-log`, {
      headers: identityHeaders(
        'workspace-company-manager',
        'Workspace Company Manager',
      ),
    });
    expect(accessManagerActivity.status).toBe(200);
    await expect(accessManagerActivity.json()).resolves.toMatchObject({
      events: expect.arrayContaining([
        expect.objectContaining({
          action: 'workspace_membership.suspended',
        }),
      ]),
    });
  });

  it('serializes distinct commands that concurrently target the same Membership', async () => {
    await currentActor('workspace-owner', 'Workspace Owner');
    const member = await currentActor('workspace-member', 'Workspace Member');

    const responses = await Promise.all([
      suspendAs(
        'workspace-owner',
        member.workspaceMembershipId,
        'distinct-suspension-a',
      ),
      suspendAs(
        'workspace-owner',
        member.workspaceMembershipId,
        'distinct-suspension-b',
      ),
    ]);

    expect(responses.map(({ status }) => status).sort()).toEqual([201, 403]);
    const transitionCounts = await pool.query<{
      commands: string;
      events: string;
    }>(
      `SELECT
        (SELECT count(*) FROM workspace_membership_suspension_commands) AS commands,
        (SELECT count(*) FROM activity_log_events
          WHERE action::text = 'workspace_membership.suspended') AS events`,
    );
    expect(transitionCounts.rows[0]).toEqual({ commands: '1', events: '1' });
  });

  it('denies an actor whose Membership or Internal User is inactive', async () => {
    const owner = await currentActor('workspace-owner', 'Workspace Owner');
    const member = await currentActor('workspace-member', 'Workspace Member');
    await pool.query(
      `INSERT INTO workspace_permission_grants (
         workspace_id, workspace_membership_id, permission
       ) VALUES ($1, $2, 'company.assignment.manage')`,
      [owner.workspaceId, member.workspaceMembershipId],
    );

    await pool.query(
      "UPDATE workspace_memberships SET status = 'inactive' WHERE id = $1",
      [member.workspaceMembershipId],
    );
    await expectForbidden(
      await suspendAs(
        'workspace-member',
        owner.workspaceMembershipId,
        'inactive-actor-membership',
      ),
    );

    await pool.query(
      "UPDATE workspace_memberships SET status = 'active' WHERE id = $1",
      [member.workspaceMembershipId],
    );
    await pool.query(
      "UPDATE internal_users SET status = 'inactive' WHERE id = $1",
      [member.internalUserId],
    );
    await expectForbidden(
      await suspendAs(
        'workspace-member',
        owner.workspaceMembershipId,
        'inactive-actor-user',
      ),
    );

    const unchanged = await pool.query<{
      commands: string;
      events: string;
      owner_status: string;
    }>(
      `SELECT
        (SELECT count(*) FROM workspace_membership_suspension_commands) AS commands,
        (SELECT count(*) FROM activity_log_events
          WHERE action::text = 'workspace_membership.suspended') AS events,
        membership.status AS owner_status
       FROM workspace_memberships AS membership
       WHERE membership.id = $1`,
      [owner.workspaceMembershipId],
    );
    expect(unchanged.rows[0]).toEqual({
      commands: '0',
      events: '0',
      owner_status: 'active',
    });
  });

  it('uses one safe denial for unauthorized, inactive, unknown, and cross-Workspace targets', async () => {
    const owner = await currentActor('workspace-owner', 'Workspace Owner');
    const member = await currentActor('workspace-member', 'Workspace Member');
    const unknownId = '00000000-0000-4000-8000-000000000099';

    await expectForbidden(
      await suspendAs(
        'workspace-member',
        owner.workspaceMembershipId,
        'unauthorized-suspension',
      ),
    );
    await expectForbidden(
      await suspendAs('workspace-owner', unknownId, 'unknown-suspension'),
    );

    await pool.query(
      "UPDATE workspace_memberships SET status = 'inactive' WHERE id = $1",
      [member.workspaceMembershipId],
    );
    await expectForbidden(
      await suspendAs(
        'workspace-owner',
        member.workspaceMembershipId,
        'inactive-membership-suspension',
      ),
    );
    await pool.query(
      "UPDATE workspace_memberships SET status = 'active' WHERE id = $1",
      [member.workspaceMembershipId],
    );
    await pool.query(
      "UPDATE internal_users SET status = 'inactive' WHERE id = $1",
      [member.internalUserId],
    );
    await expectForbidden(
      await suspendAs(
        'workspace-owner',
        member.workspaceMembershipId,
        'inactive-user-suspension',
      ),
    );
    await pool.query(
      "UPDATE internal_users SET status = 'active' WHERE id = $1",
      [member.internalUserId],
    );

    const foreignWorkspace = await pool.query<{ id: string }>(
      `INSERT INTO workspaces (id, name)
       VALUES ('00000000-0000-4000-8000-000000000102', 'Foreign Workspace')
       RETURNING id`,
    );
    const foreignUser = await pool.query<{ id: string }>(
      `INSERT INTO internal_users (
         external_provider, external_subject, display_name, email
       ) VALUES ('deterministic-test', 'foreign-suspension-member',
         'Foreign Member', 'foreign-member@example.test')
       RETURNING id`,
    );
    const foreignMembership = await pool.query<{ id: string }>(
      `INSERT INTO workspace_memberships (workspace_id, internal_user_id)
       VALUES ($1, $2)
       RETURNING id`,
      [foreignWorkspace.rows[0]!.id, foreignUser.rows[0]!.id],
    );
    await expectForbidden(
      await suspendAs(
        'workspace-owner',
        foreignMembership.rows[0]!.id,
        'foreign-suspension',
      ),
    );

    const unchanged = await pool.query<{
      commands: string;
      events: string;
      active_member: boolean;
    }>(
      `SELECT
        (SELECT count(*) FROM workspace_membership_suspension_commands) AS commands,
        (SELECT count(*) FROM activity_log_events
          WHERE action::text = 'workspace_membership.suspended') AS events,
        (SELECT status = 'active' FROM workspace_memberships WHERE id = $1) AS active_member`,
      [member.workspaceMembershipId],
    );
    expect(unchanged.rows[0]).toEqual({
      commands: '0',
      events: '0',
      active_member: true,
    });
  });

  it('revalidates stale actor authority after acquiring the Workspace lock', async () => {
    await currentActor('workspace-owner', 'Workspace Owner');
    const staleActor = await currentActor(
      'workspace-member',
      'Workspace Administrator',
    );
    const target = await currentActor(
      'workspace-company-manager',
      'Workspace Member',
    );
    await pool.query(
      `INSERT INTO workspace_permission_grants (
         workspace_id, workspace_membership_id, permission
       ) VALUES ($1, $2, 'company.assignment.manage')`,
      [staleActor.workspaceId, staleActor.workspaceMembershipId],
    );
    const blocker = await pool.connect();
    try {
      await blocker.query('BEGIN');
      const blockerBackend = await blocker.query<{ pid: number }>(
        'SELECT pg_backend_pid() AS pid',
      );
      await blocker.query(
        'SELECT id FROM workspaces WHERE id = $1 FOR NO KEY UPDATE',
        [staleActor.workspaceId],
      );
      const request = suspendAs(
        'workspace-member',
        target.workspaceMembershipId,
        'stale-actor-suspension',
      );
      await waitForWorkspaceLock(blockerBackend.rows[0]!.pid);
      const revoked = await pool.query(
        `DELETE FROM workspace_permission_grants
         WHERE workspace_id = $1
           AND workspace_membership_id = $2
           AND permission = 'company.assignment.manage'`,
        [staleActor.workspaceId, staleActor.workspaceMembershipId],
      );
      expect(revoked.rowCount).toBe(1);
      await blocker.query('COMMIT');

      await expectForbidden(await request);
      const targetState = await pool.query<{ status: string }>(
        'SELECT status FROM workspace_memberships WHERE id = $1',
        [target.workspaceMembershipId],
      );
      expect(targetState.rows[0]).toEqual({ status: 'active' });
    } finally {
      await blocker.query('ROLLBACK');
      blocker.release();
    }
  });

  it('rolls back the command and Membership transition when Activity Log persistence fails', async () => {
    await currentActor('workspace-owner', 'Workspace Owner');
    const member = await currentActor('workspace-member', 'Workspace Member');
    await pool.query(`
      CREATE FUNCTION reject_suspension_activity_log_insert()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.action::text = 'workspace_membership.suspended' THEN
          RAISE EXCEPTION 'forced suspension Activity Log failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_suspension_activity_log_insert
      BEFORE INSERT ON activity_log_events
      FOR EACH ROW EXECUTE FUNCTION reject_suspension_activity_log_insert();
    `);
    try {
      const response = await suspendAs(
        'workspace-owner',
        member.workspaceMembershipId,
        'atomic-suspension',
      );
      expect(response.status).toBe(500);
      const rolledBack = await pool.query<{
        status: string;
        commands: string;
        events: string;
      }>(
        `SELECT membership.status,
          (SELECT count(*) FROM workspace_membership_suspension_commands) AS commands,
          (SELECT count(*) FROM activity_log_events
            WHERE action::text = 'workspace_membership.suspended') AS events
         FROM workspace_memberships AS membership
         WHERE membership.id = $1`,
        [member.workspaceMembershipId],
      );
      expect(rolledBack.rows[0]).toEqual({
        status: 'active',
        commands: '0',
        events: '0',
      });
    } finally {
      await pool.query(`
        DROP TRIGGER IF EXISTS reject_suspension_activity_log_insert ON activity_log_events;
        DROP FUNCTION IF EXISTS reject_suspension_activity_log_insert();
      `);
    }
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
        'idempotency-key': `register-${++commandSequence}`,
      },
      body: JSON.stringify({ displayName }),
    });
    expect(response.status).toBe(201);
    return response.json();
  }

  async function grantCompanyAccess(
    workspaceMembershipId: string,
    companyId: string,
  ) {
    const response = await fetch(`${origin}/api/company-context-assignments`, {
      method: 'POST',
      headers: {
        ...identityHeaders('workspace-owner', 'Workspace Owner'),
        'content-type': 'application/json',
        'idempotency-key': `grant-${++commandSequence}`,
      },
      body: JSON.stringify({ workspaceMembershipId, companyId }),
    });
    expect(response.status).toBe(201);
    return response.json();
  }

  function suspendAs(
    subject: string,
    workspaceMembershipId: string,
    idempotencyKey: string,
  ) {
    return fetch(`${origin}/api/workspace-membership-suspensions`, {
      method: 'POST',
      headers: {
        ...identityHeaders(subject, subject),
        'content-type': 'application/json',
        'idempotency-key': idempotencyKey,
      },
      body: JSON.stringify({ workspaceMembershipId }),
    });
  }

  async function preservedCounts(workspaceMembershipId: string) {
    const result = await pool.query<{
      internal_user_id: string;
      membership_id: string;
      membershipStatus: string;
      assignmentId: string;
      assignment_count: string;
      historical_event_count: string;
    }>(
      `SELECT membership.internal_user_id, membership.id AS membership_id,
        membership.status AS "membershipStatus",
        min(assignment.id::text) AS "assignmentId",
        count(DISTINCT assignment.id) AS assignment_count,
        (SELECT count(*) FROM activity_log_events
          WHERE workspace_id = membership.workspace_id) AS historical_event_count
       FROM workspace_memberships AS membership
       LEFT JOIN company_role_assignments AS assignment
         ON assignment.workspace_id = membership.workspace_id
         AND assignment.workspace_membership_id = membership.id
       WHERE membership.id = $1
       GROUP BY membership.workspace_id, membership.internal_user_id,
         membership.id, membership.status`,
      [workspaceMembershipId],
    );
    return result.rows[0]!;
  }

  async function waitForWorkspaceLock(blockingPid: number) {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const blocked = await pool.query<{ blocked: boolean }>(
        `SELECT EXISTS (
           SELECT 1 FROM pg_stat_activity
           WHERE datname = current_database()
             AND pid <> pg_backend_pid()
             AND $1::integer = ANY(pg_blocking_pids(pid))
         ) AS blocked`,
        [blockingPid],
      );
      if (blocked.rows[0]?.blocked) return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error('The suspension did not reach the Workspace lock barrier.');
  }
});

async function expectForbidden(response: Response) {
  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toEqual({
    message: 'Forbidden',
    statusCode: 403,
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
