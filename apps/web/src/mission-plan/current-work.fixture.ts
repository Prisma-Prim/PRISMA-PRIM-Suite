import type { ActorContext } from '../access-types';
import { companyGrants } from '../access/company-grants.test-fixture';
import { configRequest, userRequest } from './mission-plan.fixture';
export const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const company = { id: id(1), displayName: 'Current Company DEMO' },
  otherCompany = { id: id(2), displayName: 'Other Company DEMO' };
export const project = {
  id: id(3),
  companyId: company.id,
  clientAccountId: id(4),
  clientDisplayName: 'Current Client DEMO',
  title: 'Current Project DEMO',
  status: 'preparatory',
  createdAt: '2026-10-28T08:00:00.000Z',
};
export function currentActor(companyId = company.id): ActorContext {
  return {
    internalUserId: id(8),
    workspaceMembershipId: id(9),
    workspaceId: id(10),
    workspaceName: 'Current Workspace',
    displayName: 'Ada DEMO',
    email: 'ada@example.test',
    active: true,
    workspacePermissions: ['client.manage', 'company.assignment.manage'],
    activeCompany: {
      ...(companyId === company.id ? company : otherCompany),
      grants: companyGrants(
        {
          bundle: 'company_director_client_access',
          version: 'v2',
          assignmentId: id(11),
        },
        { bundle: 'company_task_manager', version: 'v1', assignmentId: id(13) },
        {
          bundle: 'company_document_registrar',
          version: 'v3',
          assignmentId: id(14),
        },
        {
          bundle: 'company_project_access',
          version: 'v2',
          assignmentId: id(12),
        },
        {
          bundle: 'company_document_content_reader',
          version: 'v1',
          assignmentId: id(15),
        },
        {
          bundle: 'company_task_result_recorder',
          version: 'v1',
          assignmentId: id(17),
        },
        {
          bundle: 'company_mission_deliverable_access',
          version: 'v1',
          assignmentId: id(16),
        },
        configRequest,
        userRequest,
      ),
      clientPermissions: ['client.read'],
      clientPermissionAssignmentId: id(11),
      clientPermissionSetVersion: 'v2',
      projectPermissions: ['project.read', 'project.create'],
      projectPermissionAssignmentId: id(12),
      projectPermissionSetVersion: 'v2',
      documentPermissions: [
        'document.read',
        'document.reference.read',
        'document.content.read',
        'document.mission_deliverable.access',
      ],
      documentPermissionAssignmentId: id(14),
      documentPermissionSetVersion: 'v3',
      documentContentReaderAssignmentId: id(15),
      documentContentReaderPermissionSetVersion: 'v1',
      missionDeliverableAccessAssignmentId: id(16),
      missionDeliverableAccessPermissionSetVersion: 'v1',
    },
  };
}
export function currentOverview(count = 26) {
  const actor = currentActor(),
    activities = Array.from({ length: count }, (_, i) => ({
      key: id(100 + i),
      title: `Initial activity ${i + 1}`,
      activity: ` Preserved action ${i + 1}\nЖ / é `,
      intendedResult: ` Preserved intended result ${i + 1}\n🌍 `,
    }));
  const tasks = activities.map((a, position) => ({
    activityKey: a.key,
    position,
    taskId: id(200 + position),
  }));
  const attribution = {
    internalUserId: actor.internalUserId,
    workspaceMembershipId: actor.workspaceMembershipId,
    displayName: actor.displayName,
  };
  const rows = tasks.map((m, i) => ({
    activityKey: m.activityKey,
    position: i,
    task: {
      description: null,
      id: m.taskId,
      companyId: company.id,
      projectId: project.id,
      clientAccountId: project.clientAccountId,
      title: `Current Task ${i + 1}`,
      version: 2,
      status: 'blocked',
      completion: null,
      assignee: {
        workspaceMembershipId: actor.workspaceMembershipId,
        displayLabel: 'Responsible literal Ana',
      },
      dueDate: '2026-11-07',
      priority: 'critical',
      createdAt: project.createdAt,
      updatedAt: project.createdAt,
      createdBy: attribution,
      blockage: {
        reason: `Current blockage ${i + 1} Ж / é`,
        actor: attribution,
        occurredAt: project.createdAt,
      },
    },
    result: {
      kind: 'available',
      current: {
        id: id(300 + i),
        revision: 1,
        kind: 'recorded',
        declaration: `Current declaration ${i + 1} Ж / é`,
        actor: attribution,
        occurredAt: project.createdAt,
        reference: {
          documentId: id(400 + i),
          versionId: id(500 + i),
          representationId: id(600 + i),
          versionNumber: 1,
          title: 'Frozen exact title DEMO',
          status: 'superseded',
        },
      },
    },
  }));
  return {
    overview: {
      workspaceId: actor.workspaceId,
      companyId: company.id,
      project: {
        id: project.id,
        clientAccountId: project.clientAccountId,
        status: project.status,
      },
      plan: {
        projectId: project.id,
        version: {
          id: id(20),
          planId: id(21),
          workspaceId: actor.workspaceId,
          companyId: company.id,
          versionNumber: 1,
          title: 'Preserved source DEMO',
          activityCount: count,
          publishedAt: project.createdAt,
          actor: {
            membershipId: actor.workspaceMembershipId,
            displayName: actor.displayName,
          },
          activities,
        },
        tasks,
      },
      activities: rows,
    },
  };
}
