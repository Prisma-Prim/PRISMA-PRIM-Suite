import type {
  COMPANY_ROLE_BUNDLES,
  CompanyRoleBundle,
  CompanyRoleCapturedVersion,
} from './company-permissions.js';
import type {
  CompanyId,
  WorkspaceId,
  WorkspaceMembershipId,
} from './access.types.js';

/** The validated identity categories of one Company role assignment target. */
export interface CompanyAssignmentTarget {
  workspaceId: WorkspaceId;
  workspaceMembershipId: WorkspaceMembershipId;
  companyId: CompanyId;
}

export type CompanyAssignmentBundleLabel =
  (typeof COMPANY_ROLE_BUNDLES)[CompanyRoleBundle]['label'];

// Labels are registry metadata, so a record cannot carry a competing label.
export type CompanyAssignmentRecordMetadata = {
  [Bundle in CompanyRoleBundle]: {
    bundle: (typeof COMPANY_ROLE_BUNDLES)[Bundle]['label'];
    permissionSetVersion: CompanyRoleCapturedVersion<Bundle>;
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
