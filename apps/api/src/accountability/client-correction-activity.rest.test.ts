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
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000349';
const FOREIGN_WORKSPACE_ID = '00000000-0000-4000-8000-000000003490';
const ACTIVITY_PAGE_SIZE = 50;
const withPostgres = databaseUrl ? describe : describe.skip;
const ownerIdentity = identityHeaders({
  subject: 'workspace-owner',
  displayName: 'Workspace Owner',
});

withPostgres('Client correction Activity Log REST', () => {
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let origin: string;
  let pool: Pool;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'correction_activity',
    });
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'workspace-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Correction Activity Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
          ['first-director', 'second-director'].map((subject) => ({
            provider: 'deterministic-test',
            subject,
            workspaceId: WORKSPACE_ID,
          })),
        ),
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

  it('projects each shared Client correction only in the active Company that made it', async () => {
    const { companyA, companyB, client } = await sharedClient();
    const unrelatedCompany = await registerCompany('Unrelated Company');
    const directorAIdentity = identityHeaders({
      subject: 'first-director',
      displayName: 'PRISMA-PRIM Director',
    });
    const directorBIdentity = identityHeaders({
      subject: 'second-director',
      displayName: 'BIC Director',
    });
    const directorA = await readActorIdentity(directorAIdentity);
    const directorB = await readActorIdentity(directorBIdentity);
    const owner = await readActorIdentity(ownerIdentity);
    await grantDirectorClientAccess({
      workspaceMembershipId: directorA.workspaceMembershipId,
      companyId: companyA.id,
    });
    // Workspace client.manage without Company management, and Company
    // management without client.manage, each reach Client history through
    // their own permission path; the Owner holds both.
    await pool.query(
      `INSERT INTO workspace_permission_grants (
        workspace_id, workspace_membership_id, permission
      ) VALUES ($1, $2, 'client.manage'), ($1, $3, 'company.manage')`,
      [
        directorA.workspaceId,
        directorA.workspaceMembershipId,
        directorB.workspaceMembershipId,
      ],
    );
    await grantDirectorClientAccess({
      workspaceMembershipId: directorB.workspaceMembershipId,
      companyId: companyB.id,
    });
    for (const company of [companyA, companyB, unrelatedCompany]) {
      await grantDirectorClientAccess({
        workspaceMembershipId: owner.workspaceMembershipId,
        companyId: company.id,
      });
    }
    const directorAInA = inCompany(directorAIdentity, companyA.id);
    const directorBInB = inCompany(directorBIdentity, companyB.id);

    await correctClient({
      headers: directorAInA,
      clientId: client.id,
      expectedVersion: 1,
      idempotencyKey: 'correct-in-company-a',
      changes: { telephone: '+373 22 100 100' },
    });
    await correctClient({
      headers: directorBInB,
      clientId: client.id,
      expectedVersion: 2,
      idempotencyKey: 'correct-in-company-b',
      changes: { address: 'Str. Company B 2, Balti' },
    });
    const persisted = await pool.query<{ count: string }>(
      `SELECT count(*) FROM activity_log_events
       WHERE action::text = 'client.corrected'`,
    );
    expect(persisted.rows).toEqual([{ count: '2' }]);

    const clientTarget = {
      type: 'client_account',
      clientAccountId: client.id,
      displayName: client.displayName,
    };
    const expectedCorrectionA = {
      id: expect.any(String),
      action: 'client.corrected',
      occurredAt: expect.any(String),
      actor: {
        internalUserId: directorA.internalUserId,
        displayName: 'PRISMA-PRIM Director',
      },
      target: {
        ...clientTarget,
        companyId: companyA.id,
        companyDisplayName: 'PRISMA-PRIM',
      },
      metadata: {
        changes: { telephone: { before: null, after: '+373 22 100 100' } },
      },
    };
    const expectedCorrectionB = {
      id: expect.any(String),
      action: 'client.corrected',
      occurredAt: expect.any(String),
      actor: {
        internalUserId: directorB.internalUserId,
        displayName: 'BIC Director',
      },
      target: {
        ...clientTarget,
        companyId: companyB.id,
        companyDisplayName: 'BIC',
      },
      metadata: {
        changes: {
          address: { before: null, after: 'Str. Company B 2, Balti' },
        },
      },
    };
    const expectSharedClientHistory = (
      events: readonly unknown[],
      companyId: string,
    ) => {
      expect(eventsWithAction(events, 'client.created')).toEqual([
        expect.objectContaining({ target: clientTarget }),
      ]);
      expect(
        eventsWithAction(events, 'client_company_relationship.established'),
      ).toEqual([
        expect.objectContaining({
          target: expect.objectContaining({ companyId }),
        }),
      ]);
    };

    const directorAActivity = await readActivityLog(directorAInA);
    expect(
      eventsWithAction(directorAActivity.events, 'client.corrected'),
    ).toEqual([expectedCorrectionA]);
    const directorBActivity = await readActivityLog(directorBInB);
    expect(
      eventsWithAction(directorBActivity.events, 'client.corrected'),
    ).toEqual([expectedCorrectionB]);
    const correctionA: HiddenCorrection = {
      ...datedEvent(
        eventsWithAction(directorAActivity.events, 'client.corrected')[0],
      ),
      value: '+373 22 100 100',
    };
    const correctionB: HiddenCorrection = {
      ...datedEvent(
        eventsWithAction(directorBActivity.events, 'client.corrected')[0],
      ),
      value: 'Str. Company B 2, Balti',
    };
    expectCorrectionHidden(directorAActivity.text, correctionB);
    expect(directorAActivity.text).not.toContain(companyB.id);
    expectCorrectionHidden(directorBActivity.text, correctionA);
    expectSharedClientHistory(directorAActivity.events, companyA.id);
    expectSharedClientHistory(directorBActivity.events, companyB.id);

    const ownerInA = await readActivityLog(
      inCompany(ownerIdentity, companyA.id),
    );
    const ownerInB = await readActivityLog(
      inCompany(ownerIdentity, companyB.id),
    );
    expect(eventsWithAction(ownerInA.events, 'client.corrected')).toEqual([
      { ...expectedCorrectionA, id: correctionA.id },
    ]);
    expect(eventsWithAction(ownerInB.events, 'client.corrected')).toEqual([
      { ...expectedCorrectionB, id: correctionB.id },
    ]);
    expectCorrectionHidden(ownerInA.text, correctionB);
    expectCorrectionHidden(ownerInB.text, correctionA);
    expectSharedClientHistory(ownerInA.events, companyA.id);
    expectSharedClientHistory(ownerInB.events, companyB.id);
    const registeredCompanies = [companyA, companyB, unrelatedCompany].map(
      (company) =>
        expect.objectContaining({
          target: expect.objectContaining({ companyId: company.id }),
        }),
    );
    for (const activity of [directorBActivity, ownerInA, ownerInB]) {
      const registrations = eventsWithAction(
        activity.events,
        'company.registered',
      );
      expect(registrations).toHaveLength(registeredCompanies.length);
      expect(registrations).toEqual(
        expect.arrayContaining(registeredCompanies),
      );
    }

    const ownerInUnrelatedCompany = await readActivityLog(
      inCompany(ownerIdentity, unrelatedCompany.id),
    );
    const ownerWithoutCompany = await readActivityLog(ownerIdentity);
    for (const activity of [ownerInUnrelatedCompany, ownerWithoutCompany]) {
      expect(eventsWithAction(activity.events, 'client.corrected')).toEqual([]);
      expect(
        eventsWithAction(
          activity.events,
          'client_company_relationship.established',
        ),
      ).toEqual([]);
      expectCorrectionHidden(activity.text, correctionA);
      expectCorrectionHidden(activity.text, correctionB);
    }
    expect(
      eventsWithAction(ownerInUnrelatedCompany.events, 'client.created'),
    ).toEqual([expect.objectContaining({ target: clientTarget })]);
    expect(
      eventsWithAction(ownerWithoutCompany.events, 'company.registered'),
    ).toHaveLength(3);

    await revokeDirectorClientAccess({
      workspaceMembershipId: directorA.workspaceMembershipId,
      companyId: companyA.id,
    });
    const foreignCompanyId = await insertForeignWorkspaceCompany();
    const deniedReads = await Promise.all([
      fetch(`${origin}/api/activity-log`, { headers: directorAInA }),
      fetch(`${origin}/api/activity-log`, {
        headers: inCompany(ownerIdentity, foreignCompanyId),
      }),
    ]);
    for (const denied of deniedReads) {
      expect(denied.status).toBe(403);
      const deniedText = await denied.text();
      expectCorrectionHidden(deniedText, correctionA);
      expectCorrectionHidden(deniedText, correctionB);
      expect(deniedText).not.toContain(foreignCompanyId);
    }
  }, 15_000);

  it('filters other Company corrections before the Activity Log page limit', async () => {
    const { companyA, companyB, client } = await sharedClient();
    const identity = identityHeaders({
      subject: 'first-director',
      displayName: 'Dual Director',
    });
    const director = await readActorIdentity(identity);
    for (const company of [companyA, companyB]) {
      await grantDirectorClientAccess({
        workspaceMembershipId: director.workspaceMembershipId,
        companyId: company.id,
      });
    }
    const inCompanyA = inCompany(identity, companyA.id);
    const inCompanyB = inCompany(identity, companyB.id);

    for (let index = 0; index < ACTIVITY_PAGE_SIZE; index += 1) {
      await correctClient({
        headers: inCompanyB,
        clientId: client.id,
        expectedVersion: index + 1,
        idempotencyKey: `correct-in-company-b-${index}`,
        changes: { businessActivity: `Company B correction ${index}` },
      });
    }
    await correctClient({
      headers: inCompanyA,
      clientId: client.id,
      expectedVersion: ACTIVITY_PAGE_SIZE + 1,
      idempotencyKey: 'correct-in-company-a',
      changes: { telephone: '+373 22 200 200' },
    });

    // The newest Company A correction is omitted in B, so the unchanged
    // limit keeps exactly the Company B corrections.
    const activityInB = await readActivityLog(inCompanyB);
    expect(activityInB.events).toHaveLength(ACTIVITY_PAGE_SIZE);
    expect(activityInB.events).toEqual(
      expect.arrayContaining(
        Array.from({ length: ACTIVITY_PAGE_SIZE }, (_, index) =>
          expect.objectContaining({
            action: 'client.corrected',
            target: expect.objectContaining({ companyId: companyB.id }),
            metadata: {
              changes: {
                businessActivity: {
                  before:
                    index === 0 ? null : `Company B correction ${index - 1}`,
                  after: `Company B correction ${index}`,
                },
              },
            },
          }),
        ),
      ),
    );
    // Sequential commands may share a serialized millisecond, so the page
    // proves newest-first order without depending on tie-breaking.
    const newestFirst = activityInB.events.map(
      (event) => datedEvent(event).occurredAt,
    );
    expect(newestFirst).toEqual(newestFirst.toSorted().toReversed());
    expect(activityInB.text).not.toContain('+373 22 200 200');
    expect(activityInB.text).not.toContain(companyA.id);

    const activityInA = await readActivityLog(inCompanyA);
    expect(activityInA.events[0]).toEqual({
      id: expect.any(String),
      action: 'client.corrected',
      occurredAt: expect.any(String),
      actor: {
        internalUserId: director.internalUserId,
        displayName: 'Dual Director',
      },
      target: {
        type: 'client_account',
        clientAccountId: client.id,
        displayName: client.displayName,
        companyId: companyA.id,
        companyDisplayName: 'PRISMA-PRIM',
      },
      metadata: {
        changes: { telephone: { before: null, after: '+373 22 200 200' } },
      },
    });
    expect(
      eventsWithAction(activityInA.events, 'client.corrected'),
    ).toHaveLength(1);
    // The older Client history still fits because hidden Company B corrections
    // were excluded before the page limit instead of consuming its slots.
    expect(eventsWithAction(activityInA.events, 'client.created')).toHaveLength(
      1,
    );
    expect(
      eventsWithAction(
        activityInA.events,
        'client_company_relationship.established',
      ),
    ).toEqual([
      expect.objectContaining({
        target: expect.objectContaining({ companyId: companyA.id }),
      }),
    ]);
    expect(activityInA.text).not.toContain('Company B correction');
    expect(activityInA.text).not.toContain(companyB.id);
  }, 30_000);

  async function sharedClient() {
    const companyA = await registerCompany('PRISMA-PRIM');
    const companyB = await registerCompany('BIC');
    const created = await fetch(`${origin}/api/clients`, {
      method: 'POST',
      headers: {
        ...inCompany(ownerIdentity, companyA.id),
        'content-type': 'application/json',
        'idempotency-key': 'register-shared-client',
      },
      body: JSON.stringify({ displayName: 'Shared Correction Client' }),
    });
    const client = await namedRecord(created, 201);
    const attached = await fetch(
      `${origin}/api/clients/${client.id}/active-company-relationship`,
      { method: 'PUT', headers: inCompany(ownerIdentity, companyB.id) },
    );
    expect(attached.status).toBe(200);
    return { companyA, companyB, client };
  }

  async function registerCompany(displayName: string) {
    const response = await fetch(`${origin}/api/companies`, {
      method: 'POST',
      headers: {
        ...ownerIdentity,
        'content-type': 'application/json',
        'idempotency-key': `register-${displayName}`,
      },
      body: JSON.stringify({ displayName }),
    });
    return namedRecord(response, 201);
  }

  async function readActorIdentity(headers: Record<string, string>) {
    const response = await fetch(`${origin}/api/access/current-actor`, {
      headers,
    });
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    if (
      !isRecord(body) ||
      typeof body.internalUserId !== 'string' ||
      typeof body.workspaceMembershipId !== 'string' ||
      typeof body.workspaceId !== 'string'
    ) {
      throw new Error('Expected one current actor identity.');
    }
    return {
      internalUserId: body.internalUserId,
      workspaceMembershipId: body.workspaceMembershipId,
      workspaceId: body.workspaceId,
    };
  }

  async function grantDirectorClientAccess(assignment: {
    workspaceMembershipId: string;
    companyId: string;
  }) {
    const response = await fetch(
      `${origin}/api/company-director-client-assignments`,
      {
        method: 'POST',
        headers: {
          ...ownerIdentity,
          'content-type': 'application/json',
          'idempotency-key': `grant-${assignment.workspaceMembershipId}-${assignment.companyId}`,
        },
        body: JSON.stringify(assignment),
      },
    );
    expect(response.status).toBe(201);
  }

  async function revokeDirectorClientAccess(assignment: {
    workspaceMembershipId: string;
    companyId: string;
  }) {
    const response = await fetch(
      `${origin}/api/company-director-client-assignments/${assignment.workspaceMembershipId}/${assignment.companyId}`,
      {
        method: 'DELETE',
        headers: {
          ...ownerIdentity,
          'idempotency-key': `revoke-${assignment.workspaceMembershipId}-${assignment.companyId}`,
        },
      },
    );
    expect(response.status).toBe(200);
  }

  async function correctClient(input: {
    headers: Record<string, string>;
    clientId: string;
    expectedVersion: number;
    idempotencyKey: string;
    changes: Record<string, string>;
  }) {
    const response = await fetch(`${origin}/api/clients/${input.clientId}`, {
      method: 'PATCH',
      headers: {
        ...input.headers,
        'content-type': 'application/json',
        'idempotency-key': input.idempotencyKey,
      },
      body: JSON.stringify({
        expectedVersion: input.expectedVersion,
        ...input.changes,
      }),
    });
    expect(response.status).toBe(200);
  }

  async function readActivityLog(headers: Record<string, string>) {
    const response = await fetch(`${origin}/api/activity-log`, { headers });
    expect(response.status).toBe(200);
    const text = await response.text();
    const body: unknown = JSON.parse(text);
    if (!isRecord(body) || !Array.isArray(body.events)) {
      throw new Error('Expected one Activity Log page.');
    }
    const events: unknown[] = body.events;
    return { text, events };
  }

  async function insertForeignWorkspaceCompany(): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `WITH foreign_workspace AS (
        INSERT INTO workspaces (id, name)
        VALUES ($1, 'Foreign Correction Workspace')
        RETURNING id
      ), foreign_user AS (
        INSERT INTO internal_users (
          external_provider, external_subject, display_name, email
        )
        VALUES ('deterministic-test', 'foreign-correction-owner',
          'Foreign Owner', 'foreign-correction-owner@example.test')
        RETURNING id
      ), foreign_membership AS (
        INSERT INTO workspace_memberships (workspace_id, internal_user_id)
        SELECT foreign_workspace.id, foreign_user.id
        FROM foreign_workspace, foreign_user
        RETURNING id, workspace_id, internal_user_id
      )
      INSERT INTO companies (
        workspace_id, display_name, created_by_internal_user_id,
        created_by_workspace_membership_id, registration_idempotency_key
      )
      SELECT workspace_id, 'Foreign Correction Company', internal_user_id, id,
        'foreign-correction-company'
      FROM foreign_membership
      RETURNING id`,
      [FOREIGN_WORKSPACE_ID],
    );
    const company = result.rows[0];
    if (!company) throw new Error('Expected one foreign Company.');
    return company.id;
  }
});

