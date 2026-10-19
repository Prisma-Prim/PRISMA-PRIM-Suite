import { expect, it } from 'vitest';
import { assertMessageCoverage } from '../localization/messages';
import { companyAssignmentMessages } from './company-assignment-localization.copy';

it('provides every required Company assignment display key in all four languages', () => {
  expect(() =>
    assertMessageCoverage('companyAssignment', companyAssignmentMessages),
  ).not.toThrow();
});
