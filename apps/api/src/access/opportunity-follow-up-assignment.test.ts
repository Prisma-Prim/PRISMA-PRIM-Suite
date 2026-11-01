import { describe, expect, it } from 'vitest';
import { assignmentRecord } from './company-context-assignment-record.js';
import {
  COMPANY_ROLE_BUNDLES,
  opportunityFollowUpPermissionsFor,
} from './company-permissions.js';

describe('Opportunity follow-up coordinator capture', () => {
  it('captures exactly the independent v1 permissions without widening an older bundle', () => {
    expect(opportunityFollowUpPermissionsFor('v1')).toEqual([
      'commercial.opportunity.follow_up.read',
      'commercial.opportunity.follow_up.manage',
    ]);
    for (const version of [null, undefined, 'v0', 'v2', 'v99'])
      expect(opportunityFollowUpPermissionsFor(version)).toEqual([]);
    for (const [bundle, definition] of Object.entries(COMPANY_ROLE_BUNDLES)) {
      if (bundle === 'company_opportunity_follow_up_coordinator') continue;
      for (const permissions of Object.values(definition.versions))
        expect(
          permissions.some((permission: string) =>
            permission.startsWith('commercial.opportunity.follow_up.'),
          ),
        ).toBe(false);
    }
  });

  it('conserves explicit coordinator v1 in administration and refuses unknown captures', () => {
    const assignment = {
      id: '10000000-0000-4000-8000-000000000001',
      companyId: '20000000-0000-4000-8000-000000000001',
      workspaceMembershipId: '30000000-0000-4000-8000-000000000001',
      bundle: 'company_opportunity_follow_up_coordinator',
      permissionSetVersion: 'v1',
    };
    expect(assignmentRecord(assignment, true)).toEqual({
      ...assignment,
      bundle: 'Company Opportunity Follow-up Coordinator',
      active: true,
    });
    for (const permissionSetVersion of [null, undefined, 'v2'])
      expect(() =>
        assignmentRecord({ ...assignment, permissionSetVersion }, true),
      ).toThrow('Invalid Company assignment version.');
  });
});