interface HiddenCorrection {
  id: string;
  occurredAt: string;
  value: string;
}

function identityHeaders(identity: { subject: string; displayName: string }) {
  return {
    'x-test-external-provider': 'deterministic-test',
    'x-test-external-subject': identity.subject,
    'x-test-display-name': identity.displayName,
    'x-test-email': `${identity.subject}@example.test`,
  };
}

function inCompany(identity: Record<string, string>, companyId: string) {
  return { ...identity, 'x-company-context-id': companyId };
}

async function namedRecord(response: Response, expectedStatus: number) {
  expect(response.status).toBe(expectedStatus);
  const body: unknown = await response.json();
  if (
    !isRecord(body) ||
    typeof body.id !== 'string' ||
    typeof body.displayName !== 'string'
  ) {
    throw new Error('Expected one named record.');
  }
  return { id: body.id, displayName: body.displayName };
}

function eventsWithAction(events: readonly unknown[], action: string) {
  return events.filter((event) => isRecord(event) && event.action === action);
}

function datedEvent(event: unknown): { id: string; occurredAt: string } {
  if (
    !isRecord(event) ||
    typeof event.id !== 'string' ||
    typeof event.occurredAt !== 'string'
  ) {
    throw new Error('Expected one dated Activity Log event.');
  }
  return { id: event.id, occurredAt: event.occurredAt };
}

function expectCorrectionHidden(text: string, correction: HiddenCorrection) {
  expect(text).not.toContain(correction.id);
  expect(text).not.toContain(correction.occurredAt);
  expect(text).not.toContain(correction.value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
