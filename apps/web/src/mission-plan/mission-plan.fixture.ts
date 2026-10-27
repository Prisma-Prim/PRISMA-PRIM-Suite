import type { ActorContext } from '../access-types';
export const configGrant = {
  bundle: 'company_mission_plan_configuration',
  assignmentId: '40000000-0000-4000-8000-000000000920',
  permissionSetVersion: 'v1',
  permissions: ['project.mission_plan.read', 'project.mission_plan.publish'],
};
export const userGrant = {
  bundle: 'company_mission_plan_user',
  assignmentId: '40000000-0000-4000-8000-000000000921',
  permissionSetVersion: 'v1',
  permissions: [
    'project.mission_plan.read',
    'project.mission_plan.instantiate',
  ],
};
export const actor: ActorContext = {
  internalUserId: '20000000-0000-4000-8000-000000000920',
  workspaceMembershipId: '30000000-0000-4000-8000-000000000920',
  workspaceId: '00000000-0000-4000-8000-000000000920',
  workspaceName: 'Synthetic Workspace',
  displayName: 'Synthetic configurator',
  email: 'synthetic@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: '10000000-0000-4000-8000-000000000920',
    displayName: 'Synthetic Company',
    missionPlanGrants: [configGrant, userGrant],
    clientPermissions: ['client.read'],
    projectPermissions: ['project.read', 'project.create'],
    taskPermissions: ['task.read', 'task.manage'],
  },
};
export const scope = {
  workspaceId: actor.workspaceId,
  companyId: '10000000-0000-4000-8000-000000000920',
};
export const source = {
  ...scope,
  id: '60000000-0000-4000-8000-000000000920',
  planId: '50000000-0000-4000-8000-000000000920',
  versionNumber: 1,
  title: 'Synthetic reusable plan',
  activityCount: 1,
  publishedAt: '2026-10-27T12:00:00.000Z',
  actor: {
    membershipId: actor.workspaceMembershipId,
    displayName: actor.displayName,
  },
  activities: [
    {
      key: '70000000-0000-4000-8000-000000000920',
      title: 'Synthetic first Task',
      activity: ' Literal action\n🌍 ',
      intendedResult: ' Literal expected result ',
    },
  ],
};
export const cataloguePage = {
  items: [
    {
      ...scope,
      planId: source.planId,
      createdAt: '2026-10-27T12:00:00.000000Z',
      head: source,
    },
  ],
};
