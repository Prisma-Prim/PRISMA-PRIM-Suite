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
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000313';
const withPostgres = databaseUrl ? describe : describe.skip;

const READER_ASSIGNMENTS = '/company-commercial-activity-reader-assignments';
const INTAKE_ASSIGNMENTS = '/company-commercial-intake-assignments';
const CONTEXT_ASSIGNMENTS = '/company-context-assignments';

withPostgres('Company commercial Activity read REST', () => {
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let origin: string;
  let pool: Pool;

  const memberHeaders = {
    'x-test-external-subject': 'commercial-reader-member',
    'x-test-display-name': 'Commercial Reader',
    'x-test-email': 'reader@example.test',
  };

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'commercial_activity',
    });
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'workspace-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Commercial Activity Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          {
            provider: 'deterministic-test',
            subject: 'commercial-reader-member',
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

  it('shows the Company commercial history only to a reader who can still read each target', async () => {
    const setup = await preparedReader();
    const older = await captureRequest(setup.company.id, 'older');
    const newer = await captureRequest(setup.company.id, 'newer');

    const page = activityPage(
      await (await request('/activity-log', setup.company.id)).json(),
    );
    // One capture records both events at the same server time, so each newest
    // pair is compared as a set inside the existing dated page.
    expect(sortedActions(page.slice(0, 2))).toEqual([
      'client_request.created',
      'opportunity.created',
    ]);
    expect(sortedActions(page.slice(2, 4))).toEqual([
      'client_request.created',
      'opportunity.created',
    ]);
    expect(page.slice(0, 2).map((event) => event.target)).toEqual(
      expect.arrayContaining([
        {
          type: 'opportunity',
          opportunityId: newer.initialOpportunity.id,
          clientRequestId: newer.id,
          companyId: setup.company.id,
        },
        {
          type: 'client_request',
          clientRequestId: newer.id,
          companyId: setup.company.id,
        },
      ]),
    );
    expect(page.slice(2, 4).map((event) => event.target)).toEqual(
      expect.arrayContaining([
        {
          type: 'opportunity',
          opportunityId: older.initialOpportunity.id,
          clientRequestId: older.id,
          companyId: setup.company.id,
        },
        {
          type: 'client_request',
          clientRequestId: older.id,
          companyId: setup.company.id,
        },
      ]),
    );
    for (const event of page.slice(0, 4)) {
      expect(event.actor).toEqual({
        internalUserId: setup.actor.internalUserId,
        displayName: setup.actor.displayName,
      });
      expect(typeof event.occurredAt).toBe('string');
      expect(event.metadata).toEqual({});
    }
    const datedPage = datedTimes(page);
    expect(datedPage).toEqual([...datedPage].sort().reverse());

    const serialized = JSON.stringify(page);
    for (const confidential of [
      'Exact manual source',
      'Commercial history subject',
      'Manual intake note',
      'Qualify the commercial history',
      'Arrange a qualification call',
      'Initial discussion about the requested work',
      'MANUAL_TEXT',
    ])
      expect(serialized).not.toContain(confidential);
  });

  it('names the containing Request of each Opportunity event without changing the Company page', async () => {
    const setup = await preparedReader();
    const older = await captureRequest(setup.company.id, 'derived-older');
    const newer = await captureRequest(setup.company.id, 'derived-newer');
    const updated = await request(
      `/commercial-intake/opportunities/${older.initialOpportunity.id}/next-action`,
      setup.company.id,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': `next-action-${crypto.randomUUID()}`,
        },
        body: JSON.stringify({
          expectedVersion: 1,
          nextAction: 'Confirm the derived Request link',
        }),
      },
    );
    expect(updated.status).toBe(200);
    const other = entity(
      await command('/companies', { displayName: 'BIC' }, 'derived-other'),
    );
    for (const path of [
      CONTEXT_ASSIGNMENTS,
      INTAKE_ASSIGNMENTS,
      READER_ASSIGNMENTS,
    ])
      await grant(path, setup.actor.workspaceMembershipId, {
        companyId: other.id,
      });
    const foreign = await captureRequest(other.id, 'derived-foreign');

    const page = activityPage(
      await (await request('/activity-log', setup.company.id)).json(),
    );
    const commercial = page.filter((event) =>
      [
        'client_request.created',
        'opportunity.created',
        'opportunity.next_action.updated',
      ].includes(event.action),
    );
    const opportunityTarget = (created: typeof older) => ({
      type: 'opportunity',
      opportunityId: created.initialOpportunity.id,
      clientRequestId: created.id,
      companyId: setup.company.id,
    });
    const requestTarget = (created: typeof older) => ({
      type: 'client_request',
      clientRequestId: created.id,
      companyId: setup.company.id,
    });
    // The update is the newest commercial event; each capture's pair shares
    // one server time, so the remaining targets are compared as a set.
    expect(commercial[0]).toMatchObject({
      action: 'opportunity.next_action.updated',
      target: opportunityTarget(older),
      metadata: {},
    });
    expect(commercial.map((event) => event.target)).toHaveLength(5);
    expect(commercial.map((event) => event.target)).toEqual(
      expect.arrayContaining([
        opportunityTarget(older),
        requestTarget(older),
        opportunityTarget(newer),
        requestTarget(newer),
      ]),
    );
    const datedPage = datedTimes(page);
    expect(datedPage).toEqual([...datedPage].sort().reverse());
    const serialized = JSON.stringify(page);
    expect(serialized).not.toContain(foreign.id);
    expect(serialized).not.toContain(foreign.initialOpportunity.id);
    expect(serialized).not.toContain('Confirm the derived Request link');
  });

  it('omits commercial events without the reader bundle, without target read and without an active Company', async () => {
    const setup = await preparedReader();
    const created = await captureRequest(setup.company.id, 'boundary');

    expect(
      commercialActions(
        await (await request('/activity-log', setup.company.id)).json(),
      ).length,
    ).toBe(2);

    await revoke(READER_ASSIGNMENTS, setup.actor.workspaceMembershipId, {
      companyId: setup.company.id,
    });
    const withoutBundle = await (
      await request('/activity-log', setup.company.id)
    ).json();
    expect(commercialActions(withoutBundle)).toEqual([]);
    expect(JSON.stringify(withoutBundle)).not.toContain(created.id);
    expect(JSON.stringify(withoutBundle)).not.toContain(
      created.initialOpportunity.id,
    );

    await grant(READER_ASSIGNMENTS, setup.actor.workspaceMembershipId, {
      companyId: setup.company.id,
    });
    await revoke(INTAKE_ASSIGNMENTS, setup.actor.workspaceMembershipId, {
      companyId: setup.company.id,
    });
    const withoutTargetRead = await (
      await request('/activity-log', setup.company.id)
    ).json();
    expect(commercialActions(withoutTargetRead)).toEqual([]);
    expect(JSON.stringify(withoutTargetRead)).not.toContain(created.id);

    await grant(INTAKE_ASSIGNMENTS, setup.actor.workspaceMembershipId, {
      companyId: setup.company.id,
    });
    const withoutActiveCompany = await (await request('/activity-log')).json();
    expect(commercialActions(withoutActiveCompany)).toEqual([]);
    expect(JSON.stringify(withoutActiveCompany)).not.toContain(created.id);
  });

  it('never returns another Company, another actor or an unverified identity a Company history', async () => {
    const setup = await preparedReader();
    const created = await captureRequest(setup.company.id, 'isolation');
    const other = entity(
      await command('/companies', { displayName: 'BIC' }, 'other-company'),
    );
    for (const path of [
      CONTEXT_ASSIGNMENTS,
      INTAKE_ASSIGNMENTS,
      READER_ASSIGNMENTS,
    ])
      await grant(path, setup.actor.workspaceMembershipId, {
        companyId: other.id,
      });
    const otherCompanyPage = await (
      await request('/activity-log', other.id)
    ).json();
    expect(commercialActions(otherCompanyPage)).toEqual([]);
    expect(JSON.stringify(otherCompanyPage)).not.toContain(created.id);

    const member = actorRecord(
      await (
        await request('/access/current-actor', undefined, {
          headers: memberHeaders,
        })
      ).json(),
    );
    for (const path of [CONTEXT_ASSIGNMENTS, INTAKE_ASSIGNMENTS])
      await grant(path, member.workspaceMembershipId, {
        companyId: setup.company.id,
      });
    const intakeOnly = await (
      await request('/activity-log', setup.company.id, {
        headers: memberHeaders,
      })
    ).json();
    expect(commercialActions(intakeOnly)).toEqual([]);
    expect(JSON.stringify(intakeOnly)).not.toContain(created.id);

    await grant(READER_ASSIGNMENTS, member.workspaceMembershipId, {
      companyId: setup.company.id,
    });
    const memberPage = commercialActions(
      await (
        await request('/activity-log', setup.company.id, {
          headers: memberHeaders,
        })
      ).json(),
    );
    expect([...memberPage].sort()).toEqual([
      'client_request.created',
      'opportunity.created',
    ]);

    // The delivered suspension command deactivates the membership, so the
    // fixture writes that same inactive state rather than inventing one.
    await pool.query(
      "UPDATE workspace_memberships SET status = 'inactive' WHERE id = $1",
      [member.workspaceMembershipId],
    );
    expect(
      (
        await request('/activity-log', setup.company.id, {
          headers: memberHeaders,
        })
      ).status,
    ).toBe(403);
    await pool.query(
      "UPDATE workspace_memberships SET status = 'active' WHERE id = $1",
      [member.workspaceMembershipId],
    );
    expect(
      commercialActions(
        await (
          await request('/activity-log', setup.company.id, {
            headers: memberHeaders,
          })
        ).json(),
      ),
    ).toHaveLength(2);

    expect((await fetch(`${origin}/api/activity-log`)).status).toBe(401);
  });

  it('grants and revokes the captured reader bundle with attributable history and no added authority', async () => {
    const company = entity(
      await command(
        '/companies',
        { displayName: 'PRISMA-PRIM' },
        'reader-only-company',
      ),
    );
    const member = actorRecord(
      await (
        await request('/access/current-actor', undefined, {
          headers: memberHeaders,
        })
      ).json(),
    );
    const granted = await grant(
      READER_ASSIGNMENTS,
      member.workspaceMembershipId,
      { companyId: company.id },
    );
    expect(granted).toMatchObject({
      bundle: 'Company Commercial Activity Reader',
      permissionSetVersion: 'v1',
      active: true,
    });

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

    await grant(CONTEXT_ASSIGNMENTS, member.workspaceMembershipId, {
      companyId: company.id,
    });
    const selected = record(
      await (
        await request('/access/current-actor', company.id, {
          headers: memberHeaders,
        })
      ).json(),
    );
    const activeCompany = record(selected.activeCompany);
    expect(activeCompany.commercialActivityPermissions).toEqual([
      'commercial.activity.read',
    ]);
    expect(activeCompany.commercialIntakePermissions).toBeUndefined();
    expect(
      (
        await request('/commercial-intake/requests', company.id, {
          headers: memberHeaders,
        })
      ).status,
    ).toBe(403);

    expect(await administrationBundles()).toContain(
      'Company Commercial Activity Reader',
    );

    const revoked = await revoke(
      READER_ASSIGNMENTS,
      member.workspaceMembershipId,
      { companyId: company.id },
    );
    expect(revoked).toMatchObject({
      bundle: 'Company Commercial Activity Reader',
      active: false,
    });
    expect(await administrationBundles()).not.toContain(
      'Company Commercial Activity Reader',
    );
    const history = await pool.query<{ action: string; actor: string }>(
      `SELECT action, actor_workspace_membership_id AS actor
         FROM activity_log_events
        WHERE action::text LIKE 'company_commercial_activity_reader%'
        ORDER BY occurred_at, action`,
    );
    expect(history.rows.map((row) => row.action)).toEqual([
      'company_commercial_activity_reader_assignment.granted',
      'company_commercial_activity_reader_assignment.revoked',
    ]);
    const assignments = await pool.query<{
      bundle: string;
      permission_set_version: string | null;
    }>(
      `SELECT bundle, permission_set_version FROM company_role_assignments
        WHERE bundle = 'company_commercial_activity_reader'`,
    );
    expect(assignments.rows).toEqual([
      {
        bundle: 'company_commercial_activity_reader',
        permission_set_version: 'v1',
      },
    ]);
  });

  it('confers no commercial Activity read through any other captured bundle', async () => {
    const company = entity(
      await command(
        '/companies',
        { displayName: 'PRISMA-PRIM' },
        'no-implicit-reader-company',
      ),
    );
    const actor = actorRecord(
      await (await request('/access/current-actor', company.id)).json(),
    );
    for (const path of [
      CONTEXT_ASSIGNMENTS,
      INTAKE_ASSIGNMENTS,
      '/company-director-client-assignments',
      '/company-project-assignments',
      '/company-task-manager-assignments',
      '/company-document-registrar-assignments',
    ])
      await grant(path, actor.workspaceMembershipId, { companyId: company.id });
    const created = await captureRequest(company.id, 'implicit');
    const selected = record(
      await (await request('/access/current-actor', company.id)).json(),
    );
    expect(
      record(selected.activeCompany).commercialActivityPermissions,
    ).toBeUndefined();
    const page = await (await request('/activity-log', company.id)).json();
    expect(commercialActions(page)).toEqual([]);
    expect(JSON.stringify(page)).not.toContain(created.id);
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

  async function grant(
    path: string,
    workspaceMembershipId: string,
    target: { companyId: string },
  ) {
    return record(
      await command(
        path,
        { ...target, workspaceMembershipId },
        `grant-${path}-${crypto.randomUUID()}`,
      ),
    );
  }

  async function revoke(
    path: string,
    workspaceMembershipId: string,
    target: { companyId: string },
  ) {
    const response = await request(
      `${path}/${workspaceMembershipId}/${target.companyId}`,
      undefined,
      {
        method: 'DELETE',
        headers: { 'idempotency-key': `revoke-${crypto.randomUUID()}` },
      },
    );
    expect(response.status).toBe(200);
    return record(await response.json());
  }

  async function administrationBundles(): Promise<string[]> {
    const state = record(
      await (
        await request('/company-context-assignments/administration')
      ).json(),
    );
    const assignments = state.assignments;
    if (!Array.isArray(assignments))
      throw new Error('Administration assignments are missing.');
    return assignments.map((assignment) =>
      stringField(record(assignment), 'bundle'),
    );
  }

  async function preparedReader() {
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
    for (const path of [INTAKE_ASSIGNMENTS, READER_ASSIGNMENTS])
      await grant(path, actor.workspaceMembershipId, { companyId: company.id });
    return { company, actor };
  }

  async function captureRequest(companyId: string, key: string) {
    const response = await request('/commercial-intake/requests', companyId, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': `capture-${key}-${crypto.randomUUID()}`,
      },
      body: JSON.stringify({
        originalText: `Exact manual source for the ${key} commercial history.`,
        sourceLabel: 'Manual intake note',
        subject: 'Commercial history subject',
        opportunity: {
          title: 'Qualify the commercial history request',
          scope: 'Initial discussion about the requested work',
          nextAction: 'Arrange a qualification call',
        },
      }),
    });
    expect(response.status).toBe(201);
    const created = record(await response.json());
    return {
      id: stringField(created, 'id'),
      initialOpportunity: {
        id: stringField(record(created.initialOpportunity), 'id'),
      },
    };
  }
});

