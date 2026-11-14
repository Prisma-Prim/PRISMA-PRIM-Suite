import type { ActorContext } from '../access-types';
import {
  companyGrants,
  type CompanyGrantRequest,
} from '../access/company-grants.test-fixture';
export const configRequest = {
  bundle: 'company_mission_plan_configuration',
  version: 'v1',
  assignmentId: '40000000-0000-4000-8000-000000000920',
} as const satisfies CompanyGrantRequest;
export const userRequest = {
  bundle: 'company_mission_plan_user',
  version: 'v1',
  assignmentId: '40000000-0000-4000-8000-000000000921',
} as const satisfies CompanyGrantRequest;
export const [configGrant, userGrant] = companyGrants(
  configRequest,
  userRequest,
);
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
    // No native Project, Task or Client assignment: their grants carry
    // non-native assignment ids that no native check accepts.
    grants: companyGrants(
      configRequest,
      userRequest,
      {
        bundle: 'company_project_access',
        version: 'v1',
        assignmentId: 'synthetic-project-access',
      },
      {
        bundle: 'company_task_manager',
        version: 'v1',
        assignmentId: 'synthetic-task-manager',
      },
      {
        bundle: 'company_director_client_access',
        version: 'v1',
        assignmentId: 'synthetic-client-access',
      },
    ),
    clientPermissions: ['client.read'],
    projectPermissions: ['project.read', 'project.create'],
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
