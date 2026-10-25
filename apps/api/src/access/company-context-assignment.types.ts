import type {
  COMPANY_CONTEXT_ACCESS_BUNDLE,
  COMPANY_ROLE_BUNDLES,
  CompanyRoleBundle,
  CompanyRolePermissionSetVersion,
} from './company-permissions.js';

type CompanyAssignmentCaptureVersion<Bundle extends CompanyRoleBundle> =
  Bundle extends typeof COMPANY_CONTEXT_ACCESS_BUNDLE
    ? null
    : CompanyRolePermissionSetVersion<Bundle>;

export type CompanyAssignmentBundleLabel =
  (typeof COMPANY_ROLE_BUNDLES)[CompanyRoleBundle]['label'];

// Fresh capture policy remains explicit in the named server-owned definitions.
// Labels are registry metadata, so definitions cannot supply a competing label.
export type CompanyAssignmentDefinition = {
  [Bundle in CompanyRoleBundle]: {
    value: Bundle;
    permissionSetVersion: CompanyAssignmentCaptureVersion<Bundle>;
  };
}[CompanyRoleBundle];

export type CompanyAssignmentRecordMetadata = {
  [Bundle in CompanyRoleBundle]: {
    bundle: (typeof COMPANY_ROLE_BUNDLES)[Bundle]['label'];
    permissionSetVersion: CompanyAssignmentCaptureVersion<Bundle>;
  };
}[CompanyRoleBundle];

interface CompanyContextAssignmentRecordBase {
  id: string;
  workspaceMembershipId: string;
  companyId: string;
  active: boolean;
}

export type CompanyContextAssignmentRecord =
  CompanyContextAssignmentRecordBase & CompanyAssignmentRecordMetadata;

export interface CompanyAccessAdministrationMember {
  workspaceMembershipId: string;
  displayName: string;
  email: string;
}

export interface CompanyAccessAdministrationCompany {
  id: string;
  displayName: string;
}

export interface CompanyAccessAdministrationState {
  members: CompanyAccessAdministrationMember[];
  companies: CompanyAccessAdministrationCompany[];
  assignments: CompanyContextAssignmentRecord[];
}

export interface GrantCompanyContextAssignmentCommand {
  workspaceMembershipId: unknown;
  companyId: unknown;
  idempotencyKey: string | undefined;
}
