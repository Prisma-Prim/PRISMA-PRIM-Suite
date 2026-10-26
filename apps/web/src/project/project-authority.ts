import type { ActorContext } from '../access-types';

/** Existing Project children retain every authority except the independent Template and stage grants. */
export function companyAuthorityWithoutProjectTemplate(
  company: ActorContext['activeCompany'],
):
  | Omit<
      NonNullable<ActorContext['activeCompany']>,
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

/** Task work consumes Project/Task/original-Client authority, independently of evidence or review grants. */
export function projectTaskCompanyAuthority(
  company: ActorContext['activeCompany'],
) {
  if (!company) return;
  return {
    id: company.id,
    projectPermissions: company.projectPermissions,
    projectPermissionAssignmentId: company.projectPermissionAssignmentId,
    projectPermissionSetVersion: company.projectPermissionSetVersion,
    taskPermissions: company.taskPermissions,
    taskPermissionAssignmentId: company.taskPermissionAssignmentId,
    taskPermissionSetVersion: company.taskPermissionSetVersion,
    clientPermissions: company.clientPermissions,
    clientPermissionAssignmentId: company.clientPermissionAssignmentId,
    clientPermissionSetVersion: company.clientPermissionSetVersion,
  };
}
