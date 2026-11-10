import { expectTypeOf, it } from 'vitest';
import type {
  InternalUserId,
  WorkspaceId,
  WorkspaceMembershipId,
} from './access.types.js';
import {
  parseWorkspaceId,
  parseWorkspaceMembershipId,
} from './access-identifiers.js';
import type { WorkspaceMembershipSuspensionService } from './workspace-membership-suspension.service.js';
import type { WorkspaceMembershipSuspensionTarget } from './workspace-membership-suspension.types.js';
import type { WorkspaceSessionRevocationService } from './workspace-session-revocation.service.js';

type RevocationMembership = Parameters<
  WorkspaceSessionRevocationService['afterSuspension']
>[1];
type SuspensionRecord = Awaited<
  ReturnType<WorkspaceMembershipSuspensionService['suspend']>
>;

it('distinguishes the Membership and Workspace in a suspension target', () => {
  expectTypeOf<InternalUserId>().not.toMatchTypeOf<
    WorkspaceMembershipSuspensionTarget['workspaceMembershipId']
  >();
  expectTypeOf<WorkspaceId>().not.toMatchTypeOf<
    WorkspaceMembershipSuspensionTarget['workspaceMembershipId']
  >();
  expectTypeOf<WorkspaceMembershipId>().not.toMatchTypeOf<
    WorkspaceMembershipSuspensionTarget['workspaceId']
  >();
  expectTypeOf({
    workspaceId: parseWorkspaceId('22222222-2222-4222-8222-222222222222'),
    workspaceMembershipId: parseWorkspaceMembershipId(
      '11111111-1111-4111-8111-111111111111',
    ),
  }).toMatchTypeOf<WorkspaceMembershipSuspensionTarget>();
});

it('requires a Membership identifier at the after-commit revocation interface', () => {
  expectTypeOf<RevocationMembership>().toEqualTypeOf<WorkspaceMembershipId>();
  expectTypeOf<InternalUserId>().not.toMatchTypeOf<RevocationMembership>();
  expectTypeOf<WorkspaceId>().not.toMatchTypeOf<RevocationMembership>();
  expectTypeOf(
    parseWorkspaceMembershipId('11111111-1111-4111-8111-111111111111'),
  ).toMatchTypeOf<RevocationMembership>();
});

it('carries the Membership category from the suspension receipt to revocation', () => {
  expectTypeOf<
    SuspensionRecord['workspaceMembershipId']
  >().toEqualTypeOf<RevocationMembership>();
  expectTypeOf<InternalUserId>().not.toMatchTypeOf<
    SuspensionRecord['workspaceMembershipId']
  >();
  expectTypeOf<WorkspaceId>().not.toMatchTypeOf<
    SuspensionRecord['workspaceMembershipId']
  >();
});
