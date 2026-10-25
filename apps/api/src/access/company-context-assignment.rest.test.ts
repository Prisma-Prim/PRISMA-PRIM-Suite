import { setTimeout as delay } from 'node:timers/promises';
import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000091';

describeWithPostgres('Company Context Access assignments REST API', () => {
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
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Assignment Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          {
            provider: 'deterministic-test',
            subject: 'workspace-member',
            workspaceId: WORKSPACE_ID,
          },
        ]),
      },
    });
    ({ origin, pool } = harness);
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE activity_log_events, company_role_assignments, companies, workspace_permission_grants, workspace_memberships, internal_users, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await harness?.close();
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

    const malformedSelection = await fetch(
      `${origin}/api/access/current-actor`,
      {
        headers: {
          ...identityHeaders('workspace-member', 'Member'),
          'x-company-context-id': 'not-a-company-id',
        },
      },
    );
    expect(malformedSelection.status).toBe(403);
    await expect(malformedSelection.json()).resolves.toEqual({
      message: 'Forbidden',
      statusCode: 403,
    });

    const emptySelection = await fetch(`${origin}/api/access/current-actor`, {
      headers: {
        ...identityHeaders('workspace-member', 'Member'),
        'x-company-context-id': '',
      },
    });
    expect(emptySelection.status).toBe(403);
    await expect(emptySelection.json()).resolves.toEqual({
      message: 'Forbidden',
      statusCode: 403,
    });

    const selected = await fetch(`${origin}/api/access/current-actor`, {
      headers: {
        ...identityHeaders('workspace-member', 'Member'),
        'x-company-context-id': company.id,
      },
    });
    expect(selected.status).toBe(200);
    await expect(selected.json()).resolves.toMatchObject({
      activeCompany: {
        id: company.id,
        displayName: company.displayName,
      },
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

  it('lists unversioned, single-version and historical captures without changing their records', async () => {
    await currentActor('workspace-owner', 'Owner');
    const member = await currentActor('workspace-member', 'Member');
    const company = await registerCompany('Historical Assignment Company');
    const workspaceMembershipId: unknown = member.workspaceMembershipId;
    const companyId: unknown = company.id;
    if (
      typeof workspaceMembershipId !== 'string' ||
      typeof companyId !== 'string'
    )
      throw new Error('The synthetic assignment target was not created.');

    const assignments = await pool.query<{
      id: string;
      bundle: string;
      permission_set_version: string | null;
    }>(
      `INSERT INTO company_role_assignments
         (workspace_id, workspace_membership_id, company_id, bundle, permission_set_version)
       VALUES ($1, $2, $3, 'company_context_access', NULL),
              ($1, $2, $3, 'company_task_manager', 'v1'),
              ($1, $2, $3, 'company_document_registrar', 'v1')
       RETURNING id, bundle, permission_set_version`,
      [WORKSPACE_ID, workspaceMembershipId, companyId],
    );
    const response = await fetch(
      `${origin}/api/company-context-assignments/administration`,
      { headers: identityHeaders('workspace-owner', 'Owner') },
    );
    expect(response.status).toBe(200);
    const state: unknown = await response.json();
    expect(state).toMatchObject({
      assignments: expect.arrayContaining([
        {
          id: assignments.rows.find(
            (row) => row.bundle === 'company_context_access',
          )?.id,
          workspaceMembershipId,
          companyId,
          bundle: 'Company Context Access',
          permissionSetVersion: null,
          active: true,
        },
        {
          id: assignments.rows.find(
            (row) => row.bundle === 'company_task_manager',
          )?.id,
          workspaceMembershipId,
          companyId,
          bundle: 'Company Task Manager',
          permissionSetVersion: 'v1',
          active: true,
        },
        {
          id: assignments.rows.find(
            (row) => row.bundle === 'company_document_registrar',
          )?.id,
          workspaceMembershipId,
          companyId,
          bundle: 'Company Document Registrar',
          permissionSetVersion: 'v1',
          active: true,
        },
      ]),
    });
  });

  it('keeps a historical grant receipt unchanged after an explicit revoke and fresh capture', async () => {
    await currentActor('workspace-owner', 'Owner');
    const member = await currentActor('workspace-member', 'Member');
    const company = await registerCompany('Historical Receipt Company');
    const workspaceMembershipId: unknown = member.workspaceMembershipId;
    const companyId: unknown = company.id;
    if (
      typeof workspaceMembershipId !== 'string' ||
      typeof companyId !== 'string'
    )
      throw new Error('The synthetic assignment target was not created.');
    const historicalRecord = {
      id: '11111111-1111-4111-8111-111111111184',
      workspaceMembershipId,
      companyId,
      bundle: 'Company Document Registrar',
      permissionSetVersion: 'v1',
      active: true,
    };
    await pool.query(
      `INSERT INTO company_role_assignments
         (id, workspace_id, workspace_membership_id, company_id, bundle, permission_set_version)
       VALUES ($1, $2, $3, $4, 'company_document_registrar', 'v1')`,
      [historicalRecord.id, WORKSPACE_ID, workspaceMembershipId, companyId],
    );

    async function command(method: 'POST' | 'DELETE', key: string) {
      const path = '/api/company-document-registrar-assignments';
      const target =
        method === 'DELETE'
          ? `${path}/${workspaceMembershipId}/${companyId}`
          : path;
      const response = await fetch(`${origin}${target}`, {
        method,
        headers: {
          ...identityHeaders('workspace-owner', 'Owner'),
          'content-type': 'application/json',
          'idempotency-key': key,
        },
        body:
          method === 'POST'
            ? JSON.stringify({ workspaceMembershipId, companyId })
            : undefined,
      });
      expect(response.status).toBe(method === 'POST' ? 201 : 200);
      const record: unknown = await response.json();
      return record;
    }

    expect(await command('POST', 'historical-repeat')).toEqual(
      historicalRecord,
    );
    expect(await command('POST', 'historical-second-repeat')).toEqual(
      historicalRecord,
    );
    expect(await command('POST', 'historical-repeat')).toEqual(
      historicalRecord,
    );
    const revokedRecord = { ...historicalRecord, active: false };
    expect(await command('DELETE', 'historical-revoke')).toEqual(revokedRecord);
    const freshRecord = await command('POST', 'historical-fresh');
    expect(freshRecord).toMatchObject({
      workspaceMembershipId,
      companyId,
      bundle: 'Company Document Registrar',
      permissionSetVersion: 'v3',
      active: true,
    });
    expect(freshRecord).not.toMatchObject({ id: historicalRecord.id });
    expect(await command('POST', 'historical-repeat')).toEqual(
      historicalRecord,
    );
    expect(await command('DELETE', 'historical-revoke')).toEqual(revokedRecord);

    const administration = await fetch(
      `${origin}/api/company-context-assignments/administration`,
      { headers: identityHeaders('workspace-owner', 'Owner') },
    );
    expect(administration.status).toBe(200);
    const state: unknown = await administration.json();
    expect(state).toMatchObject({ assignments: [freshRecord] });
    const events = await pool.query<{ action: string; metadata: unknown }>(
      `SELECT action, metadata FROM activity_log_events
       WHERE action::text LIKE 'company_document_registrar_assignment.%'
       ORDER BY occurred_at, id`,
    );
    expect(events.rows).toEqual([
      {
        action: 'company_document_registrar_assignment.revoked',
        metadata: { bundle: 'Company Document Registrar' },
      },
      {
        action: 'company_document_registrar_assignment.granted',
        metadata: { bundle: 'Company Document Registrar' },
      },
    ]);
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

  it('canonicalizes UUID casing for idempotent grant and revoke replays', async () => {
    await currentActor('workspace-owner', 'Owner');
    const member = await currentActor('workspace-member', 'Member');
    const company = await registerCompany('Canonical UUID Company');
    const upperMembershipId = member.workspaceMembershipId.toUpperCase();
    const upperCompanyId = company.id.toUpperCase();

    const firstGrant = await fetch(
      `${origin}/api/company-context-assignments`,
      {
        method: 'POST',
        headers: {
          ...identityHeaders('workspace-owner', 'Owner'),
          'content-type': 'application/json',
          'idempotency-key': 'canonical-uuid-grant',
        },
        body: JSON.stringify({
          workspaceMembershipId: upperMembershipId,
          companyId: upperCompanyId,
        }),
      },
    );
    expect(firstGrant.status).toBe(201);
    const granted = await firstGrant.json();

    const replayGrant = await fetch(
      `${origin}/api/company-context-assignments`,
      {
        method: 'POST',
        headers: {
          ...identityHeaders('workspace-owner', 'Owner'),
          'content-type': 'application/json',
          'idempotency-key': 'canonical-uuid-grant',
        },
        body: JSON.stringify({
          workspaceMembershipId: member.workspaceMembershipId,
          companyId: company.id,
        }),
      },
    );
    expect(replayGrant.status).toBe(201);
    await expect(replayGrant.json()).resolves.toEqual(granted);

    const firstRevoke = await fetch(
      `${origin}/api/company-context-assignments/${upperMembershipId}/${upperCompanyId}`,
      {
        method: 'DELETE',
        headers: {
          ...identityHeaders('workspace-owner', 'Owner'),
          'idempotency-key': 'canonical-uuid-revoke',
        },
      },
    );
    expect(firstRevoke.status).toBe(200);
    const revoked = await firstRevoke.json();

    const replayRevoke = await fetch(
      `${origin}/api/company-context-assignments/${member.workspaceMembershipId}/${company.id}`,
      {
        method: 'DELETE',
        headers: {
          ...identityHeaders('workspace-owner', 'Owner'),
          'idempotency-key': 'canonical-uuid-revoke',
        },
      },
    );
    expect(replayRevoke.status).toBe(200);
    await expect(replayRevoke.json()).resolves.toEqual(revoked);
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

  it.each(['grant', 'revoke'])(
    'serializes a distinct %s behind a pending grant for the same target',
    async (operation) => {
      await currentActor('workspace-owner', 'Owner');
      const member = await currentActor('workspace-member', 'Member');
      const company = await registerCompany('Serialized Assignments');
      const control = await pool.connect();
      const pending: Promise<Response>[] = [];
      const advisoryLock = 90_867_531;
      await pool.query(`
        CREATE FUNCTION pause_first_assignment_command() RETURNS trigger AS $$
        BEGIN
          IF NEW.idempotency_key = 'serialize-first-grant' THEN
            PERFORM pg_advisory_xact_lock(${advisoryLock});
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER pause_first_assignment_command
        BEFORE INSERT ON company_context_assignment_commands
        FOR EACH ROW EXECUTE FUNCTION pause_first_assignment_command();
      `);
      const grant = (key: string) =>
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
      try {
        await control.query('BEGIN');
        await control.query('SELECT pg_advisory_xact_lock($1)', [advisoryLock]);
        const first = grant('serialize-first-grant');
        pending.push(first);
        const firstPid = await waitForBlockedAssignmentInsert();
        let secondSettled = false;
        const second = (
          operation === 'grant'
            ? grant('serialize-second-grant')
            : fetch(
                `${origin}/api/company-context-assignments/${member.workspaceMembershipId}/${company.id}`,
                {
                  method: 'DELETE',
                  headers: {
                    ...identityHeaders('workspace-owner', 'Owner'),
                    'idempotency-key': 'serialize-second-revoke',
                  },
                },
              )
        ).finally(() => {
          secondSettled = true;
        });
        pending.push(second);
        let serialized = false;
        for (let attempt = 0; attempt < 100 && !secondSettled; attempt += 1) {
          const result = await pool.query<{ blocked: boolean }>(
            `SELECT EXISTS (
               SELECT 1 FROM pg_stat_activity
               WHERE datname=current_database() AND wait_event_type='Lock'
                 AND $1 = ANY(pg_blocking_pids(pid))
             ) AS blocked`,
            [firstPid],
          );
          if (result.rows[0]?.blocked) {
            serialized = true;
            break;
          }
          await delay(10);
        }
        expect(serialized).toBe(true);
        await control.query('COMMIT');
        const responses = await Promise.all([first, second]);
        expect(responses.map((response) => response.status)).toEqual([
          201,
          operation === 'grant' ? 201 : 200,
        ]);
        expect(
          await activeAssignmentCount(member.workspaceMembershipId, company.id),
        ).toBe(operation === 'grant' ? '1' : '0');
        const events = await pool.query<{ action: string }>(
          `SELECT action FROM activity_log_events
           WHERE action::text LIKE 'company_context_assignment.%'
           ORDER BY occurred_at, id`,
        );
        expect(events.rows.map((event) => event.action)).toEqual(
          operation === 'grant'
            ? ['company_context_assignment.granted']
            : [
                'company_context_assignment.granted',
                'company_context_assignment.revoked',
              ],
        );
      } finally {
        await control.query('ROLLBACK');
        control.release();
        await Promise.allSettled(pending);
        await pool.query(
          'DROP TRIGGER pause_first_assignment_command ON company_context_assignment_commands',
        );
        await pool.query('DROP FUNCTION pause_first_assignment_command()');
      }
    },
  );

  async function waitForBlockedAssignmentInsert() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const blocked = await pool.query<{ pid: number }>(`
        SELECT pid FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event = 'advisory'
          AND query ILIKE '%company_context_assignment_commands%'
      `);
      const [row] = blocked.rows;
      if (blocked.rows.length === 1 && row) return row.pid;
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
    const workspaceId = (await currentActor('workspace-owner', 'Owner'))
      .workspaceId;
    const commands = await pool.query<{ id: string }>(
      `SELECT id FROM company_context_assignment_commands
       WHERE workspace_id = $1`,
      [workspaceId],
    );
    expect(commands.rows).toHaveLength(9);
    const auditedCommands = await pool.query<{ count: string }>(
      `SELECT count(*) FROM company_context_assignment_commands AS command
       INNER JOIN activity_log_events AS event
         ON split_part(event.idempotency_key, ':', 3) = command.id::text
       WHERE command.workspace_id = $1`,
      [workspaceId],
    );
    expect(auditedCommands.rows[0]!.count).toBe('9');
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
      INSERT INTO workspaces (id, name)
      VALUES ('00000000-0000-4000-8000-000000000092', 'Foreign Assignment Workspace')
      RETURNING id
    `);
    const foreignUser = await pool.query<{ id: string }>(
      `INSERT INTO internal_users (
         external_provider, external_subject, display_name, email
       ) VALUES ('deterministic-test', 'foreign-member', 'Foreign Member',
         'foreign-member@example.test')
       RETURNING id`,
    );
    const foreignMembership = await pool.query<{ id: string }>(
      `INSERT INTO workspace_memberships (workspace_id, internal_user_id)
       VALUES ($1, $2)
       RETURNING id`,
      [foreignWorkspace.rows[0]!.id, foreignUser.rows[0]!.id],
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
