import type { ActorContext } from '../access-types';
import {
  defaultTeamTaskFilters,
  type TeamTaskFilters,
} from './team-tasks-response';
import type { TaskDiscoveryRow } from './task-discovery-response';
export function teamTasksQueryFixture() {
  const id = (suffix: string) =>
    `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
  const company = { id: id('1'), displayName: 'Team Company DEMO' };
  const actor: ActorContext = {
    internalUserId: id('2'),
    workspaceId: id('3'),
    workspaceMembershipId: id('4'),
    workspaceName: 'Team Workspace DEMO',
    displayName: 'Ada',
    email: 'ada@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      ...company,
      clientPermissions: ['client.read'],
      clientPermissionAssignmentId: id('5'),
      clientPermissionSetVersion: 'v1',
      projectPermissions: ['project.read'],
      projectPermissionAssignmentId: id('6'),
      projectPermissionSetVersion: 'v2',
      taskPermissions: ['task.read', 'task.manage'],
      taskPermissionAssignmentId: id('7'),
      taskPermissionSetVersion: 'v1',
    },
  };
  const task: TaskDiscoveryRow = {
    id: id('8'),
    companyId: company.id,
    projectId: id('9'),
    clientAccountId: id('10'),
    title: 'Exact team work DEMO',
    status: 'todo',
    completion: null,
    priority: 'normal',
    assignee: { workspaceMembershipId: id('11'), displayLabel: 'Ștefan DEMO' },
    dueDate: '2099-11-02',
    version: 1,
    createdAt: '2026-10-28T00:00:00.000Z',
    updatedAt: '2026-10-28T00:00:00.000Z',
    createdBy: {
      internalUserId: actor.internalUserId,
      workspaceMembershipId: actor.workspaceMembershipId,
      displayName: actor.displayName,
    },
    project: {
      id: id('9'),
      title: 'Team mission DEMO',
      clientDisplayName: 'Original Client DEMO',
    },
  };
  const page = {
    companyId: company.id,
    offset: 0,
    pageSize: 25,
    hasNextPage: false,
    appliedFilters: { ...defaultTeamTaskFilters } satisfies TeamTaskFilters,
    tasks: [task],
  };
  return { id, company, actor, task, page };
}
