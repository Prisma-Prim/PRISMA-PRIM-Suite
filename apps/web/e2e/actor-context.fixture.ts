import type { ActorContext } from '../src/access-types';
import type { ProjectResponsibility } from '../src/project/project-responsible-response';
import type { ProjectLifecycle } from '../src/project/project-lifecycle-response';

/** The responsible-member read of a Project nobody was ever named for. */
export const unassignedResponsibility = {
  responsible: null,
  revision: 0,
  lastChange: null,
  mutable: true,
} satisfies ProjectResponsibility;

/** The lifecycle read of a Project no transition has left preparatory. */
export const preparatoryLifecycle = {
  status: 'preparatory',
  lifecycleRevision: 0,
  mutable: true,
  start: null,
  transitions: [],
} satisfies ProjectLifecycle;

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
