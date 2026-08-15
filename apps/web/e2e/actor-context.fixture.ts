import type { ActorContext } from '../src/access-types';

export const actorContextFixture = {
  internalUserId: '00000000-0000-4000-8000-000000000001',
  workspaceMembershipId: '00000000-0000-4000-8000-000000000002',
  workspaceId: '00000000-0000-4000-8000-000000000003',
  workspaceName: 'PRISMA Workspace',
  displayName: 'Ada Ionescu',
  email: 'ada@example.test',
  active: true,
  workspacePermissions: ['company.manage'],
} satisfies ActorContext;
