import { expect, it } from 'vitest';
import { assertMessageCoverage } from '../localization/messages';
import { companyAssignmentMessages } from './company-assignment-localization.copy';
import { companyContextAccessCopy } from './company-context-access.copy';

it('provides every required Company assignment display key in all four languages', () => {
  expect(() =>
    assertMessageCoverage('companyAssignment', companyAssignmentMessages),
  ).not.toThrow();
});

it('declares both follow-up administration keys and provides their English base messages', () => {
  expect(companyAssignmentMessages.keys).toContain(
    'opportunityFollowUpCoordinatorBundle',
  );
  expect(companyAssignmentMessages.keys).toContain(
    'opportunityFollowUpCoordinatorPrerequisites',
  );
  expect(companyContextAccessCopy).toMatchObject({
    opportunityFollowUpCoordinatorBundle:
      'Company Opportunity Follow-up Coordinator',
    opportunityFollowUpCoordinatorPrerequisites:
      'Allows reading and managing the manual follow-up date. Company context and Request/Opportunity read remain separate; changes also require next-action update authority. Grants no Client or assignment-administration access.',
  });
});
