import type { COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL } from './company-permissions.js';

export interface CompanyContextAssignmentRecord {
  id: string;
  workspaceMembershipId: string;
  companyId: string;
  bundle: typeof COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL;
  active: boolean;
}

export interface GrantCompanyContextAssignmentCommand {
  workspaceMembershipId: unknown;
  companyId: unknown;
  idempotencyKey: string | undefined;
}
