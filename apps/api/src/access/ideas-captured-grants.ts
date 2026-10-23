import { ForbiddenException } from '@nestjs/common';
import {
  COMPANY_IDEAS_READER_BUNDLE,
  COMPANY_IDEAS_RECORDER_BUNDLE,
  COMPANY_IDEAS_REVIEWER_BUNDLE,
  companyRolePermissionsFor,
  type CompanyRolePermission,
  type CompanyRolePermissionSetVersion,
} from './company-permissions.js';

type IdeasBundle =
  | typeof COMPANY_IDEAS_READER_BUNDLE
  | typeof COMPANY_IDEAS_RECORDER_BUNDLE
  | typeof COMPANY_IDEAS_REVIEWER_BUNDLE;

// Compatibility projection only. Internal grants below are complete records.
export interface IdeasActorProjection {
  ideasReaderPermissions?: CompanyRolePermission<
    typeof COMPANY_IDEAS_READER_BUNDLE
  >[];
  ideasReaderPermissionAssignmentId?: string;
  ideasReaderPermissionSetVersion?: 'v1';
  ideasRecorderPermissions?: CompanyRolePermission<
    typeof COMPANY_IDEAS_RECORDER_BUNDLE
  >[];
  ideasRecorderPermissionAssignmentId?: string;
  ideasRecorderPermissionSetVersion?: 'v1';
  ideasReviewerPermissions?: CompanyRolePermission<
    typeof COMPANY_IDEAS_REVIEWER_BUNDLE
  >[];
  ideasReviewerPermissionAssignmentId?: string;
  ideasReviewerPermissionSetVersion?: 'v1';
}

// This is a captured identity, not proof that the assignment is still live.
interface IdeasCapturedGrant {
  readonly bundle: IdeasBundle;
  readonly permissionSetVersion: Extract<
    CompanyRolePermissionSetVersion<IdeasBundle>,
    'v1'
  >;
  readonly assignmentId: string;
}

interface CapturedAssignment {
  readonly bundle: string;
  readonly permissionSetVersion: unknown;
  readonly assignmentId: string | undefined;
}

function captureIdeasGrant(
  row: CapturedAssignment,
): IdeasCapturedGrant | undefined {
  if (!row.assignmentId || row.permissionSetVersion !== 'v1') return undefined;
  switch (row.bundle) {
    case COMPANY_IDEAS_READER_BUNDLE:
    case COMPANY_IDEAS_RECORDER_BUNDLE:
    case COMPANY_IDEAS_REVIEWER_BUNDLE:
      return {
        bundle: row.bundle,
        permissionSetVersion: row.permissionSetVersion,
        assignmentId: row.assignmentId,
      };
    default:
      return undefined;
  }
}

/** Keep the delivered Actor wire shape while constructing only complete grants. */
export function projectIdeasAssignment(
  row: CapturedAssignment,
): IdeasActorProjection {
  const grant = captureIdeasGrant(row);
  if (!grant) return {};
  switch (grant.bundle) {
    case COMPANY_IDEAS_READER_BUNDLE:
      return {
        ideasReaderPermissions: [
          ...companyRolePermissionsFor(
            grant.bundle,
            grant.permissionSetVersion,
          ),
        ],
        ideasReaderPermissionAssignmentId: grant.assignmentId,
        ideasReaderPermissionSetVersion: grant.permissionSetVersion,
      };
    case COMPANY_IDEAS_RECORDER_BUNDLE:
      return {
        ideasRecorderPermissions: [
          ...companyRolePermissionsFor(
            grant.bundle,
            grant.permissionSetVersion,
          ),
        ],
        ideasRecorderPermissionAssignmentId: grant.assignmentId,
        ideasRecorderPermissionSetVersion: grant.permissionSetVersion,
      };
    case COMPANY_IDEAS_REVIEWER_BUNDLE:
      return {
        ideasReviewerPermissions: [
          ...companyRolePermissionsFor(
            grant.bundle,
            grant.permissionSetVersion,
          ),
        ],
        ideasReviewerPermissionAssignmentId: grant.assignmentId,
        ideasReviewerPermissionSetVersion: grant.permissionSetVersion,
      };
  }
  return unexpectedIdeasGrant(grant.bundle);
}

/** Admit only the requested role; callers retain live-check and lock ordering. */
export function requireIdeasCapturedGrant(
  company: IdeasActorProjection,
  role: 'reader' | 'recorder' | 'reviewer',
): IdeasCapturedGrant {
  switch (role) {
    case 'reader':
      return requireCapturedProjection({
        bundle: COMPANY_IDEAS_READER_BUNDLE,
        permissionSetVersion: company.ideasReaderPermissionSetVersion,
        assignmentId: company.ideasReaderPermissionAssignmentId,
        permissions: company.ideasReaderPermissions,
      });
    case 'recorder':
      return requireCapturedProjection({
        bundle: COMPANY_IDEAS_RECORDER_BUNDLE,
        permissionSetVersion: company.ideasRecorderPermissionSetVersion,
        assignmentId: company.ideasRecorderPermissionAssignmentId,
        permissions: company.ideasRecorderPermissions,
      });
    case 'reviewer':
      return requireCapturedProjection({
        bundle: COMPANY_IDEAS_REVIEWER_BUNDLE,
        permissionSetVersion: company.ideasReviewerPermissionSetVersion,
        assignmentId: company.ideasReviewerPermissionAssignmentId,
        permissions: company.ideasReviewerPermissions,
      });
  }
  return unexpectedIdeasGrant(role);
}

function unexpectedIdeasGrant(value: never): never {
  throw new Error(`Unexpected Ideas grant: ${String(value)}`);
}

function requireCapturedProjection(
  projection: CapturedAssignment & {
    readonly permissions: readonly string[] | undefined;
  },
): IdeasCapturedGrant {
  const grant = captureIdeasGrant(projection);
  if (
    !grant ||
    !companyRolePermissionsFor(grant.bundle, grant.permissionSetVersion).every(
      (permission) => projection.permissions?.includes(permission),
    )
  )
    throw new ForbiddenException();
  return grant;
}
