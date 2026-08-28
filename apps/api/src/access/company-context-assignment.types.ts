import type {
  COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL,
  COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL,
} from './company-permissions.js';

export type CompanyAssignmentBundleLabel =
  | typeof COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL
  | typeof COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL;

export interface CompanyContextAssignmentRecord {
  id: string;
  workspaceMembershipId: string;
  companyId: string;
  bundle: CompanyAssignmentBundleLabel;
  active: boolean;
}

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
