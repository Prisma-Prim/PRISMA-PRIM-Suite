import { vi } from 'vitest';
import { expectedPilotActivities } from '../project/project-pilot-plan.test-fixtures';
import { preparatoryLifecycle } from '../project/project-lifecycle.test-fixtures';
export const companyId = '10000000-0000-4000-8000-000000000001',
  projectId = '30000000-0000-4000-8000-000000000001',
  clientId = '20000000-0000-4000-8000-000000000001';
export const project = {
  id: projectId,
  companyId,
  clientAccountId: clientId,
  clientDisplayName: 'Applicability Client DEMO',
  title: 'Exact applicability Project DEMO',
  status: 'preparatory',
  createdAt: '2026-10-29T00:00:00.000Z',
};
export const plan = {
  templateKey: 'CONSULTING_MISSION_PILOT_ILLUSTRATIVE',
  version: 1,
  title: 'Plan pilot pentru o misiune de consultanță SMI',
  illustrative: true,
  activities: expectedPilotActivities.map((activity, index) => ({
    ...activity,
    taskId: `40000000-0000-4000-8000-0000000000${String(index + 1).padStart(2, '0')}`,
  })),
};
export const actor = {
  internalUserId: 'user-demo',
  workspaceMembershipId: 'member-demo',
  workspaceId: 'workspace-demo',
  workspaceName: 'Workspace DEMO',
  displayName: 'Coordinator DEMO',
  email: 'coordinator@example.test',
  active: true,
  workspacePermissions: ['client.manage'],
  activeCompany: {
    id: companyId,
    displayName: 'Company DEMO',
    clientPermissions: [],
    projectPermissions: ['project.read', 'project.create'],
    projectPermissionAssignmentId: 'project-grant',
    projectPermissionSetVersion: 'v2',
    taskPermissions: ['task.read', 'task.manage'],
    taskPermissionAssignmentId: 'task-grant',
    taskPermissionSetVersion: 'v1',
    projectTemplatePermissions: [
      'project.template.read',
      'project.template.instantiate',
      'project.template.pilot.read',
      'project.template.pilot.instantiate',
    ],
    projectTemplatePermissionAssignmentId: 'template-grant',
    projectTemplatePermissionSetVersion: 'v2',
    documentPermissions: [
      'document.read',
      'document.content.read',
      'document.mission_deliverable.access',
    ],
    documentPermissionAssignmentId: 'registrar-grant',
    documentPermissionSetVersion: 'v3',
    documentContentReaderAssignmentId: 'content-grant',
    documentContentReaderPermissionSetVersion: 'v1',
    missionDeliverableAccessAssignmentId: 'mission-grant',
    missionDeliverableAccessPermissionSetVersion: 'v1',
    missionApplicabilityProposalPermissions: [
      'project.mission_applicability.propose',
    ],
    missionApplicabilityCoordinatorAssignmentId: 'coordinator-grant',
    missionApplicabilityCoordinatorPermissionSetVersion: 'v1',
    missionApplicabilityDecisionPermissions: [
      'project.mission_applicability.decide',
      'project.mission_applicability.restore',
    ],
    missionApplicabilityApproverAssignmentId: 'approver-grant',
    missionApplicabilityApproverPermissionSetVersion: 'v1',
  },
};
export function snapshot() {
  return {
    applicability: {
      kind: 'available',
      project: { ...project, lifecycleRevision: 0 },
      source: { templateKey: plan.templateKey, version: 1, title: plan.title },
      lifecycleRevision: 0,
      revision: 0,
      mutable: true,
      clarification: {
        state: 'BUSINESS_CLARIFICATION_PENDING',
        questionId: 'MISSION-CLOSE-01',
      },
      activities: plan.activities.map((row) => ({
        ...row,
        task: { id: row.taskId, title: row.title, status: 'todo', version: 1 },
        result: { kind: 'available', current: null },
        applicability: 'REQUIRED',
        pendingProposal: null,
        lastProposal: null,
        lastDecision: null,
        lastRestoration: null,
        activeApproval: null,
      })),
    },
  };
}
export function installParentServer(
  readActor: () => unknown,
  override: (
    path: string,
    init: RequestInit | undefined,
  ) => Promise<Response | undefined>,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(input.toString(), window.location.origin).pathname,
        overridden = await override(path, init);
      if (overridden) return overridden;
      if (path === '/api/access/current-actor')
        return Response.json(readActor());
      if (path === '/api/companies')
        return Response.json([{ id: companyId, displayName: 'Company DEMO' }]);
      if (path === '/api/activity-log') return Response.json({ events: [] });
      if (path === '/api/operational-home')
        return Response.json({ companyId, today: '2026-10-29', summaries: [] });
      if (path === '/api/clients')
        return Response.json([
          { id: clientId, displayName: project.clientDisplayName },
        ]);
      if (path === '/api/projects') return Response.json([project]);
      if (path === `/api/projects/${projectId}`) return Response.json(project);
      if (path.endsWith('/lifecycle'))
        return Response.json(preparatoryLifecycle);
      if (path.endsWith('/template')) return Response.json({ template: plan });
      if (path === '/api/project-templates')
        return Response.json({
          templates: [],
          headVersion: 0,
          nextBeforeVersion: null,
        });
      if (path.endsWith('/tasks'))
        return Response.json({ mutable: true, tasks: [] });
      if (path.endsWith('/eligible-task-assignees'))
        return Response.json({ members: [] });
      if (path.endsWith('/mission-result-reviews'))
        return Response.json({ review: null });
      if (path.endsWith('/mission-readiness'))
        return Response.json({ assessment: null });
      if (path.endsWith('/mission-applicability/history'))
        return Response.json({
          history: {
            kind: 'available',
            facts: [],
            hasMore: false,
            nextBeforeRevision: null,
          },
        });
      if (path.endsWith('/mission-applicability'))
        return Response.json(snapshot());
      return new Response(null, { status: 404 });
    }),
  );
}
