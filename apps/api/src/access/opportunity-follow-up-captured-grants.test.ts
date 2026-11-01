import { describe, expect, it } from 'vitest';
import {
  opportunityFollowUpCapturedAuthority,
  opportunityFollowUpReadCapture,
} from './opportunity-follow-up-captured-grants.js';

const assignmentId = '10000000-0000-4000-8000-000000000001';
const nativeAssignmentId = '20000000-0000-4000-8000-000000000001';
const contextId = '30000000-0000-4000-8000-000000000001';
const captureInput = {
  workspaceId: '40000000-0000-4000-8000-000000000001',
  workspaceMembershipId: '50000000-0000-4000-8000-000000000001',
  companyId: '60000000-0000-4000-8000-000000000001',
  assignmentId,
  nativeAssignmentId,
  nativePermissionSetVersion: 'v2',
  contextIdentities: [['company_context_access', contextId, null]],
};
const company = {
  opportunityFollowUpPermissions: [
    'commercial.opportunity.follow_up.read',
    'commercial.opportunity.follow_up.manage',
  ],
  opportunityFollowUpCoordinatorAssignmentId: assignmentId,
  opportunityFollowUpCoordinatorPermissionSetVersion: 'v1',
  opportunityFollowUpReadCapture:
    'opportunity-follow-up-read.v1.' + 'a'.repeat(64),
  commercialIntakePermissionAssignmentId: nativeAssignmentId,
  commercialIntakePermissionSetVersion: 'v2',
  commercialIntakePermissions: [
    'commercial.request.read',
    'commercial.opportunity.read',
    'commercial.opportunity.next_action.update',
  ],
};

describe('Opportunity follow-up captured authority', () => {
  it('requires independent native reads and a captured coordinator without Client access', () => {
    expect(
      opportunityFollowUpCapturedAuthority(company, { manage: true }),
    ).toEqual({
      assignmentId,
      permissionSetVersion: 'v1',
      nativeAssignmentId,
      nativePermissionSetVersion: 'v2',
      readCapture: company.opportunityFollowUpReadCapture,
    });
    expect(
      opportunityFollowUpCapturedAuthority(
        { ...company, commercialIntakePermissions: [] },
        { manage: false },
      ),
    ).toBeUndefined();
  });

  it('allows native v1 reads while refusing writes even if projected permissions claim update', () => {
    const legacy = { ...company, commercialIntakePermissionSetVersion: 'v1' };
    expect(
      opportunityFollowUpCapturedAuthority(legacy, { manage: false }),
    ).toBeDefined();
    expect(
      opportunityFollowUpCapturedAuthority(legacy, { manage: true }),
    ).toBeUndefined();
  });

  it('fails closed on absent, unknown, malformed or mismatched captures', () => {
    for (const change of [
      { opportunityFollowUpCoordinatorPermissionSetVersion: null },
      { opportunityFollowUpCoordinatorPermissionSetVersion: 'v2' },
      { opportunityFollowUpCoordinatorAssignmentId: 'unknown' },
      { opportunityFollowUpReadCapture: undefined },
      { opportunityFollowUpReadCapture: 'unvalidated' },
      { commercialIntakePermissionSetVersion: 'v99' },
      { commercialIntakePermissionAssignmentId: null },
      {
        opportunityFollowUpPermissions: [
          'commercial.opportunity.follow_up.read',
          'unknown',
        ],
      },
    ])
      expect(
        opportunityFollowUpCapturedAuthority(
          { ...company, ...change },
          { manage: false },
        ),
      ).toBeUndefined();
  });

  it('binds every consumed identity while remaining deterministic across row ordering', () => {
    const input = {
      ...captureInput,
      contextIdentities: [
        ...captureInput.contextIdentities,
        ['company.manage', '70000000-0000-4000-8000-000000000001', null],
      ],
    };
    const token = opportunityFollowUpReadCapture(input);
    expect(token).toMatch(/^opportunity-follow-up-read\.v1\.[a-f0-9]{64}$/u);
    expect(
      opportunityFollowUpReadCapture({
        ...input,
        contextIdentities: [...input.contextIdentities].reverse(),
      }),
    ).toBe(token);
    for (const change of [
      { workspaceId: contextId },
      { workspaceMembershipId: contextId },
      { companyId: contextId },
      { assignmentId: contextId },
      { nativeAssignmentId: contextId },
      { nativePermissionSetVersion: 'v3' },
      { contextIdentities: [['company_context_access', assignmentId, null]] },
      { contextIdentities: [['company.manage', assignmentId, null]] },
    ])
      expect(opportunityFollowUpReadCapture({ ...input, ...change })).not.toBe(
        token,
      );
  });
});
