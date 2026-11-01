import { describe, expect, it } from 'vitest';
import { readCurrentActor, type ActorContext } from './current-actor';
import { opportunityFollowUpAuthority } from './opportunity-follow-up-authority';

const company = {
  id: '10000000-0000-4000-8000-000000000001',
  displayName: 'Original Company',
  opportunityFollowUpPermissions: [
    'commercial.opportunity.follow_up.read',
    'commercial.opportunity.follow_up.manage',
  ],
  opportunityFollowUpCoordinatorAssignmentId:
    '20000000-0000-4000-8000-000000000001',
  opportunityFollowUpCoordinatorPermissionSetVersion: 'v1',
  opportunityFollowUpReadCapture:
    'opportunity-follow-up-read.v1.' + 'a'.repeat(64),
  commercialIntakePermissionAssignmentId:
    '30000000-0000-4000-8000-000000000001',
  commercialIntakePermissionSetVersion: 'v2',
  commercialIntakePermissions: [
    'commercial.request.read',
    'commercial.opportunity.read',
    'commercial.opportunity.next_action.update',
  ],
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
          commercialIntakePermissionSetVersion: 'v1',
        },
      }),
    ).toMatchObject({ canManage: false });
  });

  it('fails closed for missing or unknown new captures while preserving unrelated actor authority', async () => {
    for (const change of [
      { opportunityFollowUpCoordinatorPermissionSetVersion: 'future' },
      { opportunityFollowUpCoordinatorPermissionSetVersion: null },
      { opportunityFollowUpCoordinatorAssignmentId: undefined },
      { opportunityFollowUpReadCapture: 'unvalidated' },
      { opportunityFollowUpReadCapture: null },
      {
        opportunityFollowUpPermissions: [
          'commercial.opportunity.follow_up.manage',
        ],
      },
      {
        opportunityFollowUpPermissions: [
          'commercial.opportunity.follow_up.read',
          'unknown',
        ],
      },
    ]) {
      const value = {
        ...actor,
        activeCompany: {
          ...company,
          ...change,
          clientPermissions: ['client.read'],
        },
      };
      const result = await readCurrentActor({
        api: { request: async () => ({ status: 'ok', value }) },
      });
      expect(result.status).toBe('ok');
      if (result.status !== 'ok')
        throw new Error('Expected additive Actor representation');
      expect(result.value.activeCompany?.clientPermissions).toEqual([
        'client.read',
      ]);
      expect(opportunityFollowUpAuthority(result.value)).toBeUndefined();
    }
  });

  it('changes its key for every consumed identity replacement despite equal permissions', () => {
    const original = opportunityFollowUpAuthority(actor)?.key;
    expect(original).toBeDefined();
    for (const change of [
      {
        opportunityFollowUpCoordinatorAssignmentId:
          '20000000-0000-4000-8000-000000000002',
      },
      {
        commercialIntakePermissionAssignmentId:
          '30000000-0000-4000-8000-000000000002',
      },
      { commercialIntakePermissionSetVersion: 'v3' },
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
        activeCompany: { ...company, commercialIntakePermissions: [] },
      }),
    ).toBeUndefined();
  });
});
