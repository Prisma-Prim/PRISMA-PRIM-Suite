import type { ActorContext } from '../access-types';

/** Existing Project children retain every authority except the independent Template and stage grants. */
export function companyAuthorityWithoutProjectTemplate(
  company: ActorContext['activeCompany'],
):
  | Omit<
      NonNullable<ActorContext['activeCompany']>,
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
