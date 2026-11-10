import { expectTypeOf, it } from 'vitest';
import type { CompanyAssignmentTarget } from './company-context-assignment.types.js';
import {
  parseCompanyId,
  parseInternalUserId,
  parseWorkspaceId,
  parseWorkspaceMembershipId,
} from './access-identifiers.js';

it('keeps Company and Membership identifiers distinct in an assignment target', () => {
  expectTypeOf<CompanyAssignmentTarget['companyId']>().not.toMatchTypeOf<
    CompanyAssignmentTarget['workspaceMembershipId']
  >();
  expectTypeOf<
    CompanyAssignmentTarget['workspaceMembershipId']
  >().not.toMatchTypeOf<CompanyAssignmentTarget['companyId']>();
  expectTypeOf<CompanyAssignmentTarget['workspaceId']>().not.toMatchTypeOf<
    CompanyAssignmentTarget['workspaceMembershipId']
  >();
  expectTypeOf<
    CompanyAssignmentTarget['workspaceMembershipId']
  >().not.toMatchTypeOf<CompanyAssignmentTarget['workspaceId']>();
  expectTypeOf(
    parseInternalUserId('11111111-1111-4111-8111-111111111111'),
  ).not.toMatchTypeOf<CompanyAssignmentTarget['workspaceMembershipId']>();
  expectTypeOf({
    workspaceId: parseWorkspaceId('11111111-1111-4111-8111-111111111111'),
    workspaceMembershipId: parseWorkspaceMembershipId(
      '22222222-2222-4222-8222-222222222222',
    ),
    companyId: parseCompanyId('33333333-3333-4333-8333-333333333333'),
  }).toMatchTypeOf<CompanyAssignmentTarget>();
  expectTypeOf<{
    workspaceId: CompanyAssignmentTarget['workspaceId'];
    workspaceMembershipId: CompanyAssignmentTarget['companyId'];
    companyId: CompanyAssignmentTarget['workspaceMembershipId'];
  }>().not.toMatchTypeOf<CompanyAssignmentTarget>();
});
