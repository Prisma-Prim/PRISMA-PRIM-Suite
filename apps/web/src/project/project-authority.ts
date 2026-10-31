import type { ActorContext } from '../access-types';

/** Existing Project children retain every authority except the independent Template and stage grants. */
export function companyAuthorityWithoutProjectTemplate(
  company: ActorContext['activeCompany'],
):
  | Omit<
      NonNullable<ActorContext['activeCompany']>,
      | 'missionApplicabilityProposalPermissions'
      | 'missionApplicabilityCoordinatorAssignmentId'
      | 'missionApplicabilityCoordinatorPermissionSetVersion'
      | 'missionApplicabilityDecisionPermissions'
      | 'missionApplicabilityApproverAssignmentId'
      | 'missionApplicabilityApproverPermissionSetVersion'
      | 'missionPlanGrants'
      | 'missionResultReviewPermissions'
      | 'missionResultReviewerAssignmentId'
      | 'missionResultReviewerPermissionSetVersion'
      | 'projectStagePermissions'
      | 'projectStagePermissionAssignmentId'
      | 'projectStagePermissionSetVersion'
      | 'projectTemplateConfigurationPermissions'
      | 'projectTemplateConfigurationPermissionAssignmentId'
      | 'projectTemplateConfigurationPermissionSetVersion'
      | 'projectTemplatePermissions'
      | 'projectTemplatePermissionAssignmentId'
      | 'projectTemplatePermissionSetVersion'
    >
  | undefined {
  if (!company) return;
  const authority = { ...company };
  delete authority.missionApplicabilityProposalPermissions;
  delete authority.missionApplicabilityCoordinatorAssignmentId;
  delete authority.missionApplicabilityCoordinatorPermissionSetVersion;
  delete authority.missionApplicabilityDecisionPermissions;
  delete authority.missionApplicabilityApproverAssignmentId;
  delete authority.missionApplicabilityApproverPermissionSetVersion;
  delete authority.missionPlanGrants;
  delete authority.missionResultReviewPermissions;
  delete authority.missionResultReviewerAssignmentId;
  delete authority.missionResultReviewerPermissionSetVersion;
  delete authority.projectStagePermissions;
  delete authority.projectStagePermissionAssignmentId;
  delete authority.projectStagePermissionSetVersion;
  delete authority.projectTemplateConfigurationPermissions;
  delete authority.projectTemplateConfigurationPermissionAssignmentId;
  delete authority.projectTemplateConfigurationPermissionSetVersion;
  delete authority.projectTemplatePermissions;
  delete authority.projectTemplatePermissionAssignmentId;
  delete authority.projectTemplatePermissionSetVersion;
  return authority;
}

/** Match the Client owner: Workspace management or the exact Company read capture. */
export function clientReadAuthority(actor: ActorContext) {
  if (actor.workspacePermissions.includes('client.manage'))
    return { workspaceClientManage: true };
  const company = actor.activeCompany;
  return {
    clientRead: company?.clientPermissions?.includes('client.read'),
    clientPermissionAssignmentId: company?.clientPermissionAssignmentId,
    clientPermissionSetVersion: company?.clientPermissionSetVersion,
  };
}

/** Task work consumes Project/Task/original-Client authority, independently of evidence or review grants. */
export function projectTaskCompanyAuthority(actor: ActorContext) {
  const company = actor.activeCompany;
  if (!company) return;
  return {
    id: company.id,
    projectPermissions: company.projectPermissions,
    projectPermissionAssignmentId: company.projectPermissionAssignmentId,
    projectPermissionSetVersion: company.projectPermissionSetVersion,
    taskPermissions: company.taskPermissions,
    taskPermissionAssignmentId: company.taskPermissionAssignmentId,
    taskPermissionSetVersion: company.taskPermissionSetVersion,
    clientRead: clientReadAuthority(actor),
  };
}

/** Native result intent consumes its exact evidence and recorder captures only. */
export function taskResultAuthority(actor: ActorContext) {
  const c = actor.activeCompany;
  return {
    projectTask: projectTaskCompanyAuthority(actor),
    documentRead: c?.documentPermissions?.includes('document.read'),
    documentPermissionAssignmentId: c?.documentPermissionAssignmentId,
    documentPermissionSetVersion: c?.documentPermissionSetVersion,
    contentRead: c?.documentPermissions?.includes('document.content.read'),
    documentContentReaderAssignmentId: c?.documentContentReaderAssignmentId,
    documentContentReaderPermissionSetVersion:
      c?.documentContentReaderPermissionSetVersion,
    missionAccess: c?.documentPermissions?.includes(
      'document.mission_deliverable.access',
    ),
    missionDeliverableAccessAssignmentId:
      c?.missionDeliverableAccessAssignmentId,
    missionDeliverableAccessPermissionSetVersion:
      c?.missionDeliverableAccessPermissionSetVersion,
    record: c?.taskResultPermissions?.includes('task.result.record'),
    taskResultRecorderAssignmentId: c?.taskResultRecorderAssignmentId,
    taskResultRecorderPermissionSetVersion:
      c?.taskResultRecorderPermissionSetVersion,
  };
}
