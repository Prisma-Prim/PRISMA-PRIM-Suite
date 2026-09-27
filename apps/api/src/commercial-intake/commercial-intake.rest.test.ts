import type { Pool, PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000291';
const withPostgres = databaseUrl ? describe : describe.skip;

withPostgres('Company commercial intake REST', () => {
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let origin: string;
  let pool: Pool;

  async function openHarness(): Promise<void> {
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'workspace-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Commercial Intake Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          {
            provider: 'deterministic-test',
            subject: 'commercial-only-member',
            workspaceId: WORKSPACE_ID,
          },
        ]),
      },
    });
    ({ origin, pool } = harness);
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'commercial_intake',
    });
    await openHarness();
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await harness?.close();
    await database?.close();
  });

  it('creates and reloads one Request with its initial Opportunity and exactly two attributed events', async () => {
    const company = entity(
      await command(
        '/companies',
        { displayName: 'PRISMA-PRIM' },
        'register-company',
      ),
    );
    expect(
      (await request('/commercial-intake/requests', company.id)).status,
    ).toBe(403);
    const actor = actorRecord(
      await (await request('/access/current-actor', company.id)).json(),
    );
    const assignment = await command(
      '/company-commercial-intake-assignments',
      {
        companyId: company.id,
        workspaceMembershipId: actor.workspaceMembershipId,
      },
      'grant-commercial-intake',
    );
    expect(assignment).toMatchObject({
      bundle: 'Company Commercial Intake',
      permissionSetVersion: 'v3',
      active: true,
    });

    const body = {
      originalText:
        'Please help us prepare our internal quality processes before our planned review.',
      sourceLabel: 'Manual entry from a phone request',
      reportedReceivedAt: '2026-09-20T08:15:00.000Z',
      subject: 'Quality process preparation',
      opportunity: {
        title: 'Prepare quality process review',
        scope: 'Initial discussion to identify the requested work',
        nextAction: 'Arrange a qualification call',
      },
    };
    const created = detail(
      await command(
        '/commercial-intake/requests',
        body,
        'create-quality-request',
        company.id,
      ),
    );
    expect(created).toMatchObject({
      companyId: company.id,
      sourceKind: 'MANUAL_TEXT',
      sourceLabel: body.sourceLabel,
      reportedReceivedAt: body.reportedReceivedAt,
      subject: body.subject,
      originalText: body.originalText,
      capturedByWorkspaceMembershipId: actor.workspaceMembershipId,
      version: 1,
      initialOpportunity: {
        title: body.opportunity.title,
        scope: body.opportunity.scope,
        nextAction: body.opportunity.nextAction,
        status: 'OPEN',
        responsibleWorkspaceMembershipId: actor.workspaceMembershipId,
        responsibleActor: {
          workspaceMembershipId: actor.workspaceMembershipId,
          displayName: actor.displayName,
        },
        version: 1,
      },
    });
    expect(created).not.toHaveProperty('workspaceId');
    expect(created).not.toHaveProperty('clientReference');
    expect(typeof created.id).toBe('string');
    expect(typeof created.capturedAt).toBe('string');
    expect(typeof created.initialOpportunity.id).toBe('string');

    const retry = detail(
      await command(
        '/commercial-intake/requests',
        body,
        'create-quality-request',
        company.id,
      ),
    );
    expect(retry).toEqual(created);
    const reloaded = detail(
      await (
        await request(`/commercial-intake/requests/${created.id}`, company.id)
      ).json(),
    );
    expect(reloaded).toEqual(created);
    const listed: unknown = await (
      await request('/commercial-intake/requests', company.id)
    ).json();
    expect(listed).toEqual({
      items: [
        {
          id: created.id,
          subject: body.subject,
          capturedAt: created.capturedAt,
          initialOpportunity: {
            title: body.opportunity.title,
            nextAction: body.opportunity.nextAction,
            responsibleActor: {
              workspaceMembershipId: actor.workspaceMembershipId,
              displayName: actor.displayName,
            },
          },
        },
      ],
    });
    // The list and the detail must project the same responsible actor, so a
    // reader never sees two identities for one initial Opportunity.
    expect(record(reloaded.initialOpportunity).responsibleActor).toEqual(
      listedResponsibleActor(listed, created.id),
    );

    const eventRows = await pool.query<{
      action: string;
      actor_workspace_membership_id: string;
      client_request_id: string;
      opportunity_id: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT action, actor_workspace_membership_id, client_request_id,
              opportunity_id, metadata
       FROM commercial_intake_events
       ORDER BY action`,
    );
    expect(eventRows.rows).toEqual([
      {
        action: 'client_request.created',
        actor_workspace_membership_id: actor.workspaceMembershipId,
        client_request_id: created.id,
        opportunity_id: created.initialOpportunity.id,
        metadata: { requestVersion: 1 },
      },
      {
        action: 'opportunity.created',
        actor_workspace_membership_id: actor.workspaceMembershipId,
        client_request_id: created.id,
        opportunity_id: created.initialOpportunity.id,
        metadata: { opportunityVersion: 1 },
      },
    ]);
    const activity = record(
      await (await request('/activity-log', company.id)).json(),
    );
    const visibleActivity = JSON.stringify(activity.events);
    expect(visibleActivity).not.toContain('client_request.created');
    expect(visibleActivity).not.toContain('opportunity.created');
    expect(visibleActivity).not.toContain(created.id);
    expect(visibleActivity).not.toContain(created.initialOpportunity.id);

    await harness.close();
    await openHarness();
    expect(
      detail(
        await (
          await request(`/commercial-intake/requests/${created.id}`, company.id)
        ).json(),
      ),
    ).toEqual(created);
  });

  it('does not turn Commercial Intake v1 into Company context authority', async () => {
    const company = entity(
      await command(
        '/companies',
        { displayName: 'PRISMA-PRIM' },
        'commercial-only-company',
      ),
    );
    const memberHeaders = {
      'x-test-external-subject': 'commercial-only-member',
      'x-test-display-name': 'Commercial Member',
      'x-test-email': 'commercial-member@example.test',
    };
    const member = actorRecord(
      await (
        await request('/access/current-actor', undefined, {
          headers: memberHeaders,
        })
      ).json(),
    );
    await command(
      '/company-commercial-intake-assignments',
      {
        companyId: company.id,
        workspaceMembershipId: member.workspaceMembershipId,
      },
      'commercial-only-grant',
    );

    expect(
      await (
        await request('/companies', undefined, { headers: memberHeaders })
      ).json(),
    ).toEqual([]);
    expect(
      (
        await request('/access/current-actor', company.id, {
          headers: memberHeaders,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await request('/commercial-intake/requests', company.id, {
          headers: memberHeaders,
        })
      ).status,
    ).toBe(403);

    await command(
      '/company-context-assignments',
      {
        companyId: company.id,
        workspaceMembershipId: member.workspaceMembershipId,
      },
      'commercial-member-context',
    );
    const selected = record(
      await (
        await request('/access/current-actor', company.id, {
          headers: memberHeaders,
        })
      ).json(),
    );
    const activeCompany = record(selected.activeCompany);
    expect(activeCompany.commercialIntakePermissions).toEqual([
      'commercial.request.read',
      'commercial.request.create',
      'commercial.opportunity.read',
      'commercial.opportunity.create',
      'commercial.opportunity.next_action.update',
      'commercial.request.client.associate',
    ]);
    expect(activeCompany.commercialIntakePermissionSetVersion).toBe('v3');
    expect(
      (
        await request('/commercial-intake/requests', company.id, {
          headers: memberHeaders,
        })
      ).status,
    ).toBe(200);

    const unavailable = await request(
      '/commercial-intake/requests',
      company.id,
      {
        method: 'POST',
        headers: {
          ...memberHeaders,
          'content-type': 'application/json',
          'idempotency-key': 'commercial-client-without-read',
        },
        body: JSON.stringify({
          ...representativeBody(),
          clientAccountId: '00000000-0000-4000-8000-000000000995',
        }),
      },
    );
    expect(unavailable.status).toBe(404);
    expect(await unavailable.json()).toEqual({
      code: 'CLIENT_REFERENCE_UNAVAILABLE',
      message: 'Refresh Client search before retrying.',
    });
    const counts = await pool.query<{
      requests: string;
      opportunities: string;
      commands: string;
      events: string;
    }>(
      `SELECT
        (SELECT count(*) FROM client_requests) AS requests,
        (SELECT count(*) FROM opportunities) AS opportunities,
        (SELECT count(*) FROM commercial_intake_commands) AS commands,
        (SELECT count(*) FROM commercial_intake_events) AS events`,
    );
    expect(counts.rows).toEqual([
      { requests: '0', opportunities: '0', commands: '0', events: '0' },
    ]);
    const createdResponse = await postIntakeAs(
      company.id,
      representativeBody(),
      'commercial-restricted-history',
      memberHeaders,
    );
    expect(createdResponse.status).toBe(201);
    const created = detail(await createdResponse.json());
    await expectCommercialIntakeCount(1);
    const recordedEvents = await pool.query<{ count: string }>(
      'SELECT count(*) AS count FROM commercial_intake_events',
    );
    expect(recordedEvents.rows).toEqual([{ count: '2' }]);
    const memberActivity = record(
      await (
        await request('/activity-log', company.id, {
          headers: memberHeaders,
        })
      ).json(),
    );
    const visibleActivity = JSON.stringify(memberActivity.events);
    expect(visibleActivity).not.toContain('client_request.created');
    expect(visibleActivity).not.toContain('opportunity.created');
    expect(visibleActivity).not.toContain(created.id);
    expect(visibleActivity).not.toContain(created.initialOpportunity.id);
  });

  it('revalidates current authority on retry and conflicts on any changed payload', async () => {
    const setup = await prepared();
    const body = representativeBody();
    const created = detail(
      await command(
        '/commercial-intake/requests',
        body,
        'authority-retry',
        setup.company.id,
      ),
    );
    const revoke = await request(
      `/company-commercial-intake-assignments/${setup.actor.workspaceMembershipId}/${setup.company.id}`,
      undefined,
      {
        method: 'DELETE',
        headers: { 'idempotency-key': 'revoke-commercial-intake' },
      },
    );
    expect(revoke.status).toBe(200);
    expect(
      (await postIntake(setup.company.id, body, 'authority-retry')).status,
    ).toBe(403);
    const activityAfterRevocation = record(
      await (await request('/activity-log', setup.company.id)).json(),
    );
    expect(JSON.stringify(activityAfterRevocation)).not.toContain(
      'client_request.created',
    );
    expect(JSON.stringify(activityAfterRevocation)).not.toContain(
      'opportunity.created',
    );
    await command(
      '/company-commercial-intake-assignments',
      {
        companyId: setup.company.id,
        workspaceMembershipId: setup.actor.workspaceMembershipId,
      },
      'regrant-commercial-intake',
    );
    const changed = await postIntake(
      setup.company.id,
      { ...body, originalText: `${body.originalText} ` },
      'authority-retry',
    );
    expect(changed.status).toBe(409);
    const rows = await pool.query(
      'SELECT action FROM commercial_intake_events WHERE client_request_id = $1',
      [created.id],
    );
    expect(rows.rowCount).toBe(2);
  });

  it('authorizes before reporting command validation errors', async () => {
    const company = entity(
      await command(
        '/companies',
        { displayName: 'PRISMA-PRIM' },
        'validation-authority-company',
      ),
    );

    expect(
      (await postIntake(company.id, {}, 'unauthorized-invalid')).status,
    ).toBe(403);
  });

  it('denies a commercial list before parsing malformed pagination', async () => {
    const company = entity(
      await command(
        '/companies',
        { displayName: 'Unassigned commercial Company' },
        'unassigned-commercial-list-company',
      ),
    );
    for (const query of [
      'limit=51',
      'cursor=invalid',
      'limit=0&cursor=invalid',
    ]) {
      const denied = await request(
        '/commercial-intake/requests?' + query,
        company.id,
      );
      expect(denied.status).toBe(403);
      const body = JSON.stringify(await denied.json());
      expect(body).not.toContain('cursor');
      expect(body).not.toContain('limit');
    }
  });
  it('rejects a create when independent Company context is revoked while the transaction waits', async () => {
    const setup = await preparedRestrictedMember();
    const lock = await lockAssignment(
      setup.member.workspaceMembershipId,
      setup.company.id,
      'company_commercial_intake',
    );
    let lockReleased = false;
    try {
      const pending = postIntakeAs(
        setup.company.id,
        representativeBody(),
        'revoked-company-context-race',
        setup.memberHeaders,
      );
      await waitForBlockedBy(lock.backendPid);
      await pool.query(
        `UPDATE company_role_assignments
            SET revoked_at = clock_timestamp()
          WHERE workspace_id = $1
            AND workspace_membership_id = $2
            AND company_id = $3
            AND bundle = 'company_context_access'
            AND revoked_at IS NULL`,
        [WORKSPACE_ID, setup.member.workspaceMembershipId, setup.company.id],
      );
      await lock.connection.query('COMMIT');
      lockReleased = true;

      expect((await pending).status).toBe(403);
      await expectCommercialIntakeCount(0);
    } finally {
      if (!lockReleased) await lock.connection.query('ROLLBACK');
      lock.connection.release();
    }
  });

  it('rejects a linked create when Client authority is revoked while the transaction waits', async () => {
    const setup = await preparedRestrictedMember(true);
    const client = entity(
      await command(
        '/clients',
        { displayName: 'Concurrent revocation Client' },
        'concurrent-revocation-client',
        setup.company.id,
      ),
    );
    const lock = await lockAssignment(
      setup.member.workspaceMembershipId,
      setup.company.id,
      'company_commercial_intake',
    );
    let lockReleased = false;
    try {
      const pending = postIntakeAs(
        setup.company.id,
        { ...representativeBody(), clientAccountId: client.id },
        'revoked-client-race',
        setup.memberHeaders,
      );
      await waitForBlockedBy(lock.backendPid);
      await pool.query(
        `UPDATE company_role_assignments
            SET revoked_at = clock_timestamp()
          WHERE workspace_id = $1
            AND workspace_membership_id = $2
            AND company_id = $3
            AND bundle = 'company_director_client_access'
            AND revoked_at IS NULL`,
        [WORKSPACE_ID, setup.member.workspaceMembershipId, setup.company.id],
      );
      await lock.connection.query('COMMIT');
      lockReleased = true;

      expect((await pending).status).toBe(404);
      await expectCommercialIntakeCount(0);
    } finally {
      if (!lockReleased) await lock.connection.query('ROLLBACK');
      lock.connection.release();
    }
  });

  it('rejects an exact linked retry when Client authority is revoked while the transaction waits', async () => {
    const setup = await preparedRestrictedMember(true);
    const client = entity(
      await command(
        '/clients',
        { displayName: 'Concurrent retry Client' },
        'concurrent-retry-client',
        setup.company.id,
      ),
    );
    const body = { ...representativeBody(), clientAccountId: client.id };
    expect(
      (
        await postIntakeAs(
          setup.company.id,
          body,
          'revoked-client-retry-race',
          setup.memberHeaders,
        )
      ).status,
    ).toBe(201);
    const lock = await lockAssignment(
      setup.member.workspaceMembershipId,
      setup.company.id,
      'company_commercial_intake',
    );
    let lockReleased = false;
    try {
      const pending = postIntakeAs(
        setup.company.id,
        body,
        'revoked-client-retry-race',
        setup.memberHeaders,
      );
      await waitForBlockedBy(lock.backendPid);
      await pool.query(
        `UPDATE company_role_assignments
            SET revoked_at = clock_timestamp()
          WHERE workspace_id = $1
            AND workspace_membership_id = $2
            AND company_id = $3
            AND bundle = 'company_director_client_access'
            AND revoked_at IS NULL`,
        [WORKSPACE_ID, setup.member.workspaceMembershipId, setup.company.id],
      );
      await lock.connection.query('COMMIT');
      lockReleased = true;

      expect((await pending).status).toBe(404);
      await expectCommercialIntakeCount(1);
    } finally {
      if (!lockReleased) await lock.connection.query('ROLLBACK');
      lock.connection.release();
    }
  });

  it.each([
    {
      name: 'Client target',
      invalidate:
        "UPDATE client_accounts SET status = 'archived' WHERE id = $1",
    },
    {
      name: 'Company relationship',
      invalidate:
        "UPDATE client_company_relationships SET status = 'archived' WHERE client_account_id = $1",
    },
  ])(
    'waits for a concurrent $name invalidation before an exact linked retry',
    async ({ invalidate }) => {
      const setup = await prepared(true);
      const client = entity(
        await command(
          '/clients',
          { displayName: 'Concurrent reference target' },
          'concurrent-reference-target',
          setup.company.id,
        ),
      );
      const body = { ...representativeBody(), clientAccountId: client.id };
      const key = 'concurrent-target-retry';
      expect((await postIntake(setup.company.id, body, key)).status).toBe(201);
      const connection = await pool.connect();
      let released = false;
      try {
        await connection.query('BEGIN');
        const backend = await connection.query<{ backendPid: number }>(
          'SELECT pg_backend_pid() AS "backendPid"',
        );
        const backendPid = backend.rows[0]?.backendPid;
        if (backendPid === undefined)
          throw new Error('Missing blocker backend.');
        expect((await connection.query(invalidate, [client.id])).rowCount).toBe(
          1,
        );

        const pending = postIntake(setup.company.id, body, key);
        await waitForBlockedBy(backendPid);
        await connection.query('COMMIT');
        released = true;

        const denied = await pending;
        expect(denied.status).toBe(404);
        expect(await denied.json()).toEqual({
          code: 'CLIENT_REFERENCE_UNAVAILABLE',
          message: 'Refresh Client search before retrying.',
        });
        await expectCommercialIntakeCount(1);
      } finally {
        if (!released) await connection.query('ROLLBACK');
        connection.release();
      }
    },
  );
  it('uses the Client owner for an authorized association and one safe unavailable response', async () => {
    const setup = await prepared(true);
    const client = entity(
      await command(
        '/clients',
        { displayName: 'Synthetic Client' },
        'create-client',
        setup.company.id,
      ),
    );
    const created = detail(
      await command(
        '/commercial-intake/requests',
        { ...representativeBody(), clientAccountId: client.id },
        'with-client',
        setup.company.id,
      ),
    );
    expect(created.clientReference).toEqual({
      originalClientId: client.id,
      currentClientId: client.id,
      displayName: 'Synthetic Client',
    });

    const unavailableBodies: unknown[] = [];
    const unknown = await postIntake(
      setup.company.id,
      {
        ...representativeBody(),
        clientAccountId: '00000000-0000-4000-8000-000000000999',
      },
      'unknown-client',
    );
    expect(unknown.status).toBe(404);
    unavailableBodies.push(await unknown.json());

    const archived = entity(
      await command(
        '/clients',
        { displayName: 'Archived Client' },
        'archived-client',
        setup.company.id,
      ),
    );
    await pool.query(
      "UPDATE client_accounts SET status = 'archived' WHERE id = $1",
      [archived.id],
    );
    const archivedResponse = await postIntake(
      setup.company.id,
      { ...representativeBody(), clientAccountId: archived.id },
      'archived-reference',
    );
    expect(archivedResponse.status).toBe(404);
    unavailableBodies.push(await archivedResponse.json());

    const other = entity(
      await command('/companies', { displayName: 'BIC' }, 'other-company'),
    );
    for (const path of [
      '/company-commercial-intake-assignments',
      '/company-director-client-assignments',
    ])
      await command(
        path,
        {
          companyId: other.id,
          workspaceMembershipId: setup.actor.workspaceMembershipId,
        },
        `grant-other-${path}`,
      );
    const crossCompany = await postIntake(
      other.id,
      { ...representativeBody(), clientAccountId: client.id },
      'cross-company-client',
    );
    expect(crossCompany.status).toBe(404);
    unavailableBodies.push(await crossCompany.json());

    expect(unavailableBodies).toEqual(
      unavailableBodies.map(() => ({
        code: 'CLIENT_REFERENCE_UNAVAILABLE',
        message: 'Refresh Client search before retrying.',
      })),
    );
    const counts = await pool.query<{
      requests: string;
      opportunities: string;
      events: string;
    }>(
      `SELECT
        (SELECT count(*) FROM client_requests) AS requests,
        (SELECT count(*) FROM opportunities) AS opportunities,
        (SELECT count(*) FROM commercial_intake_events) AS events`,
    );
    expect(counts.rows).toEqual([
      { requests: '1', opportunities: '1', events: '2' },
    ]);
  });

  it('keeps a Workspace manager Client reference on reload and exact retry without inventing a current dossier', async () => {
    const setup = await prepared();
    const client = entity(
      await command(
        '/clients',
        { displayName: 'Workspace-managed Client' },
        'create-workspace-managed-client',
        setup.company.id,
      ),
    );
    const body = { ...representativeBody(), clientAccountId: client.id };
    const expectedReference = {
      originalClientId: client.id,
      displayName: 'Workspace-managed Client',
    };

    const created = detail(
      await command(
        '/commercial-intake/requests',
        body,
        'workspace-manager-reference',
        setup.company.id,
      ),
    );
    expect(created.clientReference).toEqual(expectedReference);

    const reloadedResponse = await request(
      `/commercial-intake/requests/${created.id}`,
      setup.company.id,
    );
    expect(reloadedResponse.status).toBe(200);
    expect(detail(await reloadedResponse.json()).clientReference).toEqual(
      expectedReference,
    );

    const replay = await postIntake(
      setup.company.id,
      body,
      'workspace-manager-reference',
    );
    expect(replay.status).toBe(201);
    expect(detail(await replay.json()).clientReference).toEqual(
      expectedReference,
    );
  });

  it('rolls back validation, unavailable Client and persistence failures atomically', async () => {
    const setup = await prepared(true);
    const client = entity(
      await command(
        '/clients',
        { displayName: 'Rollback Client' },
        'rollback-client',
        setup.company.id,
      ),
    );
    const beforeFence = await pool.query<{ version: number }>(
      'SELECT version FROM client_accounts WHERE id = $1',
      [client.id],
    );
    const invalid = await postIntake(
      setup.company.id,
      { ...representativeBody(), originalText: '   ' },
      'invalid-request',
    );
    expect(invalid.status).toBe(400);
    const localTime = await postIntake(
      setup.company.id,
      {
        ...representativeBody(),
        reportedReceivedAt: '2026-09-20T08:15',
      },
      'local-time-without-zone',
    );
    expect(localTime.status).toBe(400);
    const invalidCalendarDate = await postIntake(
      setup.company.id,
      {
        ...representativeBody(),
        reportedReceivedAt: '2024-02-30T10:00:00Z',
      },
      'invalid-calendar-date',
    );
    expect(invalidCalendarDate.status).toBe(400);
    const unavailable = await postIntake(
      setup.company.id,
      {
        ...representativeBody(),
        clientAccountId: '00000000-0000-4000-8000-000000000998',
      },
      'unavailable-request',
    );
    expect(unavailable.status).toBe(404);
    await pool.query(
      "ALTER TABLE opportunities ADD CONSTRAINT commercial_intake_test_conflict CHECK (title <> 'Persistence conflict')",
    );
    try {
      const persistenceFailure = await postIntake(
        setup.company.id,
        {
          ...representativeBody(),
          clientAccountId: client.id,
          opportunity: {
            ...representativeBody().opportunity,
            title: 'Persistence conflict',
          },
        },
        'persistence-conflict',
      );
      expect(persistenceFailure.status).toBe(500);
    } finally {
      await pool.query(
        'ALTER TABLE opportunities DROP CONSTRAINT commercial_intake_test_conflict',
      );
    }
    const counts = await pool.query<{
      requests: string;
      opportunities: string;
      commands: string;
      events: string;
    }>(
      `SELECT
        (SELECT count(*) FROM client_requests) AS requests,
        (SELECT count(*) FROM opportunities) AS opportunities,
        (SELECT count(*) FROM commercial_intake_commands) AS commands,
        (SELECT count(*) FROM commercial_intake_events) AS events`,
    );
    expect(counts.rows).toEqual([
      { requests: '0', opportunities: '0', commands: '0', events: '0' },
    ]);
    const afterFence = await pool.query<{ version: number }>(
      'SELECT version FROM client_accounts WHERE id = $1',
      [client.id],
    );
    expect(afterFence.rows).toEqual(beforeFence.rows);
  });

  it('keeps the Request readable without Client authority and denies a linked replay safely', async () => {
    const setup = await prepared();
    const client = entity(
      await command(
        '/clients',
        { displayName: 'Hidden after revocation' },
        'revoked-client',
        setup.company.id,
      ),
    );
    const memberHeaders = {
      'x-test-external-subject': 'commercial-only-member',
      'x-test-display-name': 'Commercial Member',
      'x-test-email': 'commercial-member@example.test',
    };
    const member = actorRecord(
      await (
        await request('/access/current-actor', undefined, {
          headers: memberHeaders,
        })
      ).json(),
    );
    for (const path of [
      '/company-context-assignments',
      '/company-commercial-intake-assignments',
      '/company-director-client-assignments',
    ])
      await command(
        path,
        {
          companyId: setup.company.id,
          workspaceMembershipId: member.workspaceMembershipId,
        },
        `grant-member-${path}`,
      );
    const body = { ...representativeBody(), clientAccountId: client.id };
    const createResponse = await request(
      '/commercial-intake/requests',
      setup.company.id,
      {
        method: 'POST',
        headers: {
          ...memberHeaders,
          'content-type': 'application/json',
          'idempotency-key': 'linked-before-revocation',
        },
        body: JSON.stringify(body),
      },
    );
    expect(createResponse.status).toBe(201);
    const created = detail(await createResponse.json());
    const revoked = await request(
      `/company-director-client-assignments/${member.workspaceMembershipId}/${setup.company.id}`,
      undefined,
      {
        method: 'DELETE',
        headers: { 'idempotency-key': 'revoke-client-read' },
      },
    );
    expect(revoked.status).toBe(200);
    const detailResponse = await request(
      `/commercial-intake/requests/${created.id}`,
      setup.company.id,
      { headers: memberHeaders },
    );
    expect(detailResponse.status).toBe(200);
    const redacted = record(await detailResponse.json());
    expect(redacted).not.toHaveProperty('clientReference');
    expect(JSON.stringify(redacted)).not.toContain('Hidden after revocation');
    const replay = await request(
      '/commercial-intake/requests',
      setup.company.id,
      {
        method: 'POST',
        headers: {
          ...memberHeaders,
          'content-type': 'application/json',
          'idempotency-key': 'linked-before-revocation',
        },
        body: JSON.stringify(body),
      },
    );
    expect(replay.status).toBe(404);
    expect(await replay.json()).toEqual({
      code: 'CLIENT_REFERENCE_UNAVAILABLE',
      message: 'Refresh Client search before retrying.',
    });
  });

  it('paginates newest Requests with a stable bounded cursor and no count or Client metadata', async () => {
    const setup = await prepared();
    for (let index = 0; index < 27; index += 1)
      await command(
        '/commercial-intake/requests',
        {
          ...representativeBody(),
          subject: `Request ${String(index).padStart(2, '0')}`,
        },
        `page-${index}`,
        setup.company.id,
      );
    await pool.query(
      `UPDATE client_requests
       SET captured_at = CASE
         WHEN subject = 'Request 24' THEN TIMESTAMPTZ '2026-09-20 10:00:00.000900+00'
         WHEN subject = 'Request 25' THEN TIMESTAMPTZ '2026-09-20 10:00:00.000800+00'
         WHEN subject = 'Request 26' THEN TIMESTAMPTZ '2026-09-20 10:00:00.000700+00'
         ELSE TIMESTAMPTZ '2026-09-20 10:00:01+00'
       END`,
    );
    const expected = await pool.query<{ id: string }>(
      'SELECT id FROM client_requests ORDER BY captured_at DESC, id DESC',
    );
    const first = record(
      await (
        await request('/commercial-intake/requests', setup.company.id)
      ).json(),
    );
    if (!Array.isArray(first.items))
      throw new Error('Expected a commercial Request page.');
    expect(first.items).toHaveLength(25);
    expect(first.items.map((item) => stringField(record(item), 'id'))).toEqual(
      expected.rows.slice(0, 25).map(({ id }) => id),
    );
    expect(first).not.toHaveProperty('total');
    expect(JSON.stringify(first.items)).not.toContain('client');
    const cursor = stringField(first, 'nextCursor');
    const second = record(
      await (
        await request(
          `/commercial-intake/requests?limit=25&cursor=${encodeURIComponent(cursor)}`,
          setup.company.id,
        )
      ).json(),
    );
    if (!Array.isArray(second.items))
      throw new Error('Expected a commercial Request page.');
    expect(second.items.map((item) => stringField(record(item), 'id'))).toEqual(
      expected.rows.slice(25).map(({ id }) => id),
    );
    expect(second).not.toHaveProperty('nextCursor');
    expect(
      (await request('/commercial-intake/requests?limit=51', setup.company.id))
        .status,
    ).toBe(400);
  });

  it('derives a distinct current dossier for same-named Clients in one batched projection per page', async () => {
    const setup = await prepared(true);
    const first = entity(
      await command(
        '/clients',
        { displayName: 'Shared display name' },
        'shared-first-client',
        setup.company.id,
      ),
    );
    const second = entity(
      await command(
        '/clients',
        { displayName: 'Shared display name' },
        'shared-second-client',
        setup.company.id,
      ),
    );
    const linkedToFirst = detail(
      await command(
        '/commercial-intake/requests',
        {
          ...representativeBody(),
          subject: 'First shared Request',
          clientAccountId: first.id,
        },
        'shared-first-request',
        setup.company.id,
      ),
    );
    const linkedToSecond = detail(
      await command(
        '/commercial-intake/requests',
        {
          ...representativeBody(),
          subject: 'Second shared Request',
          clientAccountId: second.id,
        },
        'shared-second-request',
        setup.company.id,
      ),
    );
    const unlinked = detail(
      await command(
        '/commercial-intake/requests',
        { ...representativeBody(), subject: 'Request without Client' },
        'shared-unlinked-request',
        setup.company.id,
      ),
    );
    await pool.query(
      `UPDATE client_requests SET captured_at = CASE id
         WHEN $1::uuid THEN TIMESTAMPTZ '2026-09-20 10:00:03+00'
         WHEN $2::uuid THEN TIMESTAMPTZ '2026-09-20 10:00:02+00'
         ELSE TIMESTAMPTZ '2026-09-20 10:00:01+00'
       END`,
      [unlinked.id, linkedToSecond.id],
    );

    const page = listPage(
      await (
        await request('/commercial-intake/requests', setup.company.id)
      ).json(),
    );
    expect(page.items.map((item) => item.id)).toEqual([
      unlinked.id,
      linkedToSecond.id,
      linkedToFirst.id,
    ]);
    expect(page.items.map((item) => item.clientDossierId)).toEqual([
      undefined,
      second.id,
      first.id,
    ]);
    expect(page.items[0]).not.toHaveProperty('clientDossierId');
    // The derived identity is the only Client datum a row gains: no display
    // name, original reference or count.
    for (const item of page.items)
      expect(Object.keys(item).sort()).toEqual(
        [
          'capturedAt',
          'id',
          'initialOpportunity',
          'subject',
          ...(item.clientDossierId === undefined ? [] : ['clientDossierId']),
        ].sort(),
      );
    expect(JSON.stringify(page)).not.toContain('Shared display name');
    expect(page).not.toHaveProperty('total');

    // Page size, cursor and order are unchanged by the derived field.
    const firstPage = listPage(
      await (
        await request('/commercial-intake/requests?limit=2', setup.company.id)
      ).json(),
    );
    expect(firstPage.items.map((item) => item.id)).toEqual([
      unlinked.id,
      linkedToSecond.id,
    ]);
    const cursor = firstPage.nextCursor;
    if (cursor === undefined) throw new Error('Expected a next page cursor.');
    const olderPage = listPage(
      await (
        await request(
          `/commercial-intake/requests?limit=2&cursor=${encodeURIComponent(cursor)}`,
          setup.company.id,
        )
      ).json(),
    );
    expect(olderPage).toEqual({
      items: [{ ...page.items[2], clientDossierId: first.id }],
    });

    // One batched Client projection per page: more linked rows, each with its
    // own Client, add no query.
    const baseline = await harness.measureApplicationQueries(() =>
      request('/commercial-intake/requests', setup.company.id),
    );
    expect(baseline.value.status).toBe(200);
    for (const index of [1, 2, 3]) {
      const client = entity(
        await command(
          '/clients',
          { displayName: `Additional Client ${index}` },
          `additional-client-${index}`,
          setup.company.id,
        ),
      );
      await command(
        '/commercial-intake/requests',
        { ...representativeBody(), clientAccountId: client.id },
        `additional-request-${index}`,
        setup.company.id,
      );
    }
    const larger = await harness.measureApplicationQueries(() =>
      request('/commercial-intake/requests', setup.company.id),
    );
    expect(larger.value.status).toBe(200);
    const largerPage = listPage(await larger.value.json());
    expect(
      largerPage.items.filter((item) => item.clientDossierId !== undefined),
    ).toHaveLength(5);
    expect(larger.queryCount).toBe(baseline.queryCount);
  });

  it('derives no dossier without current Company Client read or for an unavailable Client', async () => {
    const setup = await preparedRestrictedMember();
    const client = entity(
      await command(
        '/clients',
        { displayName: 'Workspace-managed shared name' },
        'manager-only-client',
        setup.company.id,
      ),
    );
    await command(
      '/commercial-intake/requests',
      { ...representativeBody(), clientAccountId: client.id },
      'manager-only-request',
      setup.company.id,
    );
    const derived = async (headers: Record<string, string> = {}) =>
      listPage(
        await (
          await request('/commercial-intake/requests', setup.company.id, {
            headers,
          })
        ).json(),
      ).items.map((item) => item.clientDossierId);

    // Workspace client.manage alone and a commercial-only member get none.
    expect(await derived()).toEqual([undefined]);
    expect(await derived(setup.memberHeaders)).toEqual([undefined]);

    await command(
      '/company-director-client-assignments',
      {
        companyId: setup.company.id,
        workspaceMembershipId: setup.actor.workspaceMembershipId,
      },
      'grant-company-client-read',
    );
    expect(await derived()).toEqual([client.id]);

    await pool.query(
      "UPDATE client_company_relationships SET status = 'archived' WHERE client_account_id = $1",
      [client.id],
    );
    expect(await derived()).toEqual([undefined]);
    await pool.query(
      "UPDATE client_company_relationships SET status = 'active' WHERE client_account_id = $1",
      [client.id],
    );
    await pool.query(
      "UPDATE client_accounts SET status = 'archived' WHERE id = $1",
      [client.id],
    );
    expect(await derived()).toEqual([undefined]);
  });

  it('keeps direct detail, list and labels isolated between Companies', async () => {
    const setup = await prepared();
    const created = detail(
      await command(
        '/commercial-intake/requests',
        representativeBody(),
        'company-a-request',
        setup.company.id,
      ),
    );
    const other = entity(
      await command('/companies', { displayName: 'BIC' }, 'isolated-company'),
    );
    await command(
      '/company-commercial-intake-assignments',
      {
        companyId: other.id,
        workspaceMembershipId: setup.actor.workspaceMembershipId,
      },
      'grant-isolated-company',
    );
    expect(
      await (await request('/commercial-intake/requests', other.id)).json(),
    ).toEqual({ items: [] });
    const hidden = await request(
      `/commercial-intake/requests/${created.id}`,
      other.id,
    );
    const unknown = await request(
      '/commercial-intake/requests/00000000-0000-4000-8000-000000000997',
      other.id,
    );
    expect(hidden.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(await hidden.json()).toEqual(await unknown.json());
    const foreignWorkspace = await request(
      '/commercial-intake/requests',
      setup.company.id,
      {
        headers: {
          'x-workspace-context-id': '00000000-0000-4000-8000-000000000996',
        },
      },
    );
    expect(foreignWorkspace.status).toBe(403);
    expect(await foreignWorkspace.text()).not.toContain(created.id);
  });

  it('keeps a pre-union Client reference through union and reversal, then fences a new reference', async () => {
    const setup = await unionSetup();
    const original = detail(
      await command(
        '/commercial-intake/requests',
        { ...representativeBody(), clientAccountId: setup.second.id },
        'commercial-before-union',
        setup.other.id,
      ),
    );
    const reference = await setup.unite();
    expect(
      detail(
        await (
          await request(
            `/commercial-intake/requests/${original.id}`,
            setup.other.id,
          )
        ).json(),
      ).clientReference,
    ).toEqual({
      originalClientId: setup.second.id,
      currentClientId: setup.client.id,
      displayName: 'Legacy identity',
    });
    expect((await setup.reverse(reference)).status).toBe(201);
    expect(
      detail(
        await (
          await request(
            `/commercial-intake/requests/${original.id}`,
            setup.other.id,
          )
        ).json(),
      ).clientReference,
    ).toEqual({
      originalClientId: setup.second.id,
      currentClientId: setup.second.id,
      displayName: 'Legacy identity',
    });

    const next = await setup.unite();
    await command(
      '/commercial-intake/requests',
      { ...representativeBody(), clientAccountId: setup.client.id },
      'commercial-after-union',
      setup.company.id,
    );
    expect((await setup.reverse(next)).status).toBe(409);
  });

  it('derives the canonical dossier on list rows after union and the original after reversal', async () => {
    const setup = await unionSetup();
    const original = detail(
      await command(
        '/commercial-intake/requests',
        { ...representativeBody(), clientAccountId: setup.second.id },
        'list-before-union',
        setup.other.id,
      ),
    );
    const derived = async () =>
      listPage(
        await (
          await request('/commercial-intake/requests', setup.other.id)
        ).json(),
      ).items.map((item) => [item.id, item.clientDossierId]);

    expect(await derived()).toEqual([[original.id, setup.second.id]]);
    const reference = await setup.unite();
    expect(await derived()).toEqual([[original.id, setup.client.id]]);
    // The other Company's Request never reaches this Company's rows.
    expect(
      listPage(
        await (
          await request('/commercial-intake/requests', setup.company.id)
        ).json(),
      ).items,
    ).toEqual([]);
    expect((await setup.reverse(reference)).status).toBe(201);
    expect(await derived()).toEqual([[original.id, setup.second.id]]);
  });

  it('keeps an exact Workspace manager retry after a valid Client union reversal', async () => {
    const setup = await unionSetup();
    const body = { ...representativeBody(), clientAccountId: setup.second.id };
    const key = 'commercial-reversed-manager-retry';
    expect((await postIntake(setup.other.id, body, key)).status).toBe(201);
    const reference = await setup.unite();
    expect((await setup.reverse(reference)).status).toBe(201);
    const revoked = await request(
      `/company-director-client-assignments/${setup.actor.workspaceMembershipId}/${setup.other.id}`,
      undefined,
      {
        method: 'DELETE',
        headers: { 'idempotency-key': 'commercial-reversed-manager-revoke' },
      },
    );
    expect(revoked.status).toBe(200);
    const replay = await postIntake(setup.other.id, body, key);
    expect(replay.status).toBe(201);
    expect(detail(await replay.json()).clientReference).toEqual({
      originalClientId: setup.second.id,
      displayName: 'Legacy identity',
    });
    await expectCommercialIntakeCount(1);
  });

  it('denies an exact retry after the united current Client loses its Company relationship', async () => {
    const setup = await unionSetup();
    const body = {
      ...representativeBody(),
      clientAccountId: setup.second.id,
    };
    const key = 'commercial-united-target-retry';
    expect((await postIntake(setup.other.id, body, key)).status).toBe(201);
    await setup.unite();
    const revoked = await request(
      `/company-director-client-assignments/${setup.actor.workspaceMembershipId}/${setup.other.id}`,
      undefined,
      {
        method: 'DELETE',
        headers: { 'idempotency-key': 'commercial-united-manager-revoke' },
      },
    );
    expect(revoked.status).toBe(200);
    const validReplay = await postIntake(setup.other.id, body, key);
    expect(validReplay.status).toBe(201);
    expect(detail(await validReplay.json()).clientReference).toEqual({
      originalClientId: setup.second.id,
      displayName: 'Legacy identity',
    });

    const connection = await pool.connect();
    let released = false;
    try {
      await connection.query('BEGIN');
      const backend = await connection.query<{ backendPid: number }>(
        'SELECT pg_backend_pid() AS "backendPid"',
      );
      const backendPid = backend.rows[0]?.backendPid;
      if (backendPid === undefined) throw new Error('Missing blocker backend.');
      expect(
        (
          await connection.query(
            "UPDATE client_company_relationships SET status = 'archived' WHERE client_account_id = $1 AND company_id = $2",
            [setup.client.id, setup.other.id],
          )
        ).rowCount,
      ).toBe(1);

      const pending = postIntake(setup.other.id, body, key);
      await waitForBlockedBy(backendPid);
      await connection.query('COMMIT');
      released = true;

      const denied = await pending;
      expect(denied.status).toBe(404);
      expect(await denied.json()).toEqual({
        code: 'CLIENT_REFERENCE_UNAVAILABLE',
        message: 'Refresh Client search before retrying.',
      });
      await expectCommercialIntakeCount(1);
      expect((await postIntake(setup.other.id, body, key)).status).toBe(404);
    } finally {
      if (!released) await connection.query('ROLLBACK');
      connection.release();
    }
  });
  it('serializes a new Request against Client union reversal without losing a reference', async () => {
    const setup = await unionSetup();
    const reference = await setup.unite();
    const [created, reversed] = await Promise.all([
      postIntake(
        setup.other.id,
        { ...representativeBody(), clientAccountId: setup.client.id },
        'commercial-reversal-race',
      ),
      setup.reverse(reference),
    ]);
    expect([
      [201, 409],
      [404, 201],
    ]).toContainEqual([created.status, reversed.status]);
    const page = record(
      await (
        await request('/commercial-intake/requests', setup.other.id)
      ).json(),
    );
    if (!Array.isArray(page.items)) throw new Error('Expected a Request page.');
    expect(page.items).toHaveLength(created.status === 201 ? 1 : 0);
  });

  it('updates only the Opportunity next action with one attributed version-only event that survives restart', async () => {
    const setup = await prepared();
    const created = detail(
      await command(
        '/commercial-intake/requests',
        representativeBody(),
        'next-action-source',
        setup.company.id,
      ),
    );
    const opportunityId = created.initialOpportunity.id;
    const nextAction = '  Send the qualification summary to the Client  ';
    const requestRowsBefore = await pool.query(
      'SELECT to_jsonb(request) AS row FROM client_requests AS request',
    );
    const opportunityBefore = await pool.query<JsonRow>(
      'SELECT to_jsonb(opportunity) AS row FROM opportunities AS opportunity',
    );

    const response = await updateNextAction(
      setup.company.id,
      opportunityId,
      { expectedVersion: 1, nextAction },
      'next-action-update',
    );
    expect(response.status).toBe(200);
    const result = record(await response.json());
    expect(result.receipt).toEqual({
      opportunityId,
      nextAction,
      version: 2,
      outcome: 'updated',
    });
    const expected = {
      ...created,
      initialOpportunity: {
        ...created.initialOpportunity,
        nextAction,
        version: 2,
      },
    };
    expect(result.request).toEqual(expected);
    expect(JSON.stringify(result)).not.toContain('lastUpdated');

    expect(
      (
        await pool.query(
          'SELECT to_jsonb(request) AS row FROM client_requests AS request',
        )
      ).rows,
    ).toEqual(requestRowsBefore.rows);
    const opportunityAfter = await pool.query<JsonRow>(
      'SELECT to_jsonb(opportunity) AS row FROM opportunities AS opportunity',
    );
    const before = opportunityBefore.rows[0]?.row;
    const after = opportunityAfter.rows[0]?.row;
    if (!before || !after) throw new Error('Expected one Opportunity row.');
    expect(after).toEqual({
      ...before,
      next_action: nextAction,
      version: 2,
      last_updated_by_internal_user_id: expect.any(String),
      last_updated_by_workspace_membership_id:
        setup.actor.workspaceMembershipId,
      last_updated_at: expect.any(String),
    });

    const events = await pool.query<{
      action: string;
      actor_workspace_membership_id: string;
      company_id: string;
      client_request_id: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT action, actor_workspace_membership_id, company_id,
              client_request_id, metadata
         FROM commercial_intake_events
        WHERE opportunity_id = $1
        ORDER BY occurred_at, action`,
      [opportunityId],
    );
    expect(events.rows.map((row) => row.action)).toEqual([
      'client_request.created',
      'opportunity.created',
      'opportunity.next_action.updated',
    ]);
    expect(events.rows[2]).toEqual({
      action: 'opportunity.next_action.updated',
      actor_workspace_membership_id: setup.actor.workspaceMembershipId,
      company_id: setup.company.id,
      client_request_id: created.id,
      metadata: { opportunityVersion: 2 },
    });
    const receipts = await pool.query(
      `SELECT outcome, expected_version, result_version, next_action
         FROM commercial_intake_next_action_commands`,
    );
    expect(receipts.rows).toEqual([
      {
        outcome: 'updated',
        expected_version: 1,
        result_version: 2,
        next_action: nextAction,
      },
    ]);

    const page = record(
      await (
        await request('/commercial-intake/requests', setup.company.id)
      ).json(),
    );
    expect(page.items).toEqual([
      expect.objectContaining({
        id: created.id,
        initialOpportunity: expect.objectContaining({ nextAction }),
      }),
    ]);

    await harness.close();
    await openHarness();
    expect(
      await (
        await request(
          `/commercial-intake/requests/${created.id}`,
          setup.company.id,
        )
      ).json(),
    ).toEqual(expected);
  });

  it('allows one material outcome per observed version and replays exact receipts before stale-version refusal', async () => {
    // Two distinct v2 holders race. Actor resolution updates the acting
    // internal_users row on every request while an in-flight command holds
    // that row FOR SHARE, so two commands from one actor would serialize in
    // the guard instead of both reaching the Opportunity row lock.
    const setup = await preparedRestrictedMember();
    const created = detail(
      await command(
        '/commercial-intake/requests',
        representativeBody(),
        'next-action-concurrency-source',
        setup.company.id,
      ),
    );
    const opportunityId = created.initialOpportunity.id;

    const stale = await updateNextAction(
      setup.company.id,
      opportunityId,
      { expectedVersion: 2, nextAction: 'Stale observation' },
      'stale-observation',
    );
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({
      code: 'STALE_VERSION',
      message: 'Reload the Request before retrying.',
    });

    const barrier = await pool.connect();
    let released = false;
    try {
      await barrier.query('BEGIN');
      await barrier.query(
        'SELECT id FROM opportunities WHERE id = $1 FOR UPDATE',
        [opportunityId],
      );
      const first = updateNextAction(
        setup.company.id,
        opportunityId,
        { expectedVersion: 1, nextAction: 'First concurrent writer' },
        'writer-a',
      );
      const second = updateNextActionAs(
        setup.company.id,
        opportunityId,
        { expectedVersion: 1, nextAction: 'Second concurrent writer' },
        'writer-b',
        setup.memberHeaders,
      );
      await waitForLockWaiters(2);
      await barrier.query('COMMIT');
      released = true;
      const [firstOutcome, secondOutcome] = await Promise.all([first, second]);
      expect([firstOutcome.status, secondOutcome.status].sort()).toEqual([
        200, 409,
      ]);
      const firstWon = firstOutcome.status === 200;
      // The idempotency key is scoped to the acting membership, so the exact
      // replay and the changed reuse must come from the winning actor.
      const winner = {
        key: firstWon ? 'writer-a' : 'writer-b',
        headers: firstWon ? {} : setup.memberHeaders,
        nextAction: firstWon
          ? 'First concurrent writer'
          : 'Second concurrent writer',
        body: record(await (firstWon ? firstOutcome : secondOutcome).json()),
      };
      expect(winner.body.receipt).toEqual({
        opportunityId,
        nextAction: winner.nextAction,
        version: 2,
        outcome: 'updated',
      });
      await expectOpportunityState(opportunityId, {
        nextAction: winner.nextAction,
        version: 2,
        updateEvents: 1,
        receipts: [{ outcome: 'updated', result_version: 2 }],
      });

      const replay = await updateNextActionAs(
        setup.company.id,
        opportunityId,
        { expectedVersion: 1, nextAction: winner.nextAction },
        winner.key,
        winner.headers,
      );
      expect(replay.status).toBe(200);
      expect(record(await replay.json()).receipt).toEqual(winner.body.receipt);
      const changed = await updateNextActionAs(
        setup.company.id,
        opportunityId,
        { expectedVersion: 2, nextAction: winner.nextAction },
        winner.key,
        winner.headers,
      );
      expect(changed.status).toBe(409);
      expect(await changed.json()).toEqual({
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'Idempotency-Key was already used for another update.',
      });

      const unchanged = await updateNextAction(
        setup.company.id,
        opportunityId,
        { expectedVersion: 2, nextAction: winner.nextAction },
        'no-op',
      );
      expect(unchanged.status).toBe(200);
      const unchangedBody = record(await unchanged.json());
      expect(unchangedBody.receipt).toEqual({
        opportunityId,
        nextAction: winner.nextAction,
        version: 2,
        outcome: 'unchanged',
      });
      expect(record(unchangedBody.request).initialOpportunity).toMatchObject({
        nextAction: winner.nextAction,
        version: 2,
      });
      await expectOpportunityState(opportunityId, {
        nextAction: winner.nextAction,
        version: 2,
        updateEvents: 1,
        receipts: [
          { outcome: 'updated', result_version: 2 },
          { outcome: 'unchanged', result_version: 2 },
        ],
      });

      const later = await updateNextAction(
        setup.company.id,
        opportunityId,
        { expectedVersion: 2, nextAction: 'Later material update' },
        'later-update',
      );
      expect(later.status).toBe(200);
      const noOpReplay = await updateNextAction(
        setup.company.id,
        opportunityId,
        { expectedVersion: 2, nextAction: winner.nextAction },
        'no-op',
      );
      expect(noOpReplay.status).toBe(200);
      const noOpReplayBody = record(await noOpReplay.json());
      expect(noOpReplayBody.receipt).toEqual(unchangedBody.receipt);
      expect(record(noOpReplayBody.request).initialOpportunity).toMatchObject({
        nextAction: 'Later material update',
        version: 3,
      });
      expect(
        (
          await updateNextAction(
            setup.company.id,
            opportunityId,
            { expectedVersion: 3, nextAction: winner.nextAction },
            'no-op',
          )
        ).status,
      ).toBe(409);
      await expectOpportunityState(opportunityId, {
        nextAction: 'Later material update',
        version: 3,
        updateEvents: 2,
        receipts: [
          { outcome: 'updated', result_version: 2 },
          { outcome: 'unchanged', result_version: 2 },
          { outcome: 'updated', result_version: 3 },
        ],
      });
    } finally {
      if (!released) await barrier.query('ROLLBACK');
      barrier.release();
    }
  });

  it('fails closed for a legacy v1 assignment, another Company, another Workspace and missing identity without leakage', async () => {
    const setup = await prepared();
    const created = detail(
      await command(
        '/commercial-intake/requests',
        representativeBody(),
        'next-action-authority-source',
        setup.company.id,
      ),
    );
    const opportunityId = created.initialOpportunity.id;
    const body = { expectedVersion: 1, nextAction: 'Denied attempt' };

    await pool.query(
      `UPDATE company_role_assignments
          SET permission_set_version = 'v1'
        WHERE workspace_id = $1
          AND workspace_membership_id = $2
          AND company_id = $3
          AND bundle = 'company_commercial_intake'
          AND revoked_at IS NULL`,
      [WORKSPACE_ID, setup.actor.workspaceMembershipId, setup.company.id],
    );
    const legacyActor = record(
      await (await request('/access/current-actor', setup.company.id)).json(),
    );
    const legacyCompany = record(legacyActor.activeCompany);
    expect(legacyCompany.commercialIntakePermissionSetVersion).toBe('v1');
    expect(legacyCompany.commercialIntakePermissions).toEqual([
      'commercial.request.read',
      'commercial.request.create',
      'commercial.opportunity.read',
      'commercial.opportunity.create',
    ]);
    const legacy = await updateNextAction(
      setup.company.id,
      opportunityId,
      body,
      'legacy-v1',
    );
    expect(legacy.status).toBe(403);
    expect(await legacy.text()).not.toContain(opportunityId);
    const legacyRead = await request(
      `/commercial-intake/requests/${created.id}`,
      setup.company.id,
    );
    expect(legacyRead.status).toBe(200);
    await pool.query(
      `UPDATE company_role_assignments
          SET permission_set_version = 'v2'
        WHERE workspace_id = $1
          AND workspace_membership_id = $2
          AND company_id = $3
          AND bundle = 'company_commercial_intake'
          AND revoked_at IS NULL`,
      [WORKSPACE_ID, setup.actor.workspaceMembershipId, setup.company.id],
    );

    const other = entity(
      await command('/companies', { displayName: 'BIC' }, 'next-action-other'),
    );
    await command(
      '/company-commercial-intake-assignments',
      {
        companyId: other.id,
        workspaceMembershipId: setup.actor.workspaceMembershipId,
      },
      'next-action-other-grant',
    );
    const crossCompany = await updateNextAction(
      other.id,
      opportunityId,
      body,
      'cross-company',
    );
    const unknown = await updateNextAction(
      setup.company.id,
      '00000000-0000-4000-8000-000000000994',
      body,
      'unknown-opportunity',
    );
    const missingRequest = await request(
      '/commercial-intake/requests/00000000-0000-4000-8000-000000000994',
      setup.company.id,
    );
    expect(crossCompany.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(missingRequest.status).toBe(404);
    const crossCompanyBody = await crossCompany.text();
    const unknownBody = await unknown.text();
    expect(crossCompanyBody).toBe(unknownBody);
    expect(unknownBody).toBe(await missingRequest.text());
    expect(unknownBody).not.toContain(opportunityId);

    const foreignWorkspace = await request(
      `/commercial-intake/opportunities/${opportunityId}/next-action`,
      setup.company.id,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': 'foreign-workspace',
          'x-workspace-context-id': '00000000-0000-4000-8000-000000000996',
        },
        body: JSON.stringify(body),
      },
    );
    expect(foreignWorkspace.status).toBe(403);
    expect(await foreignWorkspace.text()).not.toContain(opportunityId);
    expect(
      (
        await fetch(
          `${origin}/api/commercial-intake/opportunities/${opportunityId}/next-action`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'idempotency-key': 'anonymous',
            },
            body: JSON.stringify(body),
          },
        )
      ).status,
    ).toBe(401);
    await expectOpportunityState(opportunityId, {
      nextAction: representativeBody().opportunity.nextAction,
      version: 1,
      updateEvents: 0,
      receipts: [],
    });
  });

  it('lets a non-responsible v2 holder update, then serializes the update with revocation and suspension', async () => {
    const setup = await preparedRestrictedMember();
    const created = detail(
      await command(
        '/commercial-intake/requests',
        representativeBody(),
        'next-action-member-source',
        setup.company.id,
      ),
    );
    const opportunityId = created.initialOpportunity.id;
    const memberUpdate = await updateNextActionAs(
      setup.company.id,
      opportunityId,
      { expectedVersion: 1, nextAction: 'Member follow-up' },
      'member-update',
      setup.memberHeaders,
    );
    expect(memberUpdate.status).toBe(200);
    expect(record(await memberUpdate.json()).request).toMatchObject({
      initialOpportunity: {
        nextAction: 'Member follow-up',
        version: 2,
        responsibleWorkspaceMembershipId: setup.actor.workspaceMembershipId,
      },
    });
    const memberEvent = await pool.query<{
      actor_workspace_membership_id: string;
    }>(
      `SELECT actor_workspace_membership_id
         FROM commercial_intake_events
        WHERE opportunity_id = $1 AND action = 'opportunity.next_action.updated'`,
      [opportunityId],
    );
    expect(memberEvent.rows).toEqual([
      { actor_workspace_membership_id: setup.member.workspaceMembershipId },
    ]);

    const lock = await lockAssignment(
      setup.member.workspaceMembershipId,
      setup.company.id,
      'company_commercial_intake',
    );
    let lockReleased = false;
    try {
      const pending = updateNextActionAs(
        setup.company.id,
        opportunityId,
        { expectedVersion: 2, nextAction: 'Racing revocation' },
        'member-revocation-race',
        setup.memberHeaders,
      );
      await waitForBlockedBy(lock.backendPid);
      // The revoking transaction already holds the row lock the update is
      // waiting on, so the update re-reads the revoked assignment after it.
      await lock.connection.query(
        `UPDATE company_role_assignments
            SET revoked_at = clock_timestamp()
          WHERE workspace_id = $1
            AND workspace_membership_id = $2
            AND company_id = $3
            AND bundle = 'company_commercial_intake'
            AND revoked_at IS NULL`,
        [WORKSPACE_ID, setup.member.workspaceMembershipId, setup.company.id],
      );
      await lock.connection.query('COMMIT');
      lockReleased = true;
      expect((await pending).status).toBe(403);
    } finally {
      if (!lockReleased) await lock.connection.query('ROLLBACK');
      lock.connection.release();
    }
    const exactRetryAfterRevocation = await updateNextActionAs(
      setup.company.id,
      opportunityId,
      { expectedVersion: 1, nextAction: 'Member follow-up' },
      'member-update',
      setup.memberHeaders,
    );
    expect(exactRetryAfterRevocation.status).toBe(403);

    await pool.query(
      `UPDATE workspace_memberships SET status = 'inactive' WHERE id = $1`,
      [setup.member.workspaceMembershipId],
    );
    expect(
      (
        await updateNextActionAs(
          setup.company.id,
          opportunityId,
          { expectedVersion: 2, nextAction: 'Suspended attempt' },
          'member-suspended',
          setup.memberHeaders,
        )
      ).status,
    ).toBe(403);
    await expectOpportunityState(opportunityId, {
      nextAction: 'Member follow-up',
      version: 2,
      updateEvents: 1,
      receipts: [{ outcome: 'updated', result_version: 2 }],
    });
  });

  it('validates the next action after authorization and rolls back a persistence failure', async () => {
    const setup = await prepared();
    const created = detail(
      await command(
        '/commercial-intake/requests',
        representativeBody(),
        'next-action-validation-source',
        setup.company.id,
      ),
    );
    const opportunityId = created.initialOpportunity.id;
    const unassigned = entity(
      await command(
        '/companies',
        { displayName: 'Unassigned' },
        'next-action-unassigned-company',
      ),
    );
    expect(
      (await updateNextAction(unassigned.id, opportunityId, {}, 'unauthorized'))
        .status,
    ).toBe(403);

    const invalidBodies: Array<[unknown, string]> = [
      [{ expectedVersion: 1, nextAction: '   ' }, 'nextAction'],
      [{ expectedVersion: 1, nextAction: 'x'.repeat(501) }, 'nextAction'],
      [{ expectedVersion: 1 }, 'nextAction'],
      [
        { expectedVersion: '1', nextAction: 'Typed version' },
        'expectedVersion',
      ],
      [{ expectedVersion: 0, nextAction: 'Zero version' }, 'expectedVersion'],
      [{ expectedVersion: 1.5, nextAction: 'Fraction' }, 'expectedVersion'],
      [
        { expectedVersion: 2_147_483_648, nextAction: 'Above int4 maximum' },
        'expectedVersion',
      ],
      [{ expectedVersion: 1, nextAction: 'Extra', title: 'Edit' }, 'update'],
    ];
    for (const [body, field] of invalidBodies) {
      const invalid = await updateNextAction(
        setup.company.id,
        opportunityId,
        body,
        `invalid-${field}-${crypto.randomUUID()}`,
      );
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toMatchObject({
        code: 'VALIDATION_ERROR',
        field,
      });
    }
    const maximumIncrementableVersion = await updateNextAction(
      setup.company.id,
      opportunityId,
      { expectedVersion: 2_147_483_646, nextAction: 'Still representable' },
      'maximum-incrementable-version',
    );
    expect(maximumIncrementableVersion.status).toBe(409);

    expect(
      (
        await request(
          `/commercial-intake/opportunities/${opportunityId}/next-action`,
          setup.company.id,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ expectedVersion: 1, nextAction: 'No key' }),
          },
        )
      ).status,
    ).toBe(400);

    await pool.query(
      "ALTER TABLE opportunities ADD CONSTRAINT next_action_test_conflict CHECK (next_action <> 'Persistence conflict')",
    );
    try {
      const failure = await updateNextAction(
        setup.company.id,
        opportunityId,
        { expectedVersion: 1, nextAction: 'Persistence conflict' },
        'persistence-conflict',
      );
      expect(failure.status).toBe(500);
    } finally {
      await pool.query(
        'ALTER TABLE opportunities DROP CONSTRAINT next_action_test_conflict',
      );
    }
    await expectOpportunityState(opportunityId, {
      nextAction: representativeBody().opportunity.nextAction,
      version: 1,
      updateEvents: 0,
      receipts: [],
    });
  });

  it('reaches the PostgreSQL integer maximum once, confirms it without writes and refuses an overflowing update atomically', async () => {
    const setup = await prepared();
    const created = detail(
      await command(
        '/commercial-intake/requests',
        representativeBody(),
        'next-action-maximum-source',
        setup.company.id,
      ),
    );
    const opportunityId = created.initialOpportunity.id;
    // Reaching the boundary through 2^31 commands is impractical; the seeded
    // row carries the last-update trace every version above 1 requires.
    await pool.query(
      `UPDATE opportunities
          SET version = 2147483646,
              last_updated_by_internal_user_id = responsible_internal_user_id,
              last_updated_by_workspace_membership_id = responsible_workspace_membership_id,
              last_updated_at = now()
        WHERE id = $1`,
      [opportunityId],
    );

    const premature = await updateNextAction(
      setup.company.id,
      opportunityId,
      { expectedVersion: 2_147_483_647, nextAction: 'Premature maximum' },
      'maximum-premature',
    );
    expect(premature.status).toBe(409);
    expect(await premature.json()).toMatchObject({ code: 'STALE_VERSION' });

    const finalIncrement = await updateNextAction(
      setup.company.id,
      opportunityId,
      { expectedVersion: 2_147_483_646, nextAction: 'Final increment' },
      'maximum-final-increment',
    );
    expect(finalIncrement.status).toBe(200);
    const finalBody = record(await finalIncrement.json());
    expect(finalBody.receipt).toEqual({
      opportunityId,
      nextAction: 'Final increment',
      version: 2_147_483_647,
      outcome: 'updated',
    });
    expect(record(finalBody.request).initialOpportunity).toMatchObject({
      nextAction: 'Final increment',
      version: 2_147_483_647,
    });
    expect(
      (
        await pool.query(
          `SELECT metadata FROM commercial_intake_events
            WHERE opportunity_id = $1 AND action = 'opportunity.next_action.updated'`,
          [opportunityId],
        )
      ).rows,
    ).toEqual([{ metadata: { opportunityVersion: 2_147_483_647 } }]);
    const atMaximum = await pool.query<JsonRow>(
      'SELECT to_jsonb(opportunity) AS row FROM opportunities AS opportunity WHERE id = $1',
      [opportunityId],
    );

    const unchanged = await updateNextAction(
      setup.company.id,
      opportunityId,
      { expectedVersion: 2_147_483_647, nextAction: 'Final increment' },
      'maximum-no-op',
    );
    expect(unchanged.status).toBe(200);
    const unchangedBody = record(await unchanged.json());
    expect(unchangedBody.receipt).toEqual({
      opportunityId,
      nextAction: 'Final increment',
      version: 2_147_483_647,
      outcome: 'unchanged',
    });

    const unassigned = entity(
      await command(
        '/companies',
        { displayName: 'Unassigned at maximum' },
        'next-action-maximum-unassigned-company',
      ),
    );
    const overflowBody = {
      expectedVersion: 2_147_483_647,
      nextAction: 'Overflowing update',
    };
    expect(
      (
        await updateNextAction(
          unassigned.id,
          opportunityId,
          overflowBody,
          'maximum-overflow-denied',
        )
      ).status,
    ).toBe(403);
    const overflow = await updateNextAction(
      setup.company.id,
      opportunityId,
      overflowBody,
      'maximum-overflow',
    );
    expect(overflow.status).toBe(409);
    expect(await overflow.json()).toEqual({
      code: 'VERSION_EXHAUSTED',
      message: 'The Opportunity version cannot be incremented.',
    });

    // Changed key reuse conflicts before any version check; a new key with
    // the previous observation stays a stale refusal.
    const changedReuse = await updateNextAction(
      setup.company.id,
      opportunityId,
      overflowBody,
      'maximum-final-increment',
    );
    expect(changedReuse.status).toBe(409);
    expect(await changedReuse.json()).toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    const stale = await updateNextAction(
      setup.company.id,
      opportunityId,
      { expectedVersion: 2_147_483_646, nextAction: 'Stale after maximum' },
      'maximum-stale',
    );
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ code: 'STALE_VERSION' });

    // Exact replays confirm their recorded receipts, including the final
    // increment whose observed version is now stale.
    const finalReplay = await updateNextAction(
      setup.company.id,
      opportunityId,
      { expectedVersion: 2_147_483_646, nextAction: 'Final increment' },
      'maximum-final-increment',
    );
    expect(finalReplay.status).toBe(200);
    expect(record(await finalReplay.json()).receipt).toEqual(finalBody.receipt);
    const noOpReplay = await updateNextAction(
      setup.company.id,
      opportunityId,
      { expectedVersion: 2_147_483_647, nextAction: 'Final increment' },
      'maximum-no-op',
    );
    expect(noOpReplay.status).toBe(200);
    expect(record(await noOpReplay.json()).receipt).toEqual(
      unchangedBody.receipt,
    );

    expect(
      (
        await pool.query<JsonRow>(
          'SELECT to_jsonb(opportunity) AS row FROM opportunities AS opportunity WHERE id = $1',
          [opportunityId],
        )
      ).rows,
    ).toEqual(atMaximum.rows);
    await expectOpportunityState(opportunityId, {
      nextAction: 'Final increment',
      version: 2_147_483_647,
      updateEvents: 1,
      receipts: [
        { outcome: 'updated', result_version: 2_147_483_647 },
        { outcome: 'unchanged', result_version: 2_147_483_647 },
      ],
    });
  });

  it('associates one existing Client once, preserves Request history and replays one durable receipt after restart', async () => {
    const setup = await prepared(true);
    const client = entity(
      await command(
        '/clients',
        { displayName: 'Existing association Client' },
        'association-client',
        setup.company.id,
      ),
    );
    const created = detail(
      await command(
        '/commercial-intake/requests',
        representativeBody(),
        'association-request',
        setup.company.id,
      ),
    );
    expect(created).toMatchObject({
      version: 1,
      clientAssociationStatus: 'absent',
    });
    expect(created).not.toHaveProperty('clientReference');
    const immutableBefore = await pool.query(
      `SELECT original_text, source_kind, source_label, reported_received_at,
              subject, captured_by_internal_user_id,
              captured_by_workspace_membership_id, captured_at
         FROM client_requests WHERE id = $1`,
      [created.id],
    );
    const opportunityBefore = await pool.query<JsonRow>(
      'SELECT to_jsonb(opportunity) AS row FROM opportunities AS opportunity WHERE client_request_id = $1',
      [created.id],
    );

    const response = await associateClient(
      setup.company.id,
      created.id,
      { expectedVersion: 1, clientAccountId: client.id },
      'associate-once',
    );
    expect(response.status).toBe(200);
    const associated = record(await response.json());
    expect(associated.receipt).toEqual({
      requestId: created.id,
      version: 2,
      outcome: 'associated',
    });
    expect(associated.request).toEqual({
      ...created,
      version: 2,
      clientAssociationStatus: 'visible',
      clientReference: {
        originalClientId: client.id,
        currentClientId: client.id,
        displayName: 'Existing association Client',
      },
    });
    expect(
      (
        await pool.query(
          `SELECT original_text, source_kind, source_label, reported_received_at,
                  subject, captured_by_internal_user_id,
                  captured_by_workspace_membership_id, captured_at
             FROM client_requests WHERE id = $1`,
          [created.id],
        )
      ).rows,
    ).toEqual(immutableBefore.rows);
    expect(
      (
        await pool.query<JsonRow>(
          'SELECT to_jsonb(opportunity) AS row FROM opportunities AS opportunity WHERE client_request_id = $1',
          [created.id],
        )
      ).rows,
    ).toEqual(opportunityBefore.rows);
    expect(
      (
        await pool.query(
          `SELECT action, actor_workspace_membership_id, client_request_id,
                  opportunity_id, metadata
             FROM commercial_intake_events
            WHERE client_request_id = $1
              AND action = 'client_request.client_associated'`,
          [created.id],
        )
      ).rows,
    ).toEqual([
      {
        action: 'client_request.client_associated',
        actor_workspace_membership_id: setup.actor.workspaceMembershipId,
        client_request_id: created.id,
        opportunity_id: created.initialOpportunity.id,
        metadata: { requestVersion: 2 },
      },
    ]);

    const replay = await associateClient(
      setup.company.id,
      created.id,
      { expectedVersion: 1, clientAccountId: client.id },
      'associate-once',
    );
    expect(replay.status).toBe(200);
    expect(record(await replay.json()).receipt).toEqual(associated.receipt);
    const changedReuse = await associateClient(
      setup.company.id,
      created.id,
      { expectedVersion: 2, clientAccountId: client.id },
      'associate-once',
    );
    expect(changedReuse.status).toBe(409);
    expect(await changedReuse.json()).toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    const secondKey = await associateClient(
      setup.company.id,
      created.id,
      { expectedVersion: 1, clientAccountId: client.id },
      'associate-again',
    );
    expect(secondKey.status).toBe(409);
    expect(await secondKey.json()).toMatchObject({
      code: 'CLIENT_ALREADY_ASSOCIATED',
    });
    expect(
      (
        await pool.query(
          'SELECT count(*)::integer AS count FROM commercial_intake_client_association_commands WHERE client_request_id = $1',
          [created.id],
        )
      ).rows,
    ).toEqual([{ count: 1 }]);

    await harness.close();
    await openHarness();
    const reloaded = detail(
      await (
        await request(
          `/commercial-intake/requests/${created.id}`,
          setup.company.id,
        )
      ).json(),
    );
    expect(reloaded).toEqual(record(associated.request));
  });

  it('keeps historical v1 and v2 grants stable, hides unavailable Client identity and revalidates every replay', async () => {
    const setup = await prepared(true);
    const client = entity(
      await command(
        '/clients',
        { displayName: 'Authority boundary Client' },
        'authority-client',
        setup.company.id,
      ),
    );
    const linked = detail(
      await command(
        '/commercial-intake/requests',
        { ...representativeBody(), clientAccountId: client.id },
        'historical-linked-request',
        setup.company.id,
      ),
    );
    const unlinked = detail(
      await command(
        '/commercial-intake/requests',
        { ...representativeBody(), subject: 'Unlinked authority proof' },
        'historical-unlinked-request',
        setup.company.id,
      ),
    );
    const otherCompany = entity(
      await command(
        '/companies',
        { displayName: 'Association isolation Company' },
        'association-isolation-company',
      ),
    );
    for (const path of [
      '/company-commercial-intake-assignments',
      '/company-director-client-assignments',
    ])
      await command(
        path,
        {
          companyId: otherCompany.id,
          workspaceMembershipId: setup.actor.workspaceMembershipId,
        },
        `association-isolation-${path}`,
      );
    const crossCompany = await associateClient(
      otherCompany.id,
      unlinked.id,
      { expectedVersion: 1, clientAccountId: client.id },
      'association-cross-company',
    );
    const unknown = await associateClient(
      otherCompany.id,
      '00000000-0000-4000-8000-000000000994',
      { expectedVersion: 1, clientAccountId: client.id },
      'association-unknown',
    );
    expect(crossCompany.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect(await crossCompany.text()).toBe(await unknown.text());
    expect(
      (
        await request(
          `/commercial-intake/requests/${unlinked.id}/client-association`,
          setup.company.id,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'idempotency-key': 'association-foreign-workspace',
              'x-workspace-context-id': '00000000-0000-4000-8000-000000000996',
            },
            body: JSON.stringify({
              expectedVersion: 1,
              clientAccountId: client.id,
            }),
          },
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(
          `${origin}/api/commercial-intake/requests/${unlinked.id}/client-association`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'idempotency-key': 'association-anonymous',
            },
            body: JSON.stringify({
              expectedVersion: 1,
              clientAccountId: client.id,
            }),
          },
        )
      ).status,
    ).toBe(401);
    await pool.query(
      `UPDATE company_role_assignments
          SET permission_set_version = 'v2'
        WHERE workspace_id = $1 AND company_id = $2
          AND workspace_membership_id = $3
          AND bundle = 'company_commercial_intake' AND revoked_at IS NULL`,
      [WORKSPACE_ID, setup.company.id, setup.actor.workspaceMembershipId],
    );
    const v2Actor = record(
      await (await request('/access/current-actor', setup.company.id)).json(),
    );
    expect(
      record(v2Actor.activeCompany).commercialIntakePermissions,
    ).not.toContain('commercial.request.client.associate');
    expect(
      (
        await associateClient(
          setup.company.id,
          unlinked.id,
          { expectedVersion: 1, clientAccountId: client.id },
          'v2-denied',
        )
      ).status,
    ).toBe(403);
    await pool.query(
      `UPDATE company_role_assignments
          SET permission_set_version = 'v1'
        WHERE workspace_id = $1 AND company_id = $2
          AND workspace_membership_id = $3
          AND bundle = 'company_commercial_intake' AND revoked_at IS NULL`,
      [WORKSPACE_ID, setup.company.id, setup.actor.workspaceMembershipId],
    );
    expect(
      detail(
        await (
          await request(
            `/commercial-intake/requests/${linked.id}`,
            setup.company.id,
          )
        ).json(),
      ),
    ).toMatchObject({
      version: 1,
      clientAssociationStatus: 'visible',
      clientReference: { originalClientId: client.id },
    });

    await pool.query(
      `UPDATE company_role_assignments
          SET permission_set_version = 'v3'
        WHERE workspace_id = $1 AND company_id = $2
          AND workspace_membership_id = $3
          AND bundle = 'company_commercial_intake' AND revoked_at IS NULL`,
      [WORKSPACE_ID, setup.company.id, setup.actor.workspaceMembershipId],
    );
    expect(
      (
        await associateClient(
          setup.company.id,
          unlinked.id,
          { expectedVersion: 1, clientAccountId: client.id },
          'authority-associated',
        )
      ).status,
    ).toBe(200);
    await pool.query(
      `UPDATE company_role_assignments SET revoked_at = clock_timestamp()
        WHERE workspace_id = $1 AND company_id = $2
          AND workspace_membership_id = $3
          AND bundle = 'company_director_client' AND revoked_at IS NULL`,
      [WORKSPACE_ID, setup.company.id, setup.actor.workspaceMembershipId],
    );
    const hidden = detail(
      await (
        await request(
          `/commercial-intake/requests/${unlinked.id}`,
          setup.company.id,
        )
      ).json(),
    );
    expect(hidden).toMatchObject({
      version: 2,
      clientAssociationStatus: 'hidden',
    });
    expect(hidden).not.toHaveProperty('clientReference');
    const unavailableReplay = await associateClient(
      setup.company.id,
      unlinked.id,
      { expectedVersion: 1, clientAccountId: client.id },
      'authority-associated',
    );
    expect(unavailableReplay.status).toBe(404);
    expect(await unavailableReplay.json()).toMatchObject({
      code: 'CLIENT_REFERENCE_UNAVAILABLE',
    });
    await pool.query(
      `UPDATE company_role_assignments SET revoked_at = clock_timestamp()
        WHERE workspace_id = $1 AND company_id = $2
          AND workspace_membership_id = $3
          AND bundle = 'company_commercial_intake' AND revoked_at IS NULL`,
      [WORKSPACE_ID, setup.company.id, setup.actor.workspaceMembershipId],
    );
    expect(
      (
        await associateClient(
          setup.company.id,
          unlinked.id,
          { expectedVersion: 1, clientAccountId: client.id },
          'authority-associated',
        )
      ).status,
    ).toBe(403);
  });

  it('serializes competing associations and rolls every partial write back on receipt failure', async () => {
    const setup = await preparedRestrictedMember(true);
    const firstClient = entity(
      await command(
        '/clients',
        { displayName: 'First race Client' },
        'race-first-client',
        setup.company.id,
      ),
    );
    const secondClient = entity(
      await command(
        '/clients',
        { displayName: 'Second race Client' },
        'race-second-client',
        setup.company.id,
      ),
    );
    const created = detail(
      await command(
        '/commercial-intake/requests',
        representativeBody(),
        'race-request',
        setup.company.id,
      ),
    );
    const barrier = await pool.connect();
    let released = false;
    try {
      await barrier.query('BEGIN');
      const blocker = await barrier.query<{ backendPid: number }>(
        'SELECT pg_backend_pid() AS "backendPid"',
      );
      const backendPid = blocker.rows[0]?.backendPid;
      if (backendPid === undefined) throw new Error('Missing blocker backend.');
      await barrier.query(
        'SELECT id FROM client_requests WHERE id = $1 FOR UPDATE',
        [created.id],
      );
      const first = associateClient(
        setup.company.id,
        created.id,
        { expectedVersion: 1, clientAccountId: firstClient.id },
        'race-owner',
      );
      const second = associateClientAs(
        setup.company.id,
        created.id,
        { expectedVersion: 1, clientAccountId: secondClient.id },
        'race-member',
        setup.memberHeaders,
      );
      await waitForBlockedCount(backendPid, 2);
      await barrier.query('COMMIT');
      released = true;
      const outcomes = await Promise.all([first, second]);
      expect(outcomes.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      const rejected = outcomes.find((response) => response.status === 409);
      if (!rejected) throw new Error('Expected one refused association.');
      expect(await rejected.json()).toMatchObject({
        code: 'CLIENT_ALREADY_ASSOCIATED',
      });
    } finally {
      if (!released) await barrier.query('ROLLBACK');
      barrier.release();
    }
    expect(
      (
        await pool.query(
          `SELECT
             (SELECT count(*)::integer FROM commercial_intake_client_association_commands WHERE client_request_id = $1) AS receipts,
             (SELECT count(*)::integer FROM commercial_intake_events WHERE client_request_id = $1 AND action = 'client_request.client_associated') AS events`,
          [created.id],
        )
      ).rows,
    ).toEqual([{ receipts: 1, events: 1 }]);

    const replayRequest = detail(
      await command(
        '/commercial-intake/requests',
        { ...representativeBody(), subject: 'Concurrent exact replay proof' },
        'concurrent-replay-request',
        setup.company.id,
      ),
    );
    const replayCommand = {
      expectedVersion: 1,
      clientAccountId: firstClient.id,
    };
    const concurrentReplays = await Promise.all([
      associateClient(
        setup.company.id,
        replayRequest.id,
        replayCommand,
        'concurrent-exact-replay',
      ),
      associateClient(
        setup.company.id,
        replayRequest.id,
        replayCommand,
        'concurrent-exact-replay',
      ),
    ]);
    expect(concurrentReplays.map((response) => response.status)).toEqual([
      200, 200,
    ]);
    const replayBodies = await Promise.all(
      concurrentReplays.map((response) => response.json()),
    );
    expect(replayBodies[1]).toEqual(replayBodies[0]);
    expect(
      (
        await pool.query(
          `SELECT
             (SELECT count(*)::integer FROM commercial_intake_client_association_commands WHERE client_request_id = $1) AS receipts,
             (SELECT count(*)::integer FROM commercial_intake_events WHERE client_request_id = $1 AND action = 'client_request.client_associated') AS events`,
          [replayRequest.id],
        )
      ).rows,
    ).toEqual([{ receipts: 1, events: 1 }]);

    const rollbackRequest = detail(
      await command(
        '/commercial-intake/requests',
        { ...representativeBody(), subject: 'Rollback association proof' },
        'rollback-request',
        setup.company.id,
      ),
    );
    await pool.query(`
      CREATE FUNCTION test_fail_client_association_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'synthetic receipt failure';
      END $$;
      CREATE TRIGGER test_fail_client_association_receipt
        BEFORE INSERT ON commercial_intake_client_association_commands
        FOR EACH ROW EXECUTE FUNCTION test_fail_client_association_receipt();
    `);
    try {
      expect(
        (
          await associateClient(
            setup.company.id,
            rollbackRequest.id,
            { expectedVersion: 1, clientAccountId: firstClient.id },
            'rollback-association',
          )
        ).status,
      ).toBe(500);
    } finally {
      await pool.query(
        'DROP TRIGGER IF EXISTS test_fail_client_association_receipt ON commercial_intake_client_association_commands; DROP FUNCTION IF EXISTS test_fail_client_association_receipt()',
      );
    }
    expect(
      (
        await pool.query(
          `SELECT version, client_account_id,
             (SELECT count(*)::integer FROM commercial_intake_events WHERE client_request_id = $1 AND action = 'client_request.client_associated') AS events,
             (SELECT count(*)::integer FROM commercial_intake_client_association_commands WHERE client_request_id = $1) AS receipts
           FROM client_requests WHERE id = $1`,
          [rollbackRequest.id],
        )
      ).rows,
    ).toEqual([
      { version: 1, client_account_id: null, events: 0, receipts: 0 },
    ]);
  });

  it('rechecks the public Client owner fence after a relationship change wins the lock race', async () => {
    const setup = await prepared(true);
    const client = entity(
      await command(
        '/clients',
        { displayName: 'Racing relationship Client' },
        'relationship-race-client',
        setup.company.id,
      ),
    );
    const created = detail(
      await command(
        '/commercial-intake/requests',
        representativeBody(),
        'relationship-race-request',
        setup.company.id,
      ),
    );
    const barrier = await pool.connect();
    let released = false;
    try {
      await barrier.query('BEGIN');
      const blocker = await barrier.query<{ backendPid: number }>(
        'SELECT pg_backend_pid() AS "backendPid"',
      );
      const backendPid = blocker.rows[0]?.backendPid;
      if (backendPid === undefined) throw new Error('Missing blocker backend.');
      await barrier.query(
        'SELECT id FROM client_accounts WHERE id = $1 FOR UPDATE',
        [client.id],
      );
      const pending = associateClient(
        setup.company.id,
        created.id,
        { expectedVersion: 1, clientAccountId: client.id },
        'relationship-race-association',
      );
      await waitForBlockedBy(backendPid);
      await barrier.query(
        "UPDATE client_company_relationships SET status = 'archived' WHERE workspace_id = $1 AND company_id = $2 AND client_account_id = $3",
        [WORKSPACE_ID, setup.company.id, client.id],
      );
      await barrier.query('COMMIT');
      released = true;
      const response = await pending;
      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        code: 'CLIENT_REFERENCE_UNAVAILABLE',
      });
    } finally {
      if (!released) await barrier.query('ROLLBACK');
      barrier.release();
    }
    expect(
      (
        await pool.query(
          `SELECT version, client_account_id,
             (SELECT count(*)::integer FROM commercial_intake_events WHERE client_request_id = $1 AND action = 'client_request.client_associated') AS events,
             (SELECT count(*)::integer FROM commercial_intake_client_association_commands WHERE client_request_id = $1) AS receipts
           FROM client_requests WHERE id = $1`,
          [created.id],
        )
      ).rows,
    ).toEqual([
      { version: 1, client_account_id: null, events: 0, receipts: 0 },
    ]);
  });

  function associateClient(
    companyId: string,
    clientRequestId: string,
    body: unknown,
    key: string,
  ) {
    return associateClientAs(companyId, clientRequestId, body, key, {});
  }

  function associateClientAs(
    companyId: string,
    clientRequestId: string,
    body: unknown,
    key: string,
    headers: Record<string, string>,
  ) {
    return request(
      `/commercial-intake/requests/${clientRequestId}/client-association`,
      companyId,
      {
        method: 'POST',
        headers: {
          ...headers,
          'content-type': 'application/json',
          'idempotency-key': key,
        },
        body: JSON.stringify(body),
      },
    );
  }

  function updateNextAction(
    companyId: string,
    opportunityId: string,
    body: unknown,
    key: string,
  ) {
    return updateNextActionAs(companyId, opportunityId, body, key, {});
  }

  function updateNextActionAs(
    companyId: string,
    opportunityId: string,
    body: unknown,
    key: string,
    headers: Record<string, string>,
  ) {
    return request(
      `/commercial-intake/opportunities/${opportunityId}/next-action`,
      companyId,
      {
        method: 'POST',
        headers: {
          ...headers,
          'content-type': 'application/json',
          'idempotency-key': key,
        },
        body: JSON.stringify(body),
      },
    );
  }

  async function expectOpportunityState(
    opportunityId: string,
    expected: {
      nextAction: string;
      version: number;
      updateEvents: number;
      receipts: Array<{ outcome: string; result_version: number }>;
    },
  ): Promise<void> {
    const opportunity = await pool.query<{
      next_action: string;
      version: number;
    }>('SELECT next_action, version FROM opportunities WHERE id = $1', [
      opportunityId,
    ]);
    expect(opportunity.rows).toEqual([
      { next_action: expected.nextAction, version: expected.version },
    ]);
    const events = await pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM commercial_intake_events
        WHERE opportunity_id = $1 AND action = 'opportunity.next_action.updated'`,
      [opportunityId],
    );
    expect(events.rows).toEqual([{ count: String(expected.updateEvents) }]);
    const receipts = await pool.query<{
      outcome: string;
      result_version: number;
    }>(
      `SELECT outcome, result_version FROM commercial_intake_next_action_commands
        WHERE opportunity_id = $1 ORDER BY created_at, id`,
      [opportunityId],
    );
    expect(receipts.rows).toEqual(expected.receipts);
  }

  async function waitForLockWaiters(expected: number): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const waiting = await pool.query<{ count: string }>(
        `SELECT count(*) AS count
           FROM pg_stat_activity
          WHERE datname = current_database()
            AND wait_event_type = 'Lock'
            AND query ILIKE '%from "opportunities"%for update%'`,
      );
      if (Number(waiting.rows[0]?.count) >= expected) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('The concurrent updates did not reach the lock barrier.');
  }

  function request(path: string, companyId?: string, init: RequestInit = {}) {
    return fetch(`${origin}/api${path}`, {
      ...init,
      headers: {
        'x-test-external-provider': 'deterministic-test',
        'x-test-external-subject': 'workspace-owner',
        'x-test-display-name': 'Workspace Owner',
        'x-test-email': 'owner@example.test',
        ...(companyId ? { 'x-company-context-id': companyId } : {}),
        ...init.headers,
      },
    });
  }

  async function command(
    path: string,
    body: unknown,
    key: string,
    companyId?: string,
  ) {
    const response = await request(path, companyId, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(201);
    const value: unknown = await response.json();
    return value;
  }

  async function prepared(clientAccess = false) {
    const company = entity(
      await command(
        '/companies',
        { displayName: 'PRISMA-PRIM' },
        `company-${crypto.randomUUID()}`,
      ),
    );
    const actor = actorRecord(
      await (await request('/access/current-actor', company.id)).json(),
    );
    await command(
      '/company-commercial-intake-assignments',
      {
        companyId: company.id,
        workspaceMembershipId: actor.workspaceMembershipId,
      },
      `commercial-${crypto.randomUUID()}`,
    );
    if (clientAccess)
      await command(
        '/company-director-client-assignments',
        {
          companyId: company.id,
          workspaceMembershipId: actor.workspaceMembershipId,
        },
        `client-${crypto.randomUUID()}`,
      );
    return { company, actor };
  }

  function postIntake(companyId: string, body: unknown, key: string) {
    return request('/commercial-intake/requests', companyId, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      body: JSON.stringify(body),
    });
  }

  function postIntakeAs(
    companyId: string,
    body: unknown,
    key: string,
    headers: Record<string, string>,
  ) {
    return request('/commercial-intake/requests', companyId, {
      method: 'POST',
      headers: {
        ...headers,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      body: JSON.stringify(body),
    });
  }

  async function preparedRestrictedMember(clientAccess = false) {
    const setup = await prepared();
    const memberHeaders = {
      'x-test-external-subject': 'commercial-only-member',
      'x-test-display-name': 'Commercial Member',
      'x-test-email': 'commercial-member@example.test',
    };
    const member = actorRecord(
      await (
        await request('/access/current-actor', undefined, {
          headers: memberHeaders,
        })
      ).json(),
    );
    const paths = [
      '/company-context-assignments',
      '/company-commercial-intake-assignments',
      ...(clientAccess ? ['/company-director-client-assignments'] : []),
    ];
    for (const path of paths)
      await command(
        path,
        {
          companyId: setup.company.id,
          workspaceMembershipId: member.workspaceMembershipId,
        },
        `${path}-${crypto.randomUUID()}`,
      );
    return { ...setup, member, memberHeaders };
  }

  async function lockAssignment(
    workspaceMembershipId: string,
    companyId: string,
    bundle: string,
  ): Promise<{ connection: PoolClient; backendPid: number }> {
    const connection = await pool.connect();
    try {
      await connection.query('BEGIN');
      const backend = await connection.query<{ backendPid: number }>(
        'SELECT pg_backend_pid() AS "backendPid"',
      );
      const backendPid = backend.rows[0]?.backendPid;
      if (backendPid === undefined) throw new Error('Missing blocker backend.');
      const assignment = await connection.query(
        `SELECT id
           FROM company_role_assignments
          WHERE workspace_id = $1
            AND workspace_membership_id = $2
            AND company_id = $3
            AND bundle = $4
            AND revoked_at IS NULL
          FOR UPDATE`,
        [WORKSPACE_ID, workspaceMembershipId, companyId, bundle],
      );
      if (assignment.rowCount !== 1)
        throw new Error('Expected one active assignment to lock.');
      return { connection, backendPid };
    } catch (error) {
      await connection.query('ROLLBACK');
      connection.release();
      throw error;
    }
  }

  async function waitForBlockedBy(backendPid: number): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const blocked = await pool.query<{ blocked: boolean }>(
        `SELECT EXISTS (
           SELECT 1
             FROM pg_stat_activity
            WHERE datname = current_database()
              AND $1::integer = ANY(pg_blocking_pids(pid))
         ) AS blocked`,
        [backendPid],
      );
      if (blocked.rows[0]?.blocked) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('The intake transaction did not reach the lock barrier.');
  }

  async function waitForBlockedCount(
    backendPid: number,
    expected: number,
  ): Promise<void> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const blocked = await pool.query<{ count: string }>(
        `SELECT count(*) AS count FROM pg_stat_activity
          WHERE datname = current_database()
            AND $1::integer = ANY(pg_blocking_pids(pid))`,
        [backendPid],
      );
      if (Number(blocked.rows[0]?.count) >= expected) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('The association commands did not reach the lock barrier.');
  }

  async function expectCommercialIntakeCount(expected: number): Promise<void> {
    const count = await pool.query<{ count: string }>(
      'SELECT count(*) AS count FROM client_requests',
    );
    expect(count.rows).toEqual([{ count: String(expected) }]);
  }

  async function unionSetup() {
    const setup = await prepared(true);
    const client = entity(
      await command(
        '/clients',
        { displayName: 'Canonical identity' },
        'commercial-canonical-client',
        setup.company.id,
      ),
    );
    const other = entity(
      await command(
        '/companies',
        { displayName: 'BIC' },
        'commercial-union-company',
      ),
    );
    for (const path of [
      '/company-commercial-intake-assignments',
      '/company-director-client-assignments',
    ])
      await command(
        path,
        {
          companyId: other.id,
          workspaceMembershipId: setup.actor.workspaceMembershipId,
        },
        `commercial-union-grant-${path}`,
      );
    const second = entity(
      await command(
        '/clients',
        { displayName: 'Legacy identity' },
        'commercial-legacy-client',
        other.id,
      ),
    );
    await pool.query(
      'UPDATE client_accounts SET tax_id = $1 WHERE id IN ($2, $3)',
      ['COMMERCIAL-UNION', client.id, second.id],
    );
    async function unite(): Promise<string> {
      const review = record(
        await command(
          `/clients/${client.id}/union-reviews`,
          {},
          crypto.randomUUID(),
          setup.company.id,
        ),
      );
      const result = record(
        await command(
          `/client-union-reviews/${stringField(review, 'reviewReference')}/confirm`,
          {
            canonicalClientId: client.id,
            fields: {
              displayName: client.id,
              taxId: client.id,
              address: client.id,
              telephone: client.id,
              generalEmail: client.id,
              businessActivity: client.id,
            },
            companyIds: [setup.company.id, other.id],
            reviewedDifferences: true,
            reason: 'Same synthetic identity.',
          },
          crypto.randomUUID(),
          setup.company.id,
        ),
      );
      return stringField(result, 'projectionReference');
    }
    function reverse(reference: string) {
      return request(
        `/client-union-operations/${reference}/reversal`,
        setup.company.id,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': crypto.randomUUID(),
          },
          body: JSON.stringify({
            companyIds: [setup.company.id, other.id],
            reason: 'Revert synthetic union.',
          }),
        },
      );
    }
    return { ...setup, client, other, second, unite, reverse };
  }
});

type JsonRow = { row: Record<string, unknown> };

function representativeBody() {
  return {
    originalText:
      'Please help us prepare our internal quality processes before our planned review.',
    sourceLabel: 'Manual entry from a phone request',
    subject: 'Quality process preparation',
    opportunity: {
      title: 'Prepare quality process review',
      scope: 'Initial discussion to identify the requested work',
      nextAction: 'Arrange a qualification call',
    },
  };
}

function entity(value: unknown): { id: string } {
  const result = record(value);
  return { id: stringField(result, 'id') };
}

function actorRecord(value: unknown): {
  workspaceMembershipId: string;
  displayName: string;
} {
  const result = record(value);
  return {
    workspaceMembershipId: stringField(result, 'workspaceMembershipId'),
    displayName: stringField(result, 'displayName'),
  };
}

function detail(value: unknown) {
  const result = record(value);
  const opportunity = record(result.initialOpportunity);
  return {
    ...result,
    id: stringField(result, 'id'),
    capturedAt: stringField(result, 'capturedAt'),
    ...(result.clientReference === undefined
      ? {}
      : { clientReference: clientReference(result.clientReference) }),
    initialOpportunity: {
      ...opportunity,
      id: stringField(opportunity, 'id'),
    },
  };
}

function listedResponsibleActor(value: unknown, requestId: string): unknown {
  const items = record(value).items;
  if (!Array.isArray(items)) throw new Error('Expected list items.');
  const item = items.find((candidate) => record(candidate).id === requestId);
  if (item === undefined) throw new Error(`Expected Request ${requestId}.`);
  return record(record(item).initialOpportunity).responsibleActor;
}

function listPage(value: unknown): {
  items: Array<
    Record<string, unknown> & { id: string; clientDossierId?: string }
  >;
  nextCursor?: string;
} {
  const page = record(value);
  if (!Array.isArray(page.items)) throw new Error('Expected a Request page.');
  return {
    ...page,
    items: page.items.map((item: unknown) => {
      const row = record(item);
      const clientDossierId =
        row.clientDossierId === undefined
          ? undefined
          : stringField(row, 'clientDossierId');
      return {
        ...row,
        id: stringField(row, 'id'),
        ...(clientDossierId === undefined ? {} : { clientDossierId }),
      };
    }),
    ...(page.nextCursor === undefined
      ? {}
      : { nextCursor: stringField(page, 'nextCursor') }),
  };
}

function clientReference(value: unknown): {
  originalClientId: string;
  currentClientId?: string;
  displayName: string;
} {
  const result = record(value);
  return {
    originalClientId: stringField(result, 'originalClientId'),
    ...(result.currentClientId === undefined
      ? {}
      : { currentClientId: stringField(result, 'currentClientId') }),
    displayName: stringField(result, 'displayName'),
  };
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected an object response.');
  return Object.fromEntries(Object.entries(value));
}

function stringField(value: Record<string, unknown>, field: string): string {
  const result = value[field];
  if (typeof result !== 'string') throw new Error(`Expected ${field}.`);
  return result;
}
