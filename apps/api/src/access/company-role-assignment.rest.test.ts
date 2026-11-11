import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';
import {
  COMPANY_ROLE_BUNDLES,
  companyRoleAssignmentAction,
  companyRoleGrantVersion,
  type CompanyRoleBundle,
} from './company-permissions.js';
import { assignmentRouteCases } from './company-role-assignment.routes.test-fixture.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres('Registry Company role assignment routes', () => {
  let harness: PostgresRestTestHarness;
  let pool: Pool;
  let origin: string;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    harness = await createPostgresRestTestHarness({
      databaseUrl,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'workspace-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: '00000000-0000-4000-8000-000000000095',
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Registry Assignment Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          {
            provider: 'deterministic-test',
            subject: 'workspace-member',
            workspaceId: '00000000-0000-4000-8000-000000000095',
          },
        ]),
      },
    });
    ({ pool, origin } = harness);
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE activity_log_events, company_role_assignments, companies, workspace_permission_grants, workspace_memberships, internal_users, workspaces CASCADE',
    );
  });

  afterAll(async () => harness?.close());

  it.each(assignmentRouteCases)(
    'strictly grants, replays and revokes $bundle at its unchanged URL',
    async ({ bundle, path }) => {
      const target = await createTargets();
      const invalid = await post(
        path,
        {
          ...target,
          extra: true,
        },
        'reject-extra',
      );
      expect(invalid.status).toBe(400);
      expect((await administration()).assignments).toEqual([]);

      const grant = await post(path, target, 'grant');
      expect(grant.status).toBe(201);
      const receipt = await objectResponse(grant);
      const assignmentId = text(receipt.id);
      expect(receipt).toEqual({
        id: assignmentId,
        ...target,
        bundle: COMPANY_ROLE_BUNDLES[bundle].label,
        permissionSetVersion: companyRoleGrantVersion(bundle),
        active: true,
      });
      const state = await administration();
      expect(Object.keys(state).sort()).toEqual([
        'assignments',
        'companies',
        'members',
      ]);
      expect(state.assignments).toContainEqual(receipt);

      const replay = await post(path, target, 'grant');
      expect(replay.status).toBe(201);
      expect(await objectResponse(replay)).toEqual(receipt);
      expect(await assignmentEvents(assignmentId)).toMatchObject([
        {
          action: companyRoleAssignmentAction(bundle, 'grant'),
          target: { type: 'company_role_assignment', assignmentId, ...target },
          metadata: { bundle: COMPANY_ROLE_BUNDLES[bundle].label },
        },
      ]);

      const revokePath = `${path}/${target.workspaceMembershipId}/${target.companyId}`;
      const revoke = await remove(revokePath, 'revoke');
      expect(revoke.status).toBe(200);
      const revoked = await objectResponse(revoke);
      expect(revoked).toEqual({ ...receipt, active: false });
      const replayRevoke = await remove(revokePath, 'revoke');
      expect(replayRevoke.status).toBe(200);
      expect(await objectResponse(replayRevoke)).toEqual(revoked);
      const events = await assignmentEvents(assignmentId);
      expect(events).toHaveLength(2);
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            action: companyRoleAssignmentAction(bundle, 'grant'),
          }),
          expect.objectContaining({
            action: companyRoleAssignmentAction(bundle, 'revoke'),
            target: expect.objectContaining({ assignmentId, ...target }),
            metadata: { bundle: COMPANY_ROLE_BUNDLES[bundle].label },
          }),
        ]),
      );
    },
  );

  it.each([
    'unrecognized',
    'knowledge-source-administrator',
    'knowledge-evidence-reader',
    'context-access',
    'director-client-access',
    'project-access',
    'constructor',
    '__proto__',
  ])(
    'returns 404 for non-registry noun %s with or without authentication',
    async (noun) => {
      for (const headers of [{}, identity('workspace-owner')]) {
        const path = `${origin}/api/company-${noun}-assignments`;
        expect(
          (
            await fetch(path, {
              method: 'POST',
              headers: { ...headers, 'content-type': 'application/json' },
              body: '{}',
            })
          ).status,
        ).toBe(404);
        expect(
          (
            await fetch(
              `${path}/00000000-0000-4000-8000-000000000001/00000000-0000-4000-8000-000000000002`,
              { method: 'DELETE', headers },
            )
          ).status,
        ).toBe(404);
      }
    },
  );

  it('preserves case-insensitive routes, trailing slashes and canonical replay receipts', async () => {
    const target = await createTargets();
    const path = '/api/company-context-assignments';
    const first = await post(path, target, 'route-case');
    expect(first.status).toBe(201);
    const receipt = await objectResponse(first);
    const replay = await post(path.toUpperCase() + '/', target, 'route-case');
    expect(replay.status).toBe(201);
    expect(await objectResponse(replay)).toEqual(receipt);
    const revoked = await remove(
      `${path.toUpperCase()}/${target.workspaceMembershipId.toUpperCase()}/${target.companyId.toUpperCase()}`,
      'route-case-revoke',
    );
    expect(revoked.status).toBe(200);
    expect(await objectResponse(revoked)).toEqual({
      ...receipt,
      active: false,
    });
  });

  it.each(
    [
      null,
      [],
      {},
      { companyId: 'missing-membership' },
      { workspaceMembershipId: 'missing-company' },
      { companyId: null, workspaceMembershipId: 7 },
      {
        companyId: 'x',
        workspaceMembershipId: 'y',
        bundle: 'company_context_access',
      },
    ].map((body) => ({ body })),
  )('rejects a malformed assignment body $body', async ({ body }) => {
    expect((await post('/api/company-context-assignments', body)).status).toBe(
      400,
    );
  });

  it('keeps known mutations authenticated and administration restricted to its original path', async () => {
    const unauthorized = await fetch(
      `${origin}/api/company-context-assignments`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      },
    );
    expect(unauthorized.status).toBe(401);
    expect(
      (
        await fetch(
          `${origin}/api/company-payment-reader-assignments/administration`,
        )
      ).status,
    ).toBe(404);
  });

  it.each([
    {
      path: '/api/knowledge/assignments/administrators',
      bundle: 'company_knowledge_source_administrator',
    },
    {
      path: '/api/knowledge/assignments/readers',
      bundle: 'company_knowledge_evidence_reader',
    },
  ] satisfies { path: string; bundle: CompanyRoleBundle }[])(
    'retains the separately owned Knowledge route $path',
    async ({ path, bundle }) => {
      const target = await createTargets();
      const grant = await post(path, target, 'knowledge-grant');
      expect(grant.status).toBe(201);
      const receipt = await objectResponse(grant);
      expect(receipt).toMatchObject({
        ...target,
        bundle: COMPANY_ROLE_BUNDLES[bundle].label,
        permissionSetVersion: companyRoleGrantVersion(bundle),
        active: true,
      });
      const revoke = await remove(
        `${path}/${target.workspaceMembershipId}/${target.companyId}`,
        'knowledge-revoke',
      );
      expect(revoke.status).toBe(200);
      expect(await objectResponse(revoke)).toEqual({
        ...receipt,
        active: false,
      });
    },
  );

  async function administration() {
    const response = await fetch(
      `${origin}/api/company-context-assignments/administration`,
      { headers: identity('workspace-owner') },
    );
    expect(response.status).toBe(200);
    return objectResponse(response);
  }

  async function assignmentEvents(assignmentId: string) {
    const response = await fetch(`${origin}/api/activity-log`, {
      headers: identity('workspace-owner'),
    });
    expect(response.status).toBe(200);
    const page = await objectResponse(response);
    if (!Array.isArray(page.events))
      throw new Error('Expected public Activity events');
    const events: unknown[] = page.events;
    return events
      .map(object)
      .filter((event) => object(event.target).assignmentId === assignmentId);
  }

  function remove(path: string, key: string) {
    return fetch(origin + path, {
      method: 'DELETE',
      headers: { ...identity('workspace-owner'), 'idempotency-key': key },
    });
  }

  async function createTargets() {
    await actor('workspace-owner');
    const member = await actor('workspace-member');
    const response = await post('/api/companies', {
      displayName: 'Registry Assignment Company',
    });
    expect(response.status).toBe(201);
    const company = await objectResponse(response);
    return {
      workspaceMembershipId: text(member.workspaceMembershipId),
      companyId: text(company.id),
    };
  }

  async function actor(subject: string) {
    const response = await fetch(`${origin}/api/access/current-actor`, {
      headers: identity(subject),
    });
    expect(response.status).toBe(200);
    return objectResponse(response);
  }

  function post(path: string, body: unknown, key = path) {
    return fetch(origin + path, {
      method: 'POST',
      headers: {
        ...identity('workspace-owner'),
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      body: JSON.stringify(body),
    });
  }
});

function identity(subject: string) {
  return {
    'x-test-external-provider': 'deterministic-test',
    'x-test-external-subject': subject,
    'x-test-display-name': subject,
    'x-test-email': `${subject}@example.test`,
  };
}

async function objectResponse(
  response: Response,
): Promise<Record<string, unknown>> {
  const value: unknown = await response.json();
  return object(value);
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a public JSON object');
  return Object.fromEntries(Object.entries(value));
}

function text(value: unknown) {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected a public identity');
  return value;
}
