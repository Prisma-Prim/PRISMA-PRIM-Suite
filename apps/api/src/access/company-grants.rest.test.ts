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
import {
  COMPANY_ROLE_BUNDLES,
  companyRoleGrantVersion,
  companyRolePermissionsFor,
  type CompanyRoleBundle,
} from './company-permissions.js';
import { assignmentRouteCases } from './company-role-assignment.routes.test-fixture.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
const WORKSPACE_ID = '00000000-0000-4000-8000-000000001332';

// A closed public shape detects any accidentally published server projection,
// including a future per-bundle property. This list never grows for a bundle.
const COMPANY_FIELDS = [
  'id',
  'displayName',
  'grants',
  'paymentObservationReadCapture',
  'paymentObservationContextCapture',
  'paymentEvidenceContextCapture',
  'paymentEvidenceReferenceReadCapture',
  'invoiceRecordReadCapture',
  'offerMessageReadCapture',
  'workingEvidenceClientReadCapture',
  'workingEvidenceContextCapture',
  'receivedAddendumClientReadCapture',
  'opportunityFollowUpReadCapture',
];

function expectPublicCompany(company: Record<string, unknown>) {
  expect(
    Object.keys(company).filter((key) => !COMPANY_FIELDS.includes(key)),
  ).toEqual([]);
  expect(company).toHaveProperty('id');
  expect(company).toHaveProperty('displayName');
  expect(company).toHaveProperty('grants');
}

const KNOWLEDGE_ROUTES: Partial<Record<CompanyRoleBundle, string>> = {
  company_knowledge_source_administrator:
    '/api/knowledge/assignments/administrators',
  company_knowledge_evidence_reader: '/api/knowledge/assignments/readers',
};

const REGISTRY_BUNDLES = Object.keys(COMPANY_ROLE_BUNDLES).filter(
  (bundle): bundle is CompanyRoleBundle =>
    Object.hasOwn(COMPANY_ROLE_BUNDLES, bundle),
);

function routeOf(bundle: CompanyRoleBundle): string {
  const route =
    assignmentRouteCases.find((candidate) => candidate.bundle === bundle)
      ?.path ?? KNOWLEDGE_ROUTES[bundle];
  if (!route) throw new Error(`No assignment route for ${bundle}`);
  return route;
}

/** Every version an assignment of `bundle` can have captured, in order. */
function capturedVersions(bundle: CompanyRoleBundle): (string | null)[] {
  const versions = Object.keys(COMPANY_ROLE_BUNDLES[bundle].versions);
  return versions.length === 0 ? [null] : versions;
}

interface ExpectedGrant {
  bundle: CompanyRoleBundle;
  assignmentId: string;
  permissionSetVersion: string | null;
  permissions: string[];
}

function expectedGrant(
  bundle: CompanyRoleBundle,
  assignmentId: string,
  permissionSetVersion: string | null,
): ExpectedGrant {
  return {
    bundle,
    assignmentId,
    permissionSetVersion,
    permissions: [...companyRolePermissionsFor(bundle, permissionSetVersion)],
  };
}

