import type { Pool } from 'pg';
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
      permissionSetVersion: 'v1',
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
    expect(
      await (
        await request(`/commercial-intake/requests/${created.id}`, company.id)
      ).json(),
    ).toEqual(created);
    expect(
      await (await request('/commercial-intake/requests', company.id)).json(),
    ).toEqual({
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
    expect(activity.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'client_request.created',
          target: {
            type: 'client_request',
            clientRequestId: created.id,
            companyId: company.id,
          },
          metadata: { requestVersion: 1 },
        }),
        expect.objectContaining({
          action: 'opportunity.created',
          target: {
            type: 'opportunity',
            opportunityId: created.initialOpportunity.id,
            clientRequestId: created.id,
            companyId: company.id,
          },
          metadata: { opportunityVersion: 1 },
        }),
      ]),
    );

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
    ]);
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
    const setup = await prepared(true);
    const client = entity(
      await command(
        '/clients',
        { displayName: 'Hidden after revocation' },
        'revoked-client',
        setup.company.id,
      ),
    );
    const body = { ...representativeBody(), clientAccountId: client.id };
    const created = detail(
      await command(
        '/commercial-intake/requests',
        body,
        'linked-before-revocation',
        setup.company.id,
      ),
    );
    const revoked = await request(
      `/company-director-client-assignments/${setup.actor.workspaceMembershipId}/${setup.company.id}`,
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
    );
    expect(detailResponse.status).toBe(200);
    const redacted = record(await detailResponse.json());
    expect(redacted).not.toHaveProperty('clientReference');
    expect(JSON.stringify(redacted)).not.toContain('Hidden after revocation');
    const replay = await postIntake(
      setup.company.id,
      body,
      'linked-before-revocation',
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

function clientReference(value: unknown): {
  originalClientId: string;
  currentClientId: string;
  displayName: string;
} {
  const result = record(value);
  return {
    originalClientId: stringField(result, 'originalClientId'),
    currentClientId: stringField(result, 'currentClientId'),
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
