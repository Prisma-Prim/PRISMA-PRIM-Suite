import { ForbiddenException } from '@nestjs/common';
import {
  COMPANY_CERTIFICATION_APPROVER_BUNDLE,
  COMPANY_CERTIFICATION_AUDITOR_BUNDLE,
  COMPANY_CERTIFICATION_PROGRAMME_MANAGER_BUNDLE,
  COMPANY_CERTIFICATION_READER_BUNDLE,
  companyRolePermissionsFor,
  type CompanyRolePermission,
  type CompanyRolePermissionSetVersion,
} from './company-permissions.js';

type CertificationBundle =
  | typeof COMPANY_CERTIFICATION_READER_BUNDLE
  | typeof COMPANY_CERTIFICATION_PROGRAMME_MANAGER_BUNDLE
  | typeof COMPANY_CERTIFICATION_APPROVER_BUNDLE
  | typeof COMPANY_CERTIFICATION_AUDITOR_BUNDLE;

export type CertificationRole =
  'reader' | 'programme_manager' | 'approver' | 'auditor';

// Compatibility projection only. Internal grants below are complete records.
export interface CertificationActorProjection {
  certificationReaderPermissions?: CompanyRolePermission<
    typeof COMPANY_CERTIFICATION_READER_BUNDLE
  >[];
  certificationReaderAssignmentId?: string;
  certificationReaderPermissionSetVersion?: 'v1';
  certificationProgrammeManagerPermissions?: CompanyRolePermission<
    typeof COMPANY_CERTIFICATION_PROGRAMME_MANAGER_BUNDLE
  >[];
  certificationProgrammeManagerAssignmentId?: string;
  certificationProgrammeManagerPermissionSetVersion?: 'v1';
  certificationApproverPermissions?: CompanyRolePermission<
    typeof COMPANY_CERTIFICATION_APPROVER_BUNDLE
  >[];
  certificationApproverAssignmentId?: string;
  certificationApproverPermissionSetVersion?: 'v1';
  certificationAuditorPermissions?: CompanyRolePermission<
    typeof COMPANY_CERTIFICATION_AUDITOR_BUNDLE
  >[];
  certificationAuditorAssignmentId?: string;
  certificationAuditorPermissionSetVersion?: 'v1';
}

// This is a captured identity, not proof that the assignment is still live.
export interface CertificationCapturedGrant {
  readonly bundle: CertificationBundle;
  readonly permissionSetVersion: Extract<
    CompanyRolePermissionSetVersion<CertificationBundle>,
    'v1'
  >;
  readonly assignmentId: string;
}

interface CapturedAssignment {
  readonly bundle: string;
  readonly permissionSetVersion: unknown;
  readonly assignmentId: string | undefined;
}

function captureCertificationGrant(
  row: CapturedAssignment,
): CertificationCapturedGrant | undefined {
  if (!row.assignmentId || row.permissionSetVersion !== 'v1') return undefined;
  switch (row.bundle) {
    case COMPANY_CERTIFICATION_READER_BUNDLE:
    case COMPANY_CERTIFICATION_PROGRAMME_MANAGER_BUNDLE:
    case COMPANY_CERTIFICATION_APPROVER_BUNDLE:
    case COMPANY_CERTIFICATION_AUDITOR_BUNDLE:
      return {
        bundle: row.bundle,
        permissionSetVersion: row.permissionSetVersion,
        assignmentId: row.assignmentId,
      };
    default:
      return undefined;
  }
}

/** Keep the Actor wire shape while constructing only complete grants. */
export function projectCertificationAssignment(
  row: CapturedAssignment,
): CertificationActorProjection {
  const grant = captureCertificationGrant(row);
  if (!grant) return {};
  switch (grant.bundle) {
    case COMPANY_CERTIFICATION_READER_BUNDLE:
      return {
        certificationReaderPermissions: [
          ...companyRolePermissionsFor(
            grant.bundle,
            grant.permissionSetVersion,
          ),
        ],
        certificationReaderAssignmentId: grant.assignmentId,
        certificationReaderPermissionSetVersion: grant.permissionSetVersion,
      };
    case COMPANY_CERTIFICATION_PROGRAMME_MANAGER_BUNDLE:
      return {
        certificationProgrammeManagerPermissions: [
          ...companyRolePermissionsFor(
            grant.bundle,
            grant.permissionSetVersion,
          ),
        ],
        certificationProgrammeManagerAssignmentId: grant.assignmentId,
        certificationProgrammeManagerPermissionSetVersion:
          grant.permissionSetVersion,
      };
    case COMPANY_CERTIFICATION_APPROVER_BUNDLE:
      return {
        certificationApproverPermissions: [
          ...companyRolePermissionsFor(
            grant.bundle,
            grant.permissionSetVersion,
          ),
        ],
        certificationApproverAssignmentId: grant.assignmentId,
        certificationApproverPermissionSetVersion: grant.permissionSetVersion,
      };
    case COMPANY_CERTIFICATION_AUDITOR_BUNDLE:
      return {
        certificationAuditorPermissions: [
          ...companyRolePermissionsFor(
            grant.bundle,
            grant.permissionSetVersion,
          ),
        ],
        certificationAuditorAssignmentId: grant.assignmentId,
        certificationAuditorPermissionSetVersion: grant.permissionSetVersion,
      };
  }
  return unexpectedCertificationGrant(grant.bundle);
}

/** Admit only the requested role; callers retain live-check and lock ordering. */
export function requireCertificationCapturedGrant(
  company: CertificationActorProjection,
  role: CertificationRole,
): CertificationCapturedGrant {
  switch (role) {
    case 'reader':
      return requireCapturedProjection({
        bundle: COMPANY_CERTIFICATION_READER_BUNDLE,
        permissionSetVersion: company.certificationReaderPermissionSetVersion,
        assignmentId: company.certificationReaderAssignmentId,
        permissions: company.certificationReaderPermissions,
      });
    case 'programme_manager':
      return requireCapturedProjection({
        bundle: COMPANY_CERTIFICATION_PROGRAMME_MANAGER_BUNDLE,
        permissionSetVersion:
          company.certificationProgrammeManagerPermissionSetVersion,
        assignmentId: company.certificationProgrammeManagerAssignmentId,
        permissions: company.certificationProgrammeManagerPermissions,
      });
    case 'approver':
      return requireCapturedProjection({
        bundle: COMPANY_CERTIFICATION_APPROVER_BUNDLE,
        permissionSetVersion: company.certificationApproverPermissionSetVersion,
        assignmentId: company.certificationApproverAssignmentId,
        permissions: company.certificationApproverPermissions,
      });
    case 'auditor':
      return requireCapturedProjection({
        bundle: COMPANY_CERTIFICATION_AUDITOR_BUNDLE,
        permissionSetVersion: company.certificationAuditorPermissionSetVersion,
        assignmentId: company.certificationAuditorAssignmentId,
        permissions: company.certificationAuditorPermissions,
      });
  }
  return unexpectedCertificationGrant(role);
}

function unexpectedCertificationGrant(value: never): never {
  throw new Error(`Unexpected certification grant: ${String(value)}`);
}

function requireCapturedProjection(
  projection: CapturedAssignment & {
    readonly permissions: readonly string[] | undefined;
  },
): CertificationCapturedGrant {
  const grant = captureCertificationGrant(projection);
  if (
    !grant ||
    !companyRolePermissionsFor(grant.bundle, grant.permissionSetVersion).every(
      (permission) => projection.permissions?.includes(permission),
    )
  )
    throw new ForbiddenException();
  return grant;
}