describeWithPostgres('Active Company grants list', () => {
  let isolated: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let pool: Pool;
  let origin: string;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    isolated = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'company_grants',
    });
    harness = await createPostgresRestTestHarness({
      databaseUrl: isolated.targetUrl,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'workspace-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Grants List Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify([
          {
            provider: 'deterministic-test',
            subject: 'workspace-member',
            workspaceId: WORKSPACE_ID,
          },
        ]),
      },
    });
    ({ pool, origin } = harness);
  }, 120_000);

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE activity_log_events, company_role_assignments, companies, workspace_permission_grants, workspace_memberships, internal_users, workspaces CASCADE',
    );
  });

  afterAll(async () => {
    await harness?.close();
    await isolated?.close();
  });

  it('covers every registry bundle through its assignment route', () => {
    for (const bundle of REGISTRY_BUNDLES)
      expect(routeOf(bundle)).toMatch(/^\/api\//u);
  });

  it.each(REGISTRY_BUNDLES)(
    'publishes a live %s only through grants, at every captured version and after its revocation',
    async (bundle) => {
      const target = await createTargets();
      const context =
        bundle === 'company_context_access'
          ? undefined
          : await grant('company_context_access', target);
      const receipt = await grant(bundle, target);
      expect(receipt.permissionSetVersion).toBe(
        companyRoleGrantVersion(bundle),
      );
      expect(context?.permissionSetVersion ?? null).toBeNull();
      const others = context
        ? [expectedGrant('company_context_access', text(context.id), null)]
        : [];

      for (const version of capturedVersions(bundle)) {
        await pool.query(
          'UPDATE company_role_assignments SET permission_set_version = $1 WHERE id = $2',
          [version, receipt.id],
        );
        const company = await activeCompany(target.companyId);
        const live = expectedGrant(bundle, text(receipt.id), version);
        expect(company.grants).toEqual(ordered([...others, live]));
        expectPublicCompany(company);
      }

      const revoke = await fetch(
        `${origin}${routeOf(bundle)}/${target.workspaceMembershipId}/${target.companyId}`,
        {
          method: 'DELETE',
          headers: { ...identity('workspace-owner'), 'idempotency-key': 'r' },
        },
      );
      expect(revoke.status).toBe(200);
      if (bundle === 'company_context_access') {
        // Without any grant the member has no Company context at all.
        expect((await currentActor(target.companyId)).status).toBe(403);
        return;
      }
      const company = await activeCompany(target.companyId);
      expect(company.grants).toEqual(others);
      expectPublicCompany(company);
    },
  );

  it('lists no grant for a Workspace Company manager holding none, and omits the context without a Company', async () => {
    const target = await createTargets();
    const response = await fetch(`${origin}/api/access/current-actor`, {
      headers: {
        ...identity('workspace-owner'),
        'x-company-context-id': target.companyId,
      },
    });
    expect(response.status).toBe(200);
    const actor = await objectResponse(response);
    expect(actor.workspacePermissions).toContain('company.manage');
    const company = object(actor.activeCompany);
    expect(company.grants).toEqual([]);
    expectPublicCompany(company);

    const withoutCompany = await objectResponse(
      await fetch(`${origin}/api/access/current-actor`, {
        headers: identity('workspace-member'),
      }),
    );
    expect(withoutCompany).not.toHaveProperty('activeCompany');
    expect((await currentActor(target.companyId)).status).toBe(403);
  });

  /** Grants of a context ordered as the registry lists their bundles. */
  function ordered(grants: ExpectedGrant[]) {
    return [...grants].sort(
      (left, right) =>
        REGISTRY_BUNDLES.indexOf(left.bundle) -
        REGISTRY_BUNDLES.indexOf(right.bundle),
    );
  }

  async function grant(
    bundle: CompanyRoleBundle,
    target: { workspaceMembershipId: string; companyId: string },
  ) {
    const response = await fetch(origin + routeOf(bundle), {
      method: 'POST',
      headers: {
        ...identity('workspace-owner'),
        'content-type': 'application/json',
        'idempotency-key': `grant-${bundle}`,
      },
      body: JSON.stringify(target),
    });
    expect(response.status).toBe(201);
    return objectResponse(response);
  }

  function currentActor(companyId: string) {
    return fetch(`${origin}/api/access/current-actor`, {
      headers: {
        ...identity('workspace-member'),
        'x-company-context-id': companyId,
      },
    });
  }

  async function activeCompany(companyId: string) {
    const response = await currentActor(companyId);
    expect(response.status).toBe(200);
    return object((await objectResponse(response)).activeCompany);
  }

  async function createTargets() {
    await actor('workspace-owner');
    const member = await actor('workspace-member');
    const response = await fetch(`${origin}/api/companies`, {
      method: 'POST',
      headers: {
        ...identity('workspace-owner'),
        'content-type': 'application/json',
        'idempotency-key': 'company',
      },
      body: JSON.stringify({ displayName: 'Grants List Company' }),
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