interface ProjectedActivityEvent {
  action: string;
  occurredAt?: string;
  actor: unknown;
  target: unknown;
  metadata?: unknown;
}

function activityPage(value: unknown): ProjectedActivityEvent[] {
  const events = record(value).events;
  if (!Array.isArray(events)) throw new Error('Activity page is missing.');
  return events.map((event) => {
    const projected = record(event);
    const action = projected.action;
    if (typeof action !== 'string')
      throw new Error('Activity event action is missing.');
    return {
      action,
      occurredAt:
        typeof projected.occurredAt === 'string'
          ? projected.occurredAt
          : undefined,
      actor: projected.actor,
      target: projected.target,
      metadata: projected.metadata,
    };
  });
}

function sortedActions(events: readonly ProjectedActivityEvent[]): string[] {
  return events.map((event) => event.action).sort();
}

function datedTimes(events: readonly ProjectedActivityEvent[]): string[] {
  return events
    .map((event) => event.occurredAt)
    .filter((occurredAt): occurredAt is string => occurredAt !== undefined);
}

function commercialActions(value: unknown): string[] {
  return activityPage(value)
    .map((event) => event.action)
    .filter(
      (action) =>
        action === 'client_request.created' ||
        action === 'opportunity.created' ||
        action === 'opportunity.next_action.updated',
    );
}

function entity(value: unknown): { id: string } {
  return { id: stringField(record(value), 'id') };
}

function actorRecord(value: unknown): {
  internalUserId: string;
  workspaceMembershipId: string;
  displayName: string;
} {
  const actor = record(value);
  return {
    internalUserId: stringField(actor, 'internalUserId'),
    workspaceMembershipId: stringField(actor, 'workspaceMembershipId'),
    displayName: stringField(actor, 'displayName'),
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
