import type { Pool } from 'pg';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000238';
const withPostgres = databaseUrl ? describe : describe.skip;
withPostgres('Preparatory Project REST', () => {
  let harness: PostgresRestTestHarness;
  let database: IsolatedPostgresTestDatabase;
  let origin: string;
  let pool: Pool;
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'projects',
    });
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'workspace-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Project Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          {
            provider: 'deterministic-test',
            subject: 'member',
            workspaceId: WORKSPACE_ID,
          },
        ]),
      },
    });
    ({ origin, pool } = harness);
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

  it('requires an explicit grant before creating and reopening one preparatory Project with one event', async () => {
    const company = await command(
      '/companies',
      { displayName: 'PRISMA-PRIM' },
      'company',
    );
    const client = await command(
      '/clients',
      { displayName: 'Synthetic Client' },
      'client',
      company.id,
    );
    expect((await request('/projects', company.id)).status).toBe(403);
    const actor = await (
      await request('/access/current-actor', company.id)
    ).json();
    const grant = await command(
      '/company-project-assignments',
      {
        companyId: company.id,
        workspaceMembershipId: actor.workspaceMembershipId,
      },
      'grant',
    );
    expect(grant.permissionSetVersion).toBe('v1');
    const project = await command(
      '/projects',
      { title: '  ISO preparation  ', clientAccountId: client.id },
      'project',
      company.id,
    );
    expect(project).toMatchObject({
      title: 'ISO preparation',
      status: 'preparatory',
      companyId: company.id,
      clientAccountId: client.id,
    });
    expect(project).not.toHaveProperty('clientDossierId');
    expect(await (await request('/projects', company.id)).json()).toEqual([
      project,
    ]);
    expect(
      await (await request(`/projects/${project.id}`, company.id)).json(),
    ).toEqual(project);
    const retry = await command(
      '/projects',
      { title: 'ISO preparation', clientAccountId: client.id },
      'project',
      company.id,
    );
    expect(retry).toEqual(project);
    const events = await (await request('/activity-log', company.id)).json();
    expect(
      events.events.filter(
        (event: { action: string }) => event.action === 'project.created',
      ),
    ).toEqual([
      expect.objectContaining({
        target: {
          type: 'project',
          projectId: project.id,
          projectTitle: project.title,
          companyId: company.id,
        },
        metadata: {},
      }),
    ]);
  });

  it('orders dated activity across grants and Projects under one 50-event cap while retaining redacted union projections', async () => {
    const setup = await unionSetup();
    const projectionReference = await setup.unite();
    const projectIds: string[] = [];
    for (let index = 0; index < 51; index += 1) {
      const project = await command(
        '/projects',
        { title: `Preparation ${index}`, clientAccountId: setup.client.id },
        `ordered-${index}`,
        setup.company.id,
      );
      if (typeof project.id !== 'string')
        throw new Error('Expected a Project identifier.');
      projectIds.push(project.id);
      // Fixed synthetic times make the API's chronological contract independent
      // of machine speed and Date serialization precision.
      await pool.query(
        "UPDATE project_creation_events SET occurred_at = $1::timestamptz + $2::integer * interval '1 second' WHERE project_id = $3",
        ['2030-03-01T10:00:00Z', index, project.id],
      );
    }
    await pool.query(
      "UPDATE project_creation_events SET id = '00000000-0000-4000-8000-000000000050', occurred_at = '2030-03-01T12:00:00Z' WHERE project_id = $1",
      [projectIds[50]],
    );
    await pool.query(
      "UPDATE activity_log_events SET occurred_at = '2030-03-01T09:00:00Z'",
    );
    await pool.query(
      "UPDATE activity_log_events SET id = 'ffffffff-ffff-4fff-8fff-ffffffffffff', occurred_at = '2030-03-01T12:00:00Z' WHERE action = 'company_project_assignment.granted' AND target_company_id = $1",
      [setup.company.id],
    );
    const response = await request('/activity-log', setup.company.id);
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      !('events' in body) ||
      !Array.isArray(body.events)
    )
      throw new Error('Expected Activity Log events.');
    const events: unknown[] = body.events;
    const dated = events.filter(
      (event) =>
        typeof event === 'object' && event !== null && 'occurredAt' in event,
    );
    expect(dated).toHaveLength(50);
    expect(dated[0]).toMatchObject({
      action: 'company_project_assignment.granted',
      occurredAt: '2030-03-01T12:00:00.000Z',
    });
    expect(dated[1]).toMatchObject({
      action: 'project.created',
      target: { projectId: projectIds[50] },
    });
    expect(dated[2]).toMatchObject({
      action: 'project.created',
      target: { projectId: projectIds[49] },
    });
    expect(dated[49]).toMatchObject({
      action: 'project.created',
      target: { projectId: projectIds[2] },
    });
    expect(events).toHaveLength(51);
    expect(events[50]).toEqual({
      action: 'client.union_confirmed',
      projectionReference,
      companyId: setup.company.id,
      actor: { kind: 'authorized_resolver' },
      target: {
        type: 'client_union_operation',
        projectionReference,
        companyId: setup.company.id,
      },
    });
  });

  it('denies Company-only, Client-only, other-Company and revoked access without exposing Projects or events', async () => {
    const company = await command(
      '/companies',
      { displayName: 'PRISMA-PRIM' },
      'company',
    );
    const other = await command('/companies', { displayName: 'BIC' }, 'other');
    const client = await command(
      '/clients',
      { displayName: 'Synthetic Client' },
      'client',
      company.id,
    );
    const actor = await (await request('/access/current-actor')).json();
    expect(actor.activeCompany?.projectPermissions ?? []).toEqual([]);
    for (const companyId of [company.id, other.id])
      await command(
        '/company-project-assignments',
        { companyId, workspaceMembershipId: actor.workspaceMembershipId },
        `grant-${companyId}`,
      );
    const project = await command(
      '/projects',
      { title: 'Confidential preparation', clientAccountId: client.id },
      'project',
      company.id,
    );
    expect(await (await request('/projects', other.id)).json()).toEqual([]);
    expect((await request(`/projects/${project.id}`, other.id)).status).toBe(
      404,
    );
    expect(
      (
        await request(
          `/projects/00000000-0000-4000-8000-000000000999`,
          other.id,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request('/projects', company.id, {
          headers: {
            'x-workspace-context-id': '00000000-0000-4000-8000-000000000999',
          },
        })
      ).status,
    ).toBe(403);
    expect(
      (await postProject(other.id, client.id, 'wrong-company')).status,
    ).toBe(404);
    const revoke = await request(
      `/company-project-assignments/${actor.workspaceMembershipId}/${company.id}`,
      undefined,
      { method: 'DELETE', headers: { 'idempotency-key': 'revoke' } },
    );
    expect(revoke.status).toBe(200);
    expect((await request('/projects', company.id)).status).toBe(403);
    expect((await request(`/projects/${project.id}`, company.id)).status).toBe(
      403,
    );
    const activity = await (await request('/activity-log', company.id)).json();
    expect(
      activity.events.filter(
        (event: { action: string }) => event.action === 'project.created',
      ),
    ).toEqual([]);
    expect(
      (
        await postProject(
          company.id,
          client.id,
          'project',
          'Confidential preparation',
        )
      ).status,
    ).toBe(403);
  });

  it('does not turn Project assignment into Client authority and denies inactive membership immediately', async () => {
    const { company, client } = await prepared();
    const memberHeaders = {
      'x-test-external-subject': 'member',
      'x-test-display-name': 'Member',
      'x-test-email': 'member@example.test',
    };
    const member = await (
      await request('/access/current-actor', undefined, {
        headers: memberHeaders,
      })
    ).json();
    await command(
      '/company-context-assignments',
      {
        companyId: company.id,
        workspaceMembershipId: member.workspaceMembershipId,
      },
      'member-context',
    );
    expect(
      (await request('/projects', company.id, { headers: memberHeaders }))
        .status,
    ).toBe(403);
    await command(
      '/company-project-assignments',
      {
        companyId: company.id,
        workspaceMembershipId: member.workspaceMembershipId,
      },
      'member-project',
    );
    expect(
      (await request('/projects', company.id, { headers: memberHeaders }))
        .status,
    ).toBe(403);
    await command(
      '/company-director-client-assignments',
      {
        companyId: company.id,
        workspaceMembershipId: member.workspaceMembershipId,
      },
      'member-client',
    );
    const project = await command(
      '/projects',
      { title: 'Preparation', clientAccountId: client.id },
      'project',
      company.id,
    );
    expect(
      (
        await request(`/projects/${project.id}`, company.id, {
          headers: memberHeaders,
        })
      ).status,
    ).toBe(200);
    await pool.query(
      "UPDATE workspace_memberships SET status = 'inactive' WHERE id = $1",
      [member.workspaceMembershipId],
    );
    expect(
      (
        await request(`/projects/${project.id}`, company.id, {
          headers: memberHeaders,
        })
      ).status,
    ).toBe(403);
  });

  it('rejects invalid payloads and conflicting retries; concurrent retries save one record and event', async () => {
    const { company, client } = await prepared();
    for (const body of [
      { title: '', clientAccountId: client.id },
      { title: 'x'.repeat(201), clientAccountId: client.id },
      { title: 'valid', clientAccountId: 'invalid' },
      { title: 'valid', clientAccountId: client.id, status: 'active' },
    ]) {
      expect(
        (
          await request('/projects', company.id, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'idempotency-key': 'invalid',
            },
            body: JSON.stringify(body),
          })
        ).status,
      ).toBe(400);
    }
    const responses = await Promise.all([
      postProject(company.id, client.id, 'concurrent'),
      postProject(company.id, client.id, 'concurrent'),
    ]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    expect(await responses[0]?.json()).toEqual(await responses[1]?.json());
    expect(
      (
        await postProject(
          company.id,
          client.id,
          'concurrent',
          'Different title',
        )
      ).status,
    ).toBe(409);
    expect(await (await request('/projects', company.id)).json()).toHaveLength(
      1,
    );
    const activity = await (await request('/activity-log', company.id)).json();
    expect(
      activity.events.filter(
        (event: { action: string }) => event.action === 'project.created',
      ),
    ).toHaveLength(1);
  });

  it('rolls back Project and Client fence when attributable history fails', async () => {
    const { company, client } = await prepared();
    const before = await pool.query(
      'SELECT version FROM client_accounts WHERE id = $1',
      [client.id],
    );
    await pool.query(`CREATE FUNCTION reject_project_event() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'forced event failure'; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER reject_project_event BEFORE INSERT ON project_creation_events FOR EACH ROW EXECUTE FUNCTION reject_project_event()`);
    try {
      expect((await postProject(company.id, client.id, 'atomic')).status).toBe(
        500,
      );
      expect(await (await request('/projects', company.id)).json()).toEqual([]);
      expect(
        (
          await pool.query(
            'SELECT version FROM client_accounts WHERE id = $1',
            [client.id],
          )
        ).rows,
      ).toEqual(before.rows);
    } finally {
      await pool.query(
        'DROP TRIGGER reject_project_event ON project_creation_events; DROP FUNCTION reject_project_event()',
      );
    }
    expect((await postProject(company.id, client.id, 'atomic')).status).toBe(
      201,
    );
  });

  it('preserves a pre-union Project through union/reversal and fences a new post-union reference', async () => {
    const setup = await unionSetup();
    const original = await command(
      '/projects',
      { title: 'Original preparation', clientAccountId: setup.second.id },
      'before',
      setup.other.id,
    );
    const reference = await setup.unite();
    expect(
      await (await request(`/projects/${original.id}`, setup.other.id)).json(),
    ).toEqual({
      ...original,
      clientAccountId: setup.second.id,
      clientDossierId: setup.client.id,
    });
    expect((await setup.reverse(reference)).status).toBe(201);
    expect(
      await (await request(`/projects/${original.id}`, setup.other.id)).json(),
    ).toEqual({
      ...original,
      clientAccountId: setup.second.id,
      clientDossierId: setup.second.id,
    });
    const next = await setup.unite();
    await command(
      '/projects',
      { title: 'Later preparation', clientAccountId: setup.client.id },
      'after',
      setup.company.id,
    );
    expect((await setup.reverse(next)).status).toBe(409);
    expect(
      await (await request(`/projects/${original.id}`, setup.other.id)).json(),
    ).toEqual({
      ...original,
      clientAccountId: setup.second.id,
      clientDossierId: setup.client.id,
    });
  });

  it('serializes a new Project against concurrent union reversal without losing references', async () => {
    const setup = await unionSetup();
    const reference = await setup.unite();
    const [created, reversed] = await Promise.all([
      postProject(setup.other.id, setup.client.id, 'race'),
      setup.reverse(reference),
    ]);
    // BIC only received the canonical relationship from union. If reversal wins,
    // creation must recheck that relationship and deny; if creation wins its
    // version fence makes reversal conflict. Both operations cannot succeed.
    expect([
      [201, 409],
      [404, 201],
    ]).toContainEqual([created.status, reversed.status]);
    const list = await (await request('/projects', setup.other.id)).json();
    expect(list).toHaveLength(created.status === 201 ? 1 : 0);
  });

  async function prepared() {
    const company = await command(
      '/companies',
      { displayName: 'PRISMA-PRIM' },
      'company',
    );
    const actor = await (await request('/access/current-actor')).json();
    await command(
      '/company-project-assignments',
      {
        companyId: company.id,
        workspaceMembershipId: actor.workspaceMembershipId,
      },
      'grant',
    );
    const client = await command(
      '/clients',
      { displayName: 'Synthetic Client' },
      'client',
      company.id,
    );
    return { company, client, actor };
  }
  function postProject(
    companyId: string,
    clientAccountId: string,
    key: string,
    title = 'ISO preparation',
  ) {
    return request('/projects', companyId, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify({ title, clientAccountId }),
    });
  }
  async function unionSetup() {
    const { company, client, actor } = await prepared();
    const other = await command('/companies', { displayName: 'BIC' }, 'other');
    await command(
      '/company-project-assignments',
      {
        companyId: other.id,
        workspaceMembershipId: actor.workspaceMembershipId,
      },
      'other-grant',
    );
    for (const companyId of [company.id, other.id])
      await command(
        '/company-director-client-assignments',
        { companyId, workspaceMembershipId: actor.workspaceMembershipId },
        `director-${companyId}`,
      );
    const second = await command(
      '/clients',
      { displayName: 'Legacy identity' },
      'second',
      other.id,
    );
    await pool.query(
      'UPDATE client_accounts SET tax_id = $1 WHERE id IN ($2, $3)',
      ['SYNTHETIC-UNION', client.id, second.id],
    );
    async function unite() {
      const review = await command(
        `/clients/${client.id}/union-reviews`,
        {},
        crypto.randomUUID(),
        company.id,
      );
      const result = await command(
        `/client-union-reviews/${review.reviewReference}/confirm`,
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
          companyIds: [company.id, other.id],
          reviewedDifferences: true,
          reason: 'Same synthetic identity.',
        },
        crypto.randomUUID(),
        company.id,
      );
      return result.projectionReference;
    }
    function reverse(reference: string) {
      return request(
        `/client-union-operations/${reference}/reversal`,
        company.id,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': crypto.randomUUID(),
          },
          body: JSON.stringify({
            companyIds: [company.id, other.id],
            reason: 'Revert synthetic union.',
          }),
        },
      );
    }
    return { company, client, other, second, unite, reverse };
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
    return response.json();
  }
});
