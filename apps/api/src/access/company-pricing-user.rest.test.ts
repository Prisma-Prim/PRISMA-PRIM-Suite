import type { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { ServerClock } from '../clock/server-clock.js';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000397';
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000999';
const FOREIGN = {
  workspaceId: '00000000-0000-4000-8000-000000003970',
  internalUserId: '00000000-0000-4000-8000-000000003971',
  membershipId: '00000000-0000-4000-8000-000000003972',
  companyId: '00000000-0000-4000-8000-000000003973',
  ruleVersionId: '00000000-0000-4000-8000-000000003974',
  definitionId: '00000000-0000-4000-8000-000000003975',
  offeringId: '00000000-0000-4000-8000-000000003976',
} as const;
const SCOPE = '/pricing-configuration/rule-scope';
const VERSIONS = '/pricing-configuration/rule-versions';
const TARIFF_VERSIONS = '/pricing-configuration/tariff-versions';
const DEFINITIONS = '/commercial-catalogue/service-definitions';
const OFFERINGS = '/commercial-catalogue/offerings';
const REQUESTS = '/commercial-intake/requests';
const ADMINISTRATION = '/company-context-assignments/administration';
const PRICING_USER_ASSIGNMENTS = '/company-pricing-user-assignments';
const CONFIGURATION_ASSIGNMENTS = '/company-pricing-configuration-assignments';
const CATALOGUE_ASSIGNMENTS = '/company-service-catalogue-assignments';
const CONTEXT_ASSIGNMENTS = '/company-context-assignments';
const INTAKE_ASSIGNMENTS = '/company-commercial-intake-assignments';
const READER_ASSIGNMENTS = '/company-commercial-activity-reader-assignments';
const PRICING_USER_PERMISSIONS = [
  'commercial.offering.read',
  'commercial.pricing.configuration.read',
  'commercial.pricing.calculate',
  'commercial.pricing.snapshot.read',
];
const CONFIGURATION_PERMISSIONS = [
  'commercial.offering.read',
  'commercial.pricing.configuration.read',
  'commercial.pricing.configuration.manage',
];
const TARIFF = {
  unit: 'illustrative-unit',
  unitAmount: '123.4500',
  currency: 'EUR',
  taxRatePercent: '12.34',
  taxLabel: 'Illustrative tax',
};
// Every table a denied or read-only request could write to.
const WRITABLE_TABLES = [
  'company_role_assignments',
  'company_context_assignment_commands',
  'activity_log_events',
  'pricing_rule_versions',
  'tariff_versions',
  'pricing_configuration_commands',
  'pricing_configuration_events',
  'service_definitions',
  'company_service_offerings',
  'commercial_catalogue_commands',
  'commercial_catalogue_events',
  'client_requests',
  'opportunities',
  'commercial_intake_commands',
  'commercial_intake_events',
] as const;
const PRICING_USER = memberHeaders('pricing-user');
const CONFIGURATION_MEMBER = memberHeaders('configuration-member');
const CATALOGUE_MEMBER = memberHeaders('catalogue-member');
const INTAKE_MEMBER = memberHeaders('intake-member');
const BOTH_MEMBER = memberHeaders('both-bundles-member');
const OTHER_MEMBER = memberHeaders('other-member');

interface IndependentRole {
  name: string;
  // null is the bootstrap Workspace owner, who holds no Company assignment.
  subject: string | null;
  assignmentPaths: readonly string[];
  legacyIntakeV1: boolean;
  ruleReadStatus: 200 | 403;
}

// Pricing PRD section 18 item 19: no other bundle, assignment or Workspace
// ownership confers Pricing User, and only Configuration v1 reads rules.
const INDEPENDENT_ROLES: readonly IndependentRole[] = [
  {
    name: 'Configuration v1 alone',
    subject: 'configuration-only',
    assignmentPaths: [CONTEXT_ASSIGNMENTS, CONFIGURATION_ASSIGNMENTS],
    legacyIntakeV1: false,
    ruleReadStatus: 200,
  },
  {
    name: 'Catalogue v1',
    subject: 'catalogue-only',
    assignmentPaths: [CONTEXT_ASSIGNMENTS, CATALOGUE_ASSIGNMENTS],
    legacyIntakeV1: false,
    ruleReadStatus: 403,
  },
  {
    name: 'Commercial Intake v1',
    subject: 'intake-v1',
    assignmentPaths: [CONTEXT_ASSIGNMENTS, INTAKE_ASSIGNMENTS],
    legacyIntakeV1: true,
    ruleReadStatus: 403,
  },
  {
    name: 'Commercial Intake v2',
    subject: 'intake-v2',
    assignmentPaths: [CONTEXT_ASSIGNMENTS, INTAKE_ASSIGNMENTS],
    legacyIntakeV1: false,
    ruleReadStatus: 403,
  },
  {
    name: 'Commercial Activity Reader v1',
    subject: 'activity-reader',
    assignmentPaths: [CONTEXT_ASSIGNMENTS, READER_ASSIGNMENTS],
    legacyIntakeV1: false,
    ruleReadStatus: 403,
  },
  {
    name: 'Company Context Access alone',
    subject: 'context-only',
    assignmentPaths: [CONTEXT_ASSIGNMENTS],
    legacyIntakeV1: false,
    ruleReadStatus: 403,
  },
  {
    name: 'a Workspace owner without grants',
    subject: null,
    assignmentPaths: [],
    legacyIntakeV1: false,
    ruleReadStatus: 403,
  },
];
const MEMBER_SUBJECTS = [
  'pricing-user',
  'configuration-member',
  'catalogue-member',
  'intake-member',
  'both-bundles-member',
  'other-member',
  ...INDEPENDENT_ROLES.flatMap((role) =>
    role.subject === null ? [] : [role.subject],
  ),
];

interface HolderFixture {
  company: { id: string };
  holder: MemberActor;
  rules: { first: VersionView; second: VersionView };
  definitionId: string;
  offering: Record<string, unknown> & { id: string };
  requestId: string;
}

interface DeniedFamily {
  name: string;
  call: (fixture: HolderFixture) => Promise<Response>;
}

// Only the server clock boundary is replaced, so every rule read and
// publication below is evaluated at this one fixed instant.
const serverClock: ServerClock = {
  now: () => new Date('2026-04-01T00:00:00.000Z'),
};

withPostgres('Company Pricing User REST', () => {
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let origin: string;
  let pool: Pool;

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'company_pricing_user',
    });
    harness = await createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      serverClock,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'workspace-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'Pricing User Workspace',
        ACCESS_ACCEPTED_INVITATIONS_JSON: JSON.stringify(
          MEMBER_SUBJECTS.map((subject) => ({
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

  it('grants Pricing User v1 that reads offerings and rules as a configuration owner does and cannot publish', async () => {
    const company = await createCompany('PRISMA-PRIM');
    await member(CONFIGURATION_MEMBER, company.id, [
      CONTEXT_ASSIGNMENTS,
      CONFIGURATION_ASSIGNMENTS,
    ]);
    const rules = await publishRules(company.id, 'Illustrative rule');
    await member(CATALOGUE_MEMBER, company.id, [
      CONTEXT_ASSIGNMENTS,
      CATALOGUE_ASSIGNMENTS,
    ]);
    const { offering } = await offer(company.id, 'Illustrative offering');

    const holder = await member(PRICING_USER, company.id, [
      CONTEXT_ASSIGNMENTS,
      PRICING_USER_ASSIGNMENTS,
    ]);
    const assignmentId = await liveAssignmentId(
      holder.membershipId,
      company.id,
      'company_pricing_user',
    );
    const selected = await activeCompanyOf(company.id, PRICING_USER);
    expect(selected).toMatchObject({
      id: company.id,
      pricingUserPermissions: PRICING_USER_PERMISSIONS,
      pricingUserPermissionAssignmentId: assignmentId,
      pricingUserPermissionSetVersion: 'v1',
    });
    expect(selected.pricingConfigurationPermissions).toBeUndefined();
    expect(selected.serviceCataloguePermissions).toBeUndefined();

    // The holder reads exactly what a configuration owner reads at the same
    // instant, including the derived state and the provisional marker, and
    // the reads write nothing.
    const beforeReads = await writeCounts();
    for (const path of [
      SCOPE,
      VERSIONS,
      `${VERSIONS}/${rules.first.id}`,
      `${VERSIONS}/${rules.second.id}`,
    ]) {
      const owner = await request(path, company.id, {
        headers: CONFIGURATION_MEMBER,
      });
      const read = await request(path, company.id, { headers: PRICING_USER });
      expect({ path, status: read.status }).toEqual({ path, status: 200 });
      expect(await read.json()).toEqual(await owner.json());
    }
    expect(
      await (
        await request(SCOPE, company.id, { headers: PRICING_USER })
      ).json(),
    ).toMatchObject({
      current: { id: rules.first.id, versionNumber: 1, state: 'CURRENT' },
      headVersionNumber: 2,
      provisional: true,
    });
    // Offering read keeps the #317 response shape unchanged.
    expect(
      await (
        await request(OFFERINGS, company.id, { headers: PRICING_USER })
      ).json(),
    ).toEqual(
      await (
        await request(OFFERINGS, company.id, { headers: CATALOGUE_MEMBER })
      ).json(),
    );
    expect(
      await (
        await request(`${OFFERINGS}/${offering.id}`, company.id, {
          headers: PRICING_USER,
        })
      ).json(),
    ).toEqual(offering);
    expect(await writeCounts()).toEqual(beforeReads);

    // Publication stays with Configuration: nothing is written.
    const denied = await post(
      VERSIONS,
      company.id,
      {
        label: 'Pricing User rule',
        effectiveFrom: '2026-06-01T00:00:00Z',
        expectedActiveVersionNumber: 2,
      },
      'pricing-user-rule',
      PRICING_USER,
    );
    expect(denied.status).toBe(403);
    expect(await denied.text()).not.toContain('headVersionNumber');
    expect(await writeCounts()).toEqual(beforeReads);

    // Configuration v1 captures no calculation or snapshot permission.
    const configuration = await activeCompanyOf(
      company.id,
      CONFIGURATION_MEMBER,
    );
    expect(configuration.pricingConfigurationPermissions).toEqual(
      CONFIGURATION_PERMISSIONS,
    );
    expect(configuration.pricingUserPermissions).toBeUndefined();
    expect(JSON.stringify(configuration)).not.toContain(
      'commercial.pricing.calculate',
    );
    expect(JSON.stringify(configuration)).not.toContain(
      'commercial.pricing.snapshot.read',
    );

    // Pricing User authorizes no Company context by itself.
    const other = await member(OTHER_MEMBER, company.id, [
      PRICING_USER_ASSIGNMENTS,
    ]);
    expect(
      (
        await request('/access/current-actor', company.id, {
          headers: OTHER_MEMBER,
        })
      ).status,
    ).toBe(403);
    for (const path of [SCOPE, VERSIONS, OFFERINGS])
      expect(
        (await request(path, company.id, { headers: OTHER_MEMBER })).status,
      ).toBe(403);
    expect(other.membershipId).not.toBe(holder.membershipId);
  }, 60_000);

  it('lets a Pricing User read tariffs, refuses publication and removes tariff reads after revocation', async () => {
    const company = await createCompany('PRISMA-PRIM');
    await member(CONFIGURATION_MEMBER, company.id, [
      CONTEXT_ASSIGNMENTS,
      CONFIGURATION_ASSIGNMENTS,
    ]);
    await member(CATALOGUE_MEMBER, company.id, [
      CONTEXT_ASSIGNMENTS,
      CATALOGUE_ASSIGNMENTS,
    ]);
    const { offering } = await offer(company.id, 'Illustrative offering');
    const published = record(
      await command(
        tariffVersionsPath(offering.id),
        {
          ...TARIFF,
          effectiveFrom: '2026-04-02T00:00:00Z',
          expectedActiveVersionNumber: null,
        },
        `tariff-${crypto.randomUUID()}`,
        company.id,
        CONFIGURATION_MEMBER,
      ),
    );
    expect(published.outcome).toBe('PUBLISHED');
    const tariffVersion = record(published.version);
    const tariffVersionId = stringField(tariffVersion, 'id');

    const holder = await member(PRICING_USER, company.id, [
      CONTEXT_ASSIGNMENTS,
      PRICING_USER_ASSIGNMENTS,
    ]);
    const tariffPaths = [
      tariffScopePath(offering.id),
      tariffVersionsPath(offering.id),
      `${TARIFF_VERSIONS}/${tariffVersionId}`,
    ];
    for (const path of tariffPaths) {
      const owner = await request(path, company.id, {
        headers: CONFIGURATION_MEMBER,
      });
      const read = await request(path, company.id, { headers: PRICING_USER });
      expect({ path, status: read.status }).toEqual({ path, status: 200 });
      expect(await read.json()).toEqual(await owner.json());
    }

    const beforeDeniedPublication = await writeCounts();
    const deniedPublication = await post(
      tariffVersionsPath(offering.id),
      company.id,
      {
        ...TARIFF,
        unitAmount: '456.7800',
        effectiveFrom: '2026-05-01T00:00:00Z',
        expectedActiveVersionNumber: 1,
      },
      `pricing-user-tariff-${crypto.randomUUID()}`,
      PRICING_USER,
    );
    expect(deniedPublication.status).toBe(403);
    expect(await deniedPublication.text()).not.toContain('headVersionNumber');
    expect(await writeCounts()).toEqual(beforeDeniedPublication);

    await revoke(PRICING_USER_ASSIGNMENTS, {
      workspaceMembershipId: holder.membershipId,
      companyId: company.id,
    });
    for (const path of tariffPaths) {
      const denied = await request(path, company.id, {
        headers: PRICING_USER,
      });
      expect({ path, status: denied.status }).toEqual({ path, status: 403 });
      expect(await denied.text()).not.toContain(TARIFF.unitAmount);
    }
  }, 60_000);

  it('records one attributed event per actual grant or revocation and replays or conflicts without committing', async () => {
    const company = await createCompany('PRISMA-PRIM');
    const owner = await actorOf(undefined);
    const holder = await member(PRICING_USER, company.id, [
      CONTEXT_ASSIGNMENTS,
    ]);
    const target = {
      workspaceMembershipId: holder.membershipId,
      companyId: company.id,
    };
    const revokePath = `${PRICING_USER_ASSIGNMENTS}/${holder.membershipId}/${company.id}`;

    const grantResponse = await post(
      PRICING_USER_ASSIGNMENTS,
      undefined,
      target,
      'grant-pricing-user',
    );
    expect(grantResponse.status).toBe(201);
    const granted = record(await grantResponse.json());
    const assignmentId = stringField(granted, 'id');
    expect(granted).toEqual({
      id: assignmentId,
      workspaceMembershipId: holder.membershipId,
      companyId: company.id,
      bundle: 'Company Pricing User',
      permissionSetVersion: 'v1',
      active: true,
    });
    expect(
      (
        await pool.query(
          `SELECT id, bundle::text, permission_set_version, revoked_at
             FROM company_role_assignments WHERE bundle = 'company_pricing_user'`,
        )
      ).rows,
    ).toEqual([
      {
        id: assignmentId,
        bundle: 'company_pricing_user',
        permission_set_version: 'v1',
        revoked_at: null,
      },
    ]);
    const lifecycle = (action: string, assignment: string) => ({
      action,
      actor_workspace_membership_id: owner.membershipId,
      actor_internal_user_id: owner.internalUserId,
      target_type: 'company_role_assignment',
      target_company_role_assignment_id: assignment,
      target_company_id: company.id,
      target_workspace_membership_id: holder.membershipId,
      target_internal_user_id: holder.internalUserId,
      metadata: { bundle: 'Company Pricing User' },
      occurred_at: expect.any(Date),
    });
    expect(await pricingUserEvents()).toEqual([
      lifecycle('company_pricing_user_assignment.granted', assignmentId),
    ]);
    const administration = record(await (await request(ADMINISTRATION)).json());
    expect(administration.assignments).toEqual(
      expect.arrayContaining([granted]),
    );

    // A repeated grant and an exact replay return the live assignment and
    // record nothing.
    for (const key of ['grant-pricing-user-again', 'grant-pricing-user']) {
      const repeated = await post(
        PRICING_USER_ASSIGNMENTS,
        undefined,
        target,
        key,
      );
      expect(repeated.status).toBe(201);
      expect(await repeated.json()).toEqual(granted);
    }
    // A key reused for another target, bundle or operation conflicts and
    // commits nothing.
    const beforeConflicts = await writeCounts();
    for (const reuse of [
      () =>
        post(
          PRICING_USER_ASSIGNMENTS,
          undefined,
          { ...target, workspaceMembershipId: owner.membershipId },
          'grant-pricing-user',
        ),
      () =>
        post(
          CONFIGURATION_ASSIGNMENTS,
          undefined,
          target,
          'grant-pricing-user',
        ),
      () =>
        request(revokePath, undefined, {
          method: 'DELETE',
          headers: { 'idempotency-key': 'grant-pricing-user' },
        }),
    ]) {
      const conflict = await reuse();
      expect(conflict.status).toBe(400);
      expect(await conflict.json()).toMatchObject({
        message: 'Idempotency-Key was already used for another command.',
      });
    }
    expect(await writeCounts()).toEqual(beforeConflicts);
    expect(await pricingUserEvents()).toHaveLength(1);

    const revoked = await request(revokePath, undefined, {
      method: 'DELETE',
      headers: { 'idempotency-key': 'revoke-pricing-user' },
    });
    expect(revoked.status).toBe(200);
    const revokedRecord = { ...granted, active: false };
    expect(await revoked.json()).toEqual(revokedRecord);
    // A repeated revocation and an exact replay record nothing more.
    for (const key of ['revoke-pricing-user-again', 'revoke-pricing-user']) {
      const repeated = await request(revokePath, undefined, {
        method: 'DELETE',
        headers: { 'idempotency-key': key },
      });
      expect(repeated.status).toBe(200);
      expect(await repeated.json()).toEqual(revokedRecord);
    }
    expect(await pricingUserEvents()).toEqual([
      lifecycle('company_pricing_user_assignment.granted', assignmentId),
      lifecycle('company_pricing_user_assignment.revoked', assignmentId),
    ]);

    // A regrant captures v1 again as a new state change.
    const regranted = record(
      await command(PRICING_USER_ASSIGNMENTS, target, 'regrant-pricing-user'),
    );
    const regrantedId = stringField(regranted, 'id');
    expect(regrantedId).not.toBe(assignmentId);
    expect(regranted).toMatchObject({
      bundle: 'Company Pricing User',
      permissionSetVersion: 'v1',
      active: true,
    });
    expect(await pricingUserEvents()).toEqual([
      lifecycle('company_pricing_user_assignment.granted', assignmentId),
      lifecycle('company_pricing_user_assignment.revoked', assignmentId),
      lifecycle('company_pricing_user_assignment.granted', regrantedId),
    ]);
    expect(await activeCompanyOf(company.id, PRICING_USER)).toMatchObject({
      pricingUserPermissions: PRICING_USER_PERMISSIONS,
      pricingUserPermissionAssignmentId: regrantedId,
      pricingUserPermissionSetVersion: 'v1',
    });

    // The events stay under the Company assignment administration boundary.
    expect(
      JSON.stringify(
        await (
          await request('/activity-log', company.id, { headers: PRICING_USER })
        ).json(),
      ),
    ).not.toContain('company_pricing_user_assignment');
    expect(
      JSON.stringify(await (await request('/activity-log')).json()),
    ).toContain('company_pricing_user_assignment.granted');
  }, 60_000);

  it('denies administration without company.assignment.manage and to targets outside the active Workspace without writing', async () => {
    const company = await createCompany('PRISMA-PRIM');
    const inactiveCompany = await createCompany('Inactive Company');
    const holder = await member(PRICING_USER, company.id, [
      CONTEXT_ASSIGNMENTS,
      PRICING_USER_ASSIGNMENTS,
    ]);
    await member(CONFIGURATION_MEMBER, company.id, [
      CONTEXT_ASSIGNMENTS,
      CONFIGURATION_ASSIGNMENTS,
    ]);
    const other = await member(OTHER_MEMBER, company.id, [CONTEXT_ASSIGNMENTS]);
    await seedForeignWorkspace();
    const before = await writeCounts();

    // Neither a Pricing User nor a configuration owner administers access.
    for (const headers of [PRICING_USER, CONFIGURATION_MEMBER]) {
      const grantAttempt = await post(
        PRICING_USER_ASSIGNMENTS,
        company.id,
        { workspaceMembershipId: other.membershipId, companyId: company.id },
        crypto.randomUUID(),
        headers,
      );
      expect(grantAttempt.status).toBe(403);
      const revokeAttempt = await request(
        `${PRICING_USER_ASSIGNMENTS}/${holder.membershipId}/${company.id}`,
        company.id,
        {
          method: 'DELETE',
          headers: { ...headers, 'idempotency-key': crypto.randomUUID() },
        },
      );
      expect(revokeAttempt.status).toBe(403);
      expect(
        (await request(ADMINISTRATION, company.id, { headers })).status,
      ).toBe(403);
    }

    // Inactive or other-Workspace targets get the existing safe response.
    await pool.query(
      "UPDATE workspace_memberships SET status = 'inactive' WHERE id = $1",
      [other.membershipId],
    );
    await pool.query("UPDATE companies SET status = 'inactive' WHERE id = $1", [
      inactiveCompany.id,
    ]);
    try {
      for (const target of [
        { workspaceMembershipId: other.membershipId, companyId: company.id },
        {
          workspaceMembershipId: holder.membershipId,
          companyId: inactiveCompany.id,
        },
        { workspaceMembershipId: FOREIGN.membershipId, companyId: company.id },
        {
          workspaceMembershipId: holder.membershipId,
          companyId: FOREIGN.companyId,
        },
      ]) {
        const refused = await post(
          PRICING_USER_ASSIGNMENTS,
          undefined,
          target,
          crypto.randomUUID(),
        );
        expect({ target, status: refused.status }).toEqual({
          target,
          status: 403,
        });
      }
    } finally {
      await pool.query(
        "UPDATE workspace_memberships SET status = 'active' WHERE id = $1",
        [other.membershipId],
      );
    }
    expect(await writeCounts()).toEqual(before);
    expect(
      (
        await pool.query(
          `SELECT workspace_membership_id, company_id FROM company_role_assignments
            WHERE bundle = 'company_pricing_user'`,
        )
      ).rows,
    ).toEqual([
      { workspace_membership_id: holder.membershipId, company_id: company.id },
    ]);
  }, 60_000);

  const deniedFamilies: readonly DeniedFamily[] = [
    {
      name: 'Pricing Rule publication',
      call: ({ company }) =>
        post(
          VERSIONS,
          company.id,
          {
            label: 'Holder rule',
            effectiveFrom: '2026-06-01T00:00:00Z',
            expectedActiveVersionNumber: 2,
          },
          crypto.randomUUID(),
          PRICING_USER,
        ),
    },
    {
      name: 'Service Definition list',
      call: ({ company }) =>
        request(DEFINITIONS, company.id, { headers: PRICING_USER }),
    },
    {
      name: 'Service Definition create',
      call: ({ company }) =>
        post(
          DEFINITIONS,
          company.id,
          { code: 'HOLDER', name: 'Holder service' },
          crypto.randomUUID(),
          PRICING_USER,
        ),
    },
    {
      name: 'offering create',
      call: ({ company, definitionId }) =>
        post(
          OFFERINGS,
          company.id,
          { serviceDefinitionId: definitionId, commercialLabel: 'Holder' },
          crypto.randomUUID(),
          PRICING_USER,
        ),
    },
    {
      // Opportunities are read only through their Commercial Intake Request.
      name: 'Commercial Intake Request and Opportunity list',
      call: ({ company }) =>
        request(REQUESTS, company.id, { headers: PRICING_USER }),
    },
    {
      name: 'Commercial Intake Request and Opportunity read',
      call: ({ company, requestId }) =>
        request(`${REQUESTS}/${requestId}`, company.id, {
          headers: PRICING_USER,
        }),
    },
    {
      name: 'Client list',
      call: ({ company }) =>
        request('/clients', company.id, { headers: PRICING_USER }),
    },
    {
      name: 'Company assignment administration read',
      call: ({ company }) =>
        request(ADMINISTRATION, company.id, { headers: PRICING_USER }),
    },
    {
      name: 'Company assignment administration grant',
      call: ({ company, holder }) =>
        post(
          CONTEXT_ASSIGNMENTS,
          company.id,
          { workspaceMembershipId: holder.membershipId, companyId: company.id },
          crypto.randomUUID(),
          PRICING_USER,
        ),
    },
  ];

  it.each(deniedFamilies)(
    'refuses the holder $name and writes nothing',
    async ({ call }) => {
      const fixture = await holderFixture();
      const before = await writeCounts();
      const response = await call(fixture);
      expect(response.status).toBe(403);
      const body = await response.text();
      expect(body).not.toContain('Illustrative rule');
      expect(body).not.toContain(fixture.requestId);
      expect(await writeCounts()).toEqual(before);
    },
    60_000,
  );

  // The commercial Activity read surface is the shared Activity Log, which
  // omits commercial events for an actor without the reader bundle (#313)
  // rather than refusing the whole page.
  it('shows the holder no commercial Activity', async () => {
    const fixture = await holderFixture();
    const page = await request('/activity-log', fixture.company.id, {
      headers: PRICING_USER,
    });
    expect(page.status).toBe(200);
    const body: unknown = await page.json();
    expect(
      activityActions(body).filter(
        (action) =>
          action === 'client_request.created' ||
          action === 'opportunity.created' ||
          action === 'opportunity.next_action.updated',
      ),
    ).toEqual([]);
    expect(JSON.stringify(body)).not.toContain(fixture.requestId);
    expect(
      (await activeCompanyOf(fixture.company.id, PRICING_USER))
        .commercialActivityPermissions,
    ).toBeUndefined();
  }, 60_000);

  it.each(INDEPENDENT_ROLES)(
    'confers no Pricing User permission through $name',
    async (role) => {
      const company = await createCompany('PRISMA-PRIM');
      await member(CONFIGURATION_MEMBER, company.id, [
        CONTEXT_ASSIGNMENTS,
        CONFIGURATION_ASSIGNMENTS,
      ]);
      const rules = await publishRules(company.id, 'Illustrative rule');
      const headers = role.subject === null ? {} : memberHeaders(role.subject);
      const actor = await member(headers, company.id, role.assignmentPaths);
      if (role.legacyIntakeV1) {
        const updated = await pool.query(
          `UPDATE company_role_assignments SET permission_set_version = 'v1'
            WHERE workspace_membership_id = $1 AND company_id = $2
              AND bundle = 'company_commercial_intake' AND revoked_at IS NULL`,
          [actor.membershipId, company.id],
        );
        expect(updated.rowCount).toBe(1);
      }

      const selected = await activeCompanyOf(company.id, headers);
      if (role.legacyIntakeV1)
        expect(selected.commercialIntakePermissionSetVersion).toBe('v1');
      expect(selected.pricingUserPermissions).toBeUndefined();
      expect(selected.pricingUserPermissionAssignmentId).toBeUndefined();
      expect(selected.pricingUserPermissionSetVersion).toBeUndefined();
      expect(JSON.stringify(selected)).not.toContain(
        'commercial.pricing.calculate',
      );
      expect(JSON.stringify(selected)).not.toContain(
        'commercial.pricing.snapshot.read',
      );
      for (const path of [SCOPE, VERSIONS, `${VERSIONS}/${rules.first.id}`])
        expect({
          path,
          status: (await request(path, company.id, { headers })).status,
        }).toEqual({ path, status: role.ruleReadStatus });
    },
    60_000,
  );

  it('keeps each grant standing alone for a member holding both Configuration and Pricing User', async () => {
    const company = await createCompany('PRISMA-PRIM');
    const both = await member(BOTH_MEMBER, company.id, [
      CONTEXT_ASSIGNMENTS,
      CONFIGURATION_ASSIGNMENTS,
      PRICING_USER_ASSIGNMENTS,
    ]);
    const target = {
      workspaceMembershipId: both.membershipId,
      companyId: company.id,
    };
    expect(await activeCompanyOf(company.id, BOTH_MEMBER)).toMatchObject({
      pricingConfigurationPermissions: CONFIGURATION_PERMISSIONS,
      pricingUserPermissions: PRICING_USER_PERMISSIONS,
    });
    const first = await publishAs(BOTH_MEMBER, company.id, 1, null);
    await expectReads(company.id, BOTH_MEMBER, first.id, 200);

    // Without Pricing User, Configuration keeps reads and publication.
    await revoke(PRICING_USER_ASSIGNMENTS, target);
    const configurationOnly = await activeCompanyOf(company.id, BOTH_MEMBER);
    expect(configurationOnly.pricingUserPermissions).toBeUndefined();
    expect(configurationOnly.pricingConfigurationPermissions).toEqual(
      CONFIGURATION_PERMISSIONS,
    );
    await expectReads(company.id, BOTH_MEMBER, first.id, 200);
    await publishAs(BOTH_MEMBER, company.id, 2, 1);

    // Without Configuration, Pricing User keeps reads but not publication.
    await grant(PRICING_USER_ASSIGNMENTS, target);
    await revoke(CONFIGURATION_ASSIGNMENTS, target);
    const pricingUserOnly = await activeCompanyOf(company.id, BOTH_MEMBER);
    expect(pricingUserOnly.pricingConfigurationPermissions).toBeUndefined();
    expect(pricingUserOnly.pricingUserPermissions).toEqual(
      PRICING_USER_PERMISSIONS,
    );
    await expectReads(company.id, BOTH_MEMBER, first.id, 200);
    const before = await writeCounts();
    const refused = await post(
      VERSIONS,
      company.id,
      ruleContent(3, 2),
      'both-refused-3',
      BOTH_MEMBER,
    );
    expect(refused.status).toBe(403);
    expect(await writeCounts()).toEqual(before);

    // A regrant restores exactly the granted authority.
    await grant(CONFIGURATION_ASSIGNMENTS, target);
    expect(await activeCompanyOf(company.id, BOTH_MEMBER)).toMatchObject({
      pricingConfigurationPermissions: CONFIGURATION_PERMISSIONS,
      pricingUserPermissions: PRICING_USER_PERMISSIONS,
    });
    const third = await publishAs(BOTH_MEMBER, company.id, 3, 2);
    await expectReads(company.id, BOTH_MEMBER, third.id, 200);
  }, 60_000);

  it('evaluates the former holder against live assignments after revocation, inactivity or an unknown captured version', async () => {
    const fixture = await holderFixture();
    const { company, holder, rules, offering } = fixture;
    const target = {
      workspaceMembershipId: holder.membershipId,
      companyId: company.id,
    };
    const paths = [
      SCOPE,
      VERSIONS,
      `${VERSIONS}/${rules.first.id}`,
      OFFERINGS,
      `${OFFERINGS}/${offering.id}`,
    ];
    await expectReads(company.id, PRICING_USER, rules.first.id, 200);

    await revoke(PRICING_USER_ASSIGNMENTS, target);
    for (const path of paths) {
      const denied = await request(path, company.id, {
        headers: PRICING_USER,
      });
      expect({ path, status: denied.status }).toEqual({ path, status: 403 });
      expect(await denied.text()).not.toContain('Illustrative');
    }
    const revoked = await activeCompanyOf(company.id, PRICING_USER);
    expect(revoked.pricingUserPermissions).toBeUndefined();
    expect(revoked.pricingUserPermissionAssignmentId).toBeUndefined();
    expect(revoked.pricingUserPermissionSetVersion).toBeUndefined();

    await grant(PRICING_USER_ASSIGNMENTS, target);
    await expectReads(company.id, PRICING_USER, rules.first.id, 200);

    // A null or unknown captured version resolves no permission at runtime.
    const assignmentId = await liveAssignmentId(
      holder.membershipId,
      company.id,
      'company_pricing_user',
    );
    const [constraint] = (
      await pool.query<{ definition: string }>(
        `SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
          WHERE conname = 'company_role_assignments_permission_set_version_check'`,
      )
    ).rows;
    if (!constraint) throw new Error('Expected the captured-version check.');
    await pool.query(
      'ALTER TABLE company_role_assignments DROP CONSTRAINT company_role_assignments_permission_set_version_check',
    );
    try {
      for (const version of [null, 'v2', 'V1']) {
        await pool.query(
          'UPDATE company_role_assignments SET permission_set_version = $1 WHERE id = $2',
          [version, assignmentId],
        );
        const unknown = await activeCompanyOf(company.id, PRICING_USER);
        expect(unknown.pricingUserPermissions).toBeUndefined();
        for (const path of paths)
          expect({
            version,
            path,
            status: (await request(path, company.id, { headers: PRICING_USER }))
              .status,
          }).toEqual({ version, path, status: 403 });
      }
    } finally {
      await pool.query(
        "UPDATE company_role_assignments SET permission_set_version = 'v1' WHERE id = $1",
        [assignmentId],
      );
      await pool.query(
        `ALTER TABLE company_role_assignments
           ADD CONSTRAINT company_role_assignments_permission_set_version_check ${constraint.definition}`,
      );
    }
    await expectReads(company.id, PRICING_USER, rules.first.id, 200);

    // An inactive membership keeps no authority.
    await pool.query(
      "UPDATE workspace_memberships SET status = 'inactive' WHERE id = $1",
      [holder.membershipId],
    );
    expect(
      (
        await request('/access/current-actor', company.id, {
          headers: PRICING_USER,
        })
      ).status,
    ).toBe(403);
    for (const path of paths)
      expect(
        (await request(path, company.id, { headers: PRICING_USER })).status,
      ).toBe(403);
  }, 60_000);

  it('isolates the holder from another Company and Workspace with the same safe not-found', async () => {
    const primary = await createCompany('PRISMA-PRIM');
    const secondary = await createCompany('BIC');
    for (const company of [primary, secondary])
      await member(CONFIGURATION_MEMBER, company.id, [
        CONTEXT_ASSIGNMENTS,
        CONFIGURATION_ASSIGNMENTS,
      ]);
    const primaryRules = await publishRules(primary.id, 'Illustrative rule');
    const secondaryRules = await publishRules(secondary.id, 'Only BIC rule');
    for (const company of [primary, secondary])
      await member(CATALOGUE_MEMBER, company.id, [
        CONTEXT_ASSIGNMENTS,
        CATALOGUE_ASSIGNMENTS,
      ]);
    const { offering: primaryOffering, definitionId } = await offer(
      primary.id,
      'Illustrative offering',
    );
    const secondaryOffering = await offerDefinition(
      secondary.id,
      definitionId,
      'Only BIC offering',
    );
    await seedForeignWorkspace();
    await member(PRICING_USER, primary.id, [
      CONTEXT_ASSIGNMENTS,
      PRICING_USER_ASSIGNMENTS,
    ]);
    await member(PRICING_USER, secondary.id, [CONTEXT_ASSIGNMENTS]);

    // Acting in a Company without the bundle, the holder gets 403.
    for (const path of [
      SCOPE,
      VERSIONS,
      `${VERSIONS}/${secondaryRules.first.id}`,
      OFFERINGS,
      `${OFFERINGS}/${secondaryOffering.id}`,
    ]) {
      const denied = await request(path, secondary.id, {
        headers: PRICING_USER,
      });
      expect({ path, status: denied.status }).toEqual({ path, status: 403 });
      expect(await denied.text()).not.toContain('Only BIC');
    }
    expect(
      (await activeCompanyOf(secondary.id, PRICING_USER))
        .pricingUserPermissions,
    ).toBeUndefined();

    // Acting in its own Company, other Companies' and Workspaces' ids get
    // exactly the not-found of an unknown id.
    const unknownVersion = await request(
      `${VERSIONS}/${UNKNOWN_ID}`,
      primary.id,
      {
        headers: PRICING_USER,
      },
    );
    expect(unknownVersion.status).toBe(404);
    const versionNotFound = await unknownVersion.text();
    for (const id of [
      secondaryRules.first.id,
      FOREIGN.ruleVersionId,
      'not-a-version',
    ]) {
      const hidden = await request(`${VERSIONS}/${id}`, primary.id, {
        headers: PRICING_USER,
      });
      expect({ id, status: hidden.status }).toEqual({ id, status: 404 });
      expect(await hidden.text()).toBe(versionNotFound);
    }
    const unknownOffering = await request(
      `${OFFERINGS}/${UNKNOWN_ID}`,
      primary.id,
      { headers: PRICING_USER },
    );
    expect(unknownOffering.status).toBe(404);
    const offeringNotFound = await unknownOffering.text();
    for (const id of [secondaryOffering.id, FOREIGN.offeringId]) {
      const hidden = await request(`${OFFERINGS}/${id}`, primary.id, {
        headers: PRICING_USER,
      });
      expect({ id, status: hidden.status }).toEqual({ id, status: 404 });
      expect(await hidden.text()).toBe(offeringNotFound);
    }

    // Lists, head numbers and Activity carry nothing of the other Company.
    expect(
      await (
        await request(SCOPE, primary.id, { headers: PRICING_USER })
      ).json(),
    ).toMatchObject({ headVersionNumber: 2 });
    const versions = pageItems(
      await (
        await request(VERSIONS, primary.id, { headers: PRICING_USER })
      ).json(),
    );
    expect(versions.map((version) => version.id)).toEqual([
      primaryRules.second.id,
      primaryRules.first.id,
    ]);
    const offerings = pageItems(
      await (
        await request(OFFERINGS, primary.id, { headers: PRICING_USER })
      ).json(),
    );
    expect(offerings.map((item) => item.id)).toEqual([primaryOffering.id]);
    const activity = JSON.stringify(
      await (
        await request('/activity-log', primary.id, { headers: PRICING_USER })
      ).json(),
    );
    for (const hidden of [
      secondary.id,
      'Only BIC',
      secondaryRules.first.id,
      secondaryOffering.id,
    ])
      expect(activity).not.toContain(hidden);
    const foreignWorkspace = await request(SCOPE, primary.id, {
      headers: {
        ...PRICING_USER,
        'x-workspace-context-id': FOREIGN.workspaceId,
      },
    });
    expect(foreignWorkspace.status).toBe(403);
  }, 60_000);

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

  function post(
    path: string,
    companyId: string | undefined,
    body: unknown,
    key: string,
    headers: Record<string, string> = {},
  ) {
    return request(path, companyId, {
      method: 'POST',
      headers: {
        ...headers,
        'content-type': 'application/json',
        'idempotency-key': key,
      },
      body: JSON.stringify(body),
    });
  }

  async function command(
    path: string,
    body: unknown,
    key: string,
    companyId?: string,
    headers: Record<string, string> = {},
  ): Promise<unknown> {
    const response = await post(path, companyId, body, key, headers);
    const value: unknown = await response.json();
    expect({ path, status: response.status, value }).toMatchObject({
      status: 201,
    });
    return value;
  }

  async function grant(
    path: string,
    target: { workspaceMembershipId: string; companyId: string },
  ): Promise<void> {
    await command(path, target, `${path}-${crypto.randomUUID()}`);
  }

  async function revoke(
    path: string,
    target: { workspaceMembershipId: string; companyId: string },
  ): Promise<void> {
    const response = await request(
      `${path}/${target.workspaceMembershipId}/${target.companyId}`,
      undefined,
      {
        method: 'DELETE',
        headers: { 'idempotency-key': `${path}-${crypto.randomUUID()}` },
      },
    );
    expect({ path, status: response.status }).toEqual({ path, status: 200 });
  }

  async function createCompany(displayName: string): Promise<{ id: string }> {
    return entity(
      await command(
        '/companies',
        { displayName },
        `company-${crypto.randomUUID()}`,
      ),
    );
  }

  async function actorOf(
    companyId: string | undefined,
    headers: Record<string, string> = {},
  ): Promise<MemberActor> {
    const response = await request('/access/current-actor', companyId, {
      headers,
    });
    expect(response.status).toBe(200);
    const actor = record(await response.json());
    return {
      membershipId: stringField(actor, 'workspaceMembershipId'),
      internalUserId: stringField(actor, 'internalUserId'),
    };
  }

  async function activeCompanyOf(
    companyId: string,
    headers: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const response = await request('/access/current-actor', companyId, {
      headers,
    });
    expect(response.status).toBe(200);
    return record(record(await response.json()).activeCompany);
  }

  async function member(
    headers: Record<string, string>,
    companyId: string,
    assignmentPaths: readonly string[],
  ): Promise<MemberActor> {
    const actor = await actorOf(undefined, headers);
    for (const path of assignmentPaths)
      await grant(path, {
        workspaceMembershipId: actor.membershipId,
        companyId,
      });
    return actor;
  }

  // Configuration member publishes a CURRENT first version and a scheduled
  // successor at the fixed instant.
  async function publishRules(
    companyId: string,
    label: string,
  ): Promise<{ first: VersionView; second: VersionView }> {
    const first = publishedVersion(
      await command(
        VERSIONS,
        {
          label: `${label} v1`,
          effectiveFrom: '2026-04-01T00:00:00Z',
          expectedActiveVersionNumber: null,
        },
        `rule-1-${crypto.randomUUID()}`,
        companyId,
        CONFIGURATION_MEMBER,
      ),
    );
    const second = publishedVersion(
      await command(
        VERSIONS,
        {
          label: `${label} v2`,
          effectiveFrom: '2026-05-01T00:00:00Z',
          expectedActiveVersionNumber: 1,
        },
        `rule-2-${crypto.randomUUID()}`,
        companyId,
        CONFIGURATION_MEMBER,
      ),
    );
    expect([first.versionNumber, second.versionNumber]).toEqual([1, 2]);
    return { first, second };
  }

  async function publishAs(
    headers: Record<string, string>,
    companyId: string,
    versionNumber: number,
    expectedActiveVersionNumber: number | null,
  ): Promise<VersionView> {
    const version = publishedVersion(
      await command(
        VERSIONS,
        ruleContent(versionNumber, expectedActiveVersionNumber),
        `publish-${crypto.randomUUID()}`,
        companyId,
        headers,
      ),
    );
    expect(version.versionNumber).toBe(versionNumber);
    return version;
  }

  // Catalogue member defines a shared Service and offers it.
  async function offer(
    companyId: string,
    commercialLabel: string,
  ): Promise<{
    definitionId: string;
    offering: Record<string, unknown> & { id: string };
  }> {
    const definition = record(
      record(
        await command(
          DEFINITIONS,
          { code: 'ISO-9001_GAP', name: 'ISO 9001 gap analysis' },
          `definition-${crypto.randomUUID()}`,
          companyId,
          CATALOGUE_MEMBER,
        ),
      ).definition,
    );
    const definitionId = stringField(definition, 'id');
    return {
      definitionId,
      offering: await offerDefinition(companyId, definitionId, commercialLabel),
    };
  }

  async function offerDefinition(
    companyId: string,
    serviceDefinitionId: string,
    commercialLabel: string,
  ): Promise<Record<string, unknown> & { id: string }> {
    const offering = record(
      record(
        await command(
          OFFERINGS,
          { serviceDefinitionId, commercialLabel },
          `offering-${crypto.randomUUID()}`,
          companyId,
          CATALOGUE_MEMBER,
        ),
      ).offering,
    );
    return { ...offering, id: stringField(offering, 'id') };
  }

  // A holder with Company Context Access and Pricing User in a Company whose
  // rules, offering and Commercial Intake Request other members recorded.
  async function holderFixture(): Promise<HolderFixture> {
    const company = await createCompany('PRISMA-PRIM');
    await member(CONFIGURATION_MEMBER, company.id, [
      CONTEXT_ASSIGNMENTS,
      CONFIGURATION_ASSIGNMENTS,
    ]);
    const rules = await publishRules(company.id, 'Illustrative rule');
    await member(CATALOGUE_MEMBER, company.id, [
      CONTEXT_ASSIGNMENTS,
      CATALOGUE_ASSIGNMENTS,
    ]);
    const { definitionId, offering } = await offer(
      company.id,
      'Illustrative offering',
    );
    await member(INTAKE_MEMBER, company.id, [
      CONTEXT_ASSIGNMENTS,
      INTAKE_ASSIGNMENTS,
    ]);
    const created = record(
      await command(
        REQUESTS,
        {
          originalText: 'Exact manual source for the pricing user boundary.',
          sourceLabel: 'Manual intake note',
          subject: 'Pricing user boundary subject',
          opportunity: {
            title: 'Qualify the pricing user boundary request',
            scope: 'Initial discussion about the requested work',
            nextAction: 'Arrange a qualification call',
          },
        },
        `request-${crypto.randomUUID()}`,
        company.id,
        INTAKE_MEMBER,
      ),
    );
    const holder = await member(PRICING_USER, company.id, [
      CONTEXT_ASSIGNMENTS,
      PRICING_USER_ASSIGNMENTS,
    ]);
    return {
      company,
      holder,
      rules,
      definitionId,
      offering,
      requestId: stringField(created, 'id'),
    };
  }

  async function expectReads(
    companyId: string,
    headers: Record<string, string>,
    versionId: string,
    status: 200 | 403,
  ): Promise<void> {
    for (const path of [SCOPE, VERSIONS, `${VERSIONS}/${versionId}`, OFFERINGS])
      expect({
        path,
        status: (await request(path, companyId, { headers })).status,
      }).toEqual({ path, status });
  }

  function tariffScopePath(offeringId: string): string {
    return `/pricing-configuration/offerings/${offeringId}/tariff-scope`;
  }

  function tariffVersionsPath(offeringId: string): string {
    return `/pricing-configuration/offerings/${offeringId}/tariff-versions`;
  }

  async function liveAssignmentId(
    workspaceMembershipId: string,
    companyId: string,
    bundle: string,
  ): Promise<string> {
    const [assignment] = (
      await pool.query<{ id: string }>(
        `SELECT id FROM company_role_assignments
          WHERE workspace_membership_id = $1 AND company_id = $2
            AND bundle::text = $3 AND revoked_at IS NULL`,
        [workspaceMembershipId, companyId, bundle],
      )
    ).rows;
    if (!assignment) throw new Error(`Expected a live ${bundle} assignment.`);
    return assignment.id;
  }

  async function pricingUserEvents(): Promise<unknown[]> {
    return (
      await pool.query(
        `SELECT action::text, actor_workspace_membership_id, actor_internal_user_id,
                target_type::text, target_company_role_assignment_id, target_company_id,
                target_workspace_membership_id, target_internal_user_id, metadata, occurred_at
           FROM activity_log_events
          WHERE action::text LIKE 'company_pricing_user_assignment.%'
          ORDER BY occurred_at, id`,
      )
    ).rows;
  }

  async function writeCounts(): Promise<Record<string, unknown>> {
    const result = await pool.query(
      `SELECT ${WRITABLE_TABLES.map(
        (table) => `(SELECT count(*)::integer FROM ${table}) AS ${table}`,
      ).join(', ')}`,
    );
    return record(result.rows[0]);
  }

  async function seedForeignWorkspace(): Promise<void> {
    const {
      workspaceId,
      internalUserId,
      membershipId,
      companyId,
      ruleVersionId,
      definitionId,
      offeringId,
    } = FOREIGN;
    await pool.query(
      "INSERT INTO workspaces (id, name) VALUES ($1, 'Foreign Workspace')",
      [workspaceId],
    );
    await pool.query(
      `INSERT INTO internal_users (id, external_provider, external_subject, display_name, email)
       VALUES ($1, 'deterministic-test', 'foreign-owner', 'Foreign Owner', 'foreign@example.test')`,
      [internalUserId],
    );
    await pool.query(
      'INSERT INTO workspace_memberships (id, workspace_id, internal_user_id) VALUES ($1, $2, $3)',
      [membershipId, workspaceId, internalUserId],
    );
    await pool.query(
      `INSERT INTO companies (id, workspace_id, display_name, created_by_internal_user_id,
         created_by_workspace_membership_id, registration_idempotency_key)
       VALUES ($1, $2, 'Foreign Company', $3, $4, 'foreign-company')`,
      [companyId, workspaceId, internalUserId, membershipId],
    );
    await pool.query(
      `INSERT INTO pricing_rule_versions (id, workspace_id, company_id, version_number, label,
         effective_from, created_by_internal_user_id, created_by_workspace_membership_id, created_at)
       VALUES ($1, $2, $3, 1, 'Foreign rule', TIMESTAMPTZ '2026-05-01 00:00:00+00', $4, $5,
               TIMESTAMPTZ '2026-04-01 00:00:00+00')`,
      [ruleVersionId, workspaceId, companyId, internalUserId, membershipId],
    );
    await pool.query(
      `INSERT INTO service_definitions (id, workspace_id, code, name, created_by_internal_user_id,
         created_by_workspace_membership_id, created_in_company_id)
       VALUES ($1, $2, 'FOREIGN', 'Foreign definition', $3, $4, $5)`,
      [definitionId, workspaceId, internalUserId, membershipId, companyId],
    );
    await pool.query(
      `INSERT INTO company_service_offerings (id, workspace_id, company_id, service_definition_id,
         commercial_label, created_by_internal_user_id, created_by_workspace_membership_id)
       VALUES ($1, $2, $3, $4, 'Foreign offering', $5, $6)`,
      [
        offeringId,
        workspaceId,
        companyId,
        definitionId,
        internalUserId,
        membershipId,
      ],
    );
  }
});

interface MemberActor {
  membershipId: string;
  internalUserId: string;
}

interface VersionView {
  id: string;
  versionNumber: number;
}

function ruleContent(
  versionNumber: number,
  expectedActiveVersionNumber: number | null,
) {
  return {
    label: `Illustrative rule ${versionNumber}`,
    effectiveFrom: `2026-04-0${versionNumber + 1}T00:00:00Z`,
    expectedActiveVersionNumber,
  };
}

function memberHeaders(subject: string): Record<string, string> {
  return {
    'x-test-external-subject': subject,
    'x-test-display-name': subject,
    'x-test-email': `${subject}@example.test`,
  };
}

function publishedVersion(value: unknown): VersionView {
  const result = record(value);
  expect(result.outcome).toBe('PUBLISHED');
  const version = record(result.version);
  return {
    id: stringField(version, 'id'),
    versionNumber: numberField(version, 'versionNumber'),
  };
}

function pageItems(value: unknown): { id: string }[] {
  const page = record(value);
  if (!Array.isArray(page.items)) throw new Error('Expected a page.');
  return page.items.map(entity);
}

function activityActions(value: unknown): string[] {
  const page = record(value);
  if (!Array.isArray(page.events)) throw new Error('Expected Activity events.');
  return page.events.map((event) => stringField(record(event), 'action'));
}

function entity(value: unknown): { id: string } {
  return { id: stringField(record(value), 'id') };
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

function numberField(value: Record<string, unknown>, field: string): number {
  const result = value[field];
  if (typeof result !== 'number') throw new Error(`Expected ${field}.`);
  return result;
}
