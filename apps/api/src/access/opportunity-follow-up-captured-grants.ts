import { createHash } from 'node:crypto';
import {
  commercialIntakePermissionsFor,
  isCommercialIntakePermissionSetVersion,
  type CompanyCommercialIntakePermission,
  type CompanyCommercialIntakePermissionSetVersion,
  type OpportunityFollowUpPermission,
} from './company-permissions.js';

export interface OpportunityFollowUpActorProjection {
  opportunityFollowUpPermissions?: OpportunityFollowUpPermission[];
  opportunityFollowUpCoordinatorAssignmentId?: string;
  opportunityFollowUpCoordinatorPermissionSetVersion?: 'v1';
  opportunityFollowUpReadCapture?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const READ_CAPTURE = /^opportunity-follow-up-read\.v1\.[a-f0-9]{64}$/u;

export interface OpportunityFollowUpCapturedAuthority {
  assignmentId: string;
  permissionSetVersion: 'v1';
  nativeAssignmentId: string;
  nativePermissionSetVersion: CompanyCommercialIntakePermissionSetVersion;
  readCapture: string;
}

/** Projection evidence never replaces the exact live Access check. */
export function opportunityFollowUpCapturedAuthority(
  company: {
    opportunityFollowUpPermissions?: unknown;
    opportunityFollowUpCoordinatorAssignmentId?: unknown;
    opportunityFollowUpCoordinatorPermissionSetVersion?: unknown;
    opportunityFollowUpReadCapture?: unknown;
    commercialIntakePermissions?: unknown;
    commercialIntakePermissionAssignmentId?: unknown;
    commercialIntakePermissionSetVersion?: unknown;
  },
  options: { manage: boolean },
): OpportunityFollowUpCapturedAuthority | undefined {
  const assignmentId = company.opportunityFollowUpCoordinatorAssignmentId;
  const nativeAssignmentId = company.commercialIntakePermissionAssignmentId;
  const nativeVersion = company.commercialIntakePermissionSetVersion;
  const permissions = company.opportunityFollowUpPermissions;
  const nativePermissions = company.commercialIntakePermissions;
  const readCapture = company.opportunityFollowUpReadCapture;
  const requiredNative: CompanyCommercialIntakePermission[] = [
    'commercial.request.read',
    'commercial.opportunity.read',
  ];
  if (options.manage)
    requiredNative.push('commercial.opportunity.next_action.update');
  if (
    typeof assignmentId !== 'string' ||
    !UUID.test(assignmentId) ||
    company.opportunityFollowUpCoordinatorPermissionSetVersion !== 'v1' ||
    typeof nativeAssignmentId !== 'string' ||
    !UUID.test(nativeAssignmentId) ||
    !isCommercialIntakePermissionSetVersion(nativeVersion) ||
    typeof readCapture !== 'string' ||
    !READ_CAPTURE.test(readCapture) ||
    !Array.isArray(permissions) ||
    permissions.some(
      (permission: unknown) =>
        permission !== 'commercial.opportunity.follow_up.read' &&
        permission !== 'commercial.opportunity.follow_up.manage',
    ) ||
    !permissions.includes('commercial.opportunity.follow_up.read') ||
    (options.manage &&
      !permissions.includes('commercial.opportunity.follow_up.manage')) ||
    !Array.isArray(nativePermissions) ||
    requiredNative.some(
      (permission) =>
        !nativePermissions.includes(permission) ||
        !commercialIntakePermissionsFor(nativeVersion).includes(permission),
    )
  )
    return undefined;
  return {
    assignmentId,
    permissionSetVersion: 'v1',
    nativeAssignmentId,
    nativePermissionSetVersion: nativeVersion,
    readCapture,
  };
}

/** Opaque identity of the exact consumed grants, never an independent credential. */
export function opportunityFollowUpReadCapture(input: {
  workspaceId: string;
  workspaceMembershipId: string;
  companyId: string;
  assignmentId: string;
  nativeAssignmentId: string;
  nativePermissionSetVersion: string;
  contextIdentities: readonly (readonly (string | null)[])[];
}): string {
  const contextIdentities = input.contextIdentities
    .map((identity) => JSON.stringify(identity))
    .sort();
  const digest = createHash('sha256')
    .update(
      JSON.stringify([
        'opportunity-follow-up-read.v1',
        input.workspaceId,
        input.workspaceMembershipId,
        input.companyId,
        input.assignmentId,
        'v1',
        input.nativeAssignmentId,
        input.nativePermissionSetVersion,
        contextIdentities,
      ]),
    )
    .digest('hex');
  return `opportunity-follow-up-read.v1.${digest}`;
}
