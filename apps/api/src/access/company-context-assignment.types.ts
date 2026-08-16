export interface CompanyContextAssignmentRecord {
  id: string;
  workspaceMembershipId: string;
  companyId: string;
  bundle: 'Company Context Access';
  active: boolean;
}

export interface GrantCompanyContextAssignmentCommand {
  workspaceMembershipId: unknown;
  companyId: unknown;
  idempotencyKey: string | undefined;
}
