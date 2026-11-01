import type { ActorContext } from './current-actor';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const READ_CAPTURE = /^opportunity-follow-up-read\.v1\.[a-f0-9]{64}$/u;

export interface OpportunityFollowUpAuthority {
  key: string;
  companyId: string;
  canManage: boolean;
  readCapture: string;
}

/** Feature-local compatibility checks retire only this owner's authority. */
export function opportunityFollowUpAuthority(
  actor: ActorContext,
): OpportunityFollowUpAuthority | undefined {
  const company = actor.activeCompany;
  if (!actor.active || !company) return undefined;
  const assignmentId = company.opportunityFollowUpCoordinatorAssignmentId;
  const nativeAssignmentId = company.commercialIntakePermissionAssignmentId;
  const nativeVersion = company.commercialIntakePermissionSetVersion;
  const permissions = company.opportunityFollowUpPermissions;
  const readCapture = company.opportunityFollowUpReadCapture;
  if (
    typeof assignmentId !== 'string' ||
    !UUID.test(assignmentId) ||
    company.opportunityFollowUpCoordinatorPermissionSetVersion !== 'v1' ||
    typeof nativeAssignmentId !== 'string' ||
    !UUID.test(nativeAssignmentId) ||
    !['v1', 'v2', 'v3', 'v4'].some((version) => version === nativeVersion) ||
    typeof readCapture !== 'string' ||
    !READ_CAPTURE.test(readCapture) ||
    !Array.isArray(permissions) ||
    permissions.some(
      (permission: unknown) =>
        permission !== 'commercial.opportunity.follow_up.read' &&
        permission !== 'commercial.opportunity.follow_up.manage',
    ) ||
    !permissions.includes('commercial.opportunity.follow_up.read') ||
    !company.commercialIntakePermissions?.includes('commercial.request.read') ||
    !company.commercialIntakePermissions.includes('commercial.opportunity.read')
  )
    return undefined;
  return {
    companyId: company.id,
    readCapture,
    canManage:
      permissions.includes('commercial.opportunity.follow_up.manage') &&
      nativeVersion !== 'v1' &&
      company.commercialIntakePermissions.includes(
        'commercial.opportunity.next_action.update',
      ),
    key: JSON.stringify([
      actor.internalUserId,
      actor.workspaceId,
      actor.workspaceMembershipId,
      company.id,
      assignmentId,
      'v1',
      nativeAssignmentId,
      nativeVersion,
      readCapture,
      permissions,
      company.commercialIntakePermissions,
    ]),
  };
}
