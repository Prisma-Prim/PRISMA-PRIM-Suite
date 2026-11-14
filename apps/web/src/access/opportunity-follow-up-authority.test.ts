import { describe, expect, it } from 'vitest';
import type { CompanyGrant } from './company-grants';
import {
  companyGrants,
  withCompanyGrants,
  withoutCompanyGrants,
  type CompanyGrantRequest,
} from './company-grants.test-fixture';
import { readCurrentActor, type ActorContext } from './current-actor';
import { opportunityFollowUpAuthority } from './opportunity-follow-up-authority';

const coordinator = {
  bundle: 'company_opportunity_follow_up_coordinator',
  version: 'v1',
  assignmentId: '20000000-0000-4000-8000-000000000001',
} as const satisfies CompanyGrantRequest;
const intake = {
  bundle: 'company_commercial_intake',
  version: 'v2',
  assignmentId: '30000000-0000-4000-8000-000000000001',
} as const satisfies CompanyGrantRequest;

const company = {
  id: '10000000-0000-4000-8000-000000000001',
  displayName: 'Original Company',
  grants: companyGrants(coordinator, intake),
  opportunityFollowUpReadCapture:
    'opportunity-follow-up-read.v1.' + 'a'.repeat(64),
} satisfies NonNullable<ActorContext['activeCompany']>;

const actor = {
  internalUserId: '40000000-0000-4000-8000-000000000001',
  workspaceId: '50000000-0000-4000-8000-000000000001',
  workspaceMembershipId: '60000000-0000-4000-8000-000000000001',
  displayName: 'Reader',
  email: 'reader@example.test',
  workspaceName: 'Original Workspace',
  active: true,
  workspacePermissions: [],
  activeCompany: company,
} satisfies ActorContext;

/** The coordinator grant as sent on the wire, with `change` applied. */
function coordinatorGrant(change: Record<string, unknown>): unknown[] {
  return company.grants.map((grant: CompanyGrant) =>
    grant.bundle === coordinator.bundle ? { ...grant, ...change } : grant,
  );
}

async function read(change: Record<string, unknown>) {
  return readCurrentActor({
    api: {
      request: async () => ({
        status: 'ok',
        value: {
          ...actor,
          activeCompany: {
            ...company,
            ...change,
            clientPermissions: ['client.read'],
          },
        },
      }),
    },
  });
}

describe('Opportunity follow-up browser authority', () => {
  it('allows independent read/manage without any Client permission', () => {
    expect(opportunityFollowUpAuthority(actor)).toMatchObject({
      companyId: company.id,
      readCapture: company.opportunityFollowUpReadCapture,
      canManage: true,
    });
    expect(
      opportunityFollowUpAuthority({
        ...actor,
        activeCompany: {
          ...company,
          grants: withCompanyGrants(company.grants, {
            ...intake,
            version: 'v1',
          }),
        },
      }),
    ).toMatchObject({ canManage: false });
  });

  it('fails closed for missing new captures while preserving unrelated actor authority', async () => {
    for (const change of [
      { grants: withoutCompanyGrants(company.grants, coordinator.bundle) },
      { opportunityFollowUpReadCapture: 'unvalidated' },
      { opportunityFollowUpReadCapture: null },
    ]) {
      const result = await read(change);
      expect(result.status).toBe('ok');
      if (result.status !== 'ok')
        throw new Error('Expected additive Actor representation');
      expect(result.value.activeCompany?.clientPermissions).toEqual([
        'client.read',
      ]);
      expect(opportunityFollowUpAuthority(result.value)).toBeUndefined();
    }
  });

  // An unknown version or permission set of the grant refuses the whole
  // current Actor (#1332), so no screen offers authority from it.
  it('refuses the whole current Actor for an unknown follow-up grant', async () => {
    for (const change of [
      { permissionSetVersion: 'future' },
      { permissionSetVersion: null },
      { permissions: ['commercial.opportunity.follow_up.manage'] },
      { permissions: ['commercial.opportunity.follow_up.read', 'unknown'] },
    ])
      expect(await read({ grants: coordinatorGrant(change) })).toEqual({
        status: 'error',
      });
  });

  it('changes its key for every consumed identity replacement despite equal permissions', () => {
    const original = opportunityFollowUpAuthority(actor)?.key;
    expect(original).toBeDefined();
    for (const change of [
      {
        grants: withCompanyGrants(company.grants, {
          ...coordinator,
          assignmentId: '20000000-0000-4000-8000-000000000002',
        }),
      },
      {
        grants: withCompanyGrants(company.grants, {
          ...intake,
          assignmentId: '30000000-0000-4000-8000-000000000002',
        }),
      },
      {
        grants: withCompanyGrants(company.grants, { ...intake, version: 'v3' }),
      },
      {
        opportunityFollowUpReadCapture:
          'opportunity-follow-up-read.v1.' + 'b'.repeat(64),
      },
    ] satisfies Partial<NonNullable<ActorContext['activeCompany']>>[]) {
      expect(
        opportunityFollowUpAuthority({
          ...actor,
          activeCompany: { ...company, ...change },
        })?.key,
      ).not.toBe(original);
    }
    expect(
      opportunityFollowUpAuthority({ ...actor, workspaceMembershipId: 'other' })
        ?.key,
    ).not.toBe(original);
    expect(
      opportunityFollowUpAuthority({
        ...actor,
        activeCompany: {
          ...company,
          grants: withoutCompanyGrants(company.grants, intake.bundle),
        },
      }),
    ).toBeUndefined();
  });
});
