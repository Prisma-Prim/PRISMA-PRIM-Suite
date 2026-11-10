import { expectTypeOf, it } from 'vitest';
import type { InternalUserId } from './access.types.js';
import type {
  MemberAuthority,
  readMemberAuthority,
} from './member-authority.js';
import {
  parseCompanyId,
  parseWorkspaceId,
  parseWorkspaceMembershipId,
} from './access-identifiers.js';

type Selection = Parameters<typeof readMemberAuthority>[1];

it('rejects identifier-category swaps at the shared member eligibility interface', () => {
  expectTypeOf<Selection['companyId']>().not.toMatchTypeOf<
    Selection['membershipId']
  >();
  expectTypeOf<Selection['membershipId']>().not.toMatchTypeOf<
    Selection['companyId']
  >();
  expectTypeOf<Selection['workspaceId']>().not.toMatchTypeOf<
    Selection['membershipId']
  >();
  expectTypeOf<Selection['membershipId']>().not.toMatchTypeOf<
    Selection['workspaceId']
  >();
  expectTypeOf<Selection['workspaceId']>().not.toMatchTypeOf<
    Selection['companyId']
  >();
  expectTypeOf<InternalUserId>().not.toMatchTypeOf<Selection['membershipId']>();
  expectTypeOf({
    workspaceId: parseWorkspaceId('11111111-1111-4111-8111-111111111111'),
    companyId: parseCompanyId('22222222-2222-4222-8222-222222222222'),
    membershipId: parseWorkspaceMembershipId(
      '33333333-3333-4333-8333-333333333333',
    ),
    lock: true,
  }).toMatchTypeOf<Selection>();
  expectTypeOf<{
    workspaceId: Selection['workspaceId'];
    companyId: Selection['membershipId'];
    membershipId: Selection['companyId'];
    lock: boolean;
  }>().not.toMatchTypeOf<Selection>();
});

it('returns an Internal User identifier distinct from a Membership identifier', () => {
  expectTypeOf<
    MemberAuthority['internalUserId']
  >().toEqualTypeOf<InternalUserId>();
  expectTypeOf<MemberAuthority['internalUserId']>().not.toMatchTypeOf<
    Selection['membershipId']
  >();
});
