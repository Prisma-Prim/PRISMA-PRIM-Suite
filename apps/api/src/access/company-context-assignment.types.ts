import type {
  COMPANY_PROJECT_ACCESS_BUNDLE_LABEL,
  COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL,
  COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL,
} from './company-permissions.js';
import type { CompanyDirectorClientPermissionSetVersion } from './company-permissions.js';

export type CompanyAssignmentBundleLabel =
  | typeof COMPANY_PROJECT_ACCESS_BUNDLE_LABEL
  | typeof COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL
  | typeof COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL;

interface CompanyContextAssignmentRecordBase {
  id: string;
  workspaceMembershipId: string;
  companyId: string;
  active: boolean;
}

export type CompanyContextAssignmentRecord =
  | (CompanyContextAssignmentRecordBase & {
      bundle: typeof COMPANY_PROJECT_ACCESS_BUNDLE_LABEL;
      permissionSetVersion: 'v1';
    })
  | (CompanyContextAssignmentRecordBase & {
      bundle: typeof COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL;
      permissionSetVersion: null;
    })
  | (CompanyContextAssignmentRecordBase & {
      bundle: typeof COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL;
      permissionSetVersion: CompanyDirectorClientPermissionSetVersion;
    });

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
