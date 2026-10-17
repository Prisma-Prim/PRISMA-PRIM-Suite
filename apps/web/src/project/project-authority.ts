import type { ActorContext } from '../access-types';

/** Existing Project children retain every authority except the independent Template grant. */
export function companyAuthorityWithoutProjectTemplate(
  company: ActorContext['activeCompany'],
):
  | Omit<
      NonNullable<ActorContext['activeCompany']>,
      | 'projectTemplatePermissions'
      | 'projectTemplatePermissionAssignmentId'
      | 'projectTemplatePermissionSetVersion'
    >
  | undefined {
  if (!company) return;
  const authority = { ...company };
  delete authority.projectTemplatePermissions;
  delete authority.projectTemplatePermissionAssignmentId;
  delete authority.projectTemplatePermissionSetVersion;
  return authority;
}
