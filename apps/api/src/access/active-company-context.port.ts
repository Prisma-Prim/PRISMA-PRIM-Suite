export const ACTIVE_COMPANY_CONTEXT_LOOKUP = Symbol(
  'ACTIVE_COMPANY_CONTEXT_LOOKUP',
);

export interface ActiveCompanyContextLookup {
  findActive(
    workspaceId: string,
    workspaceMembershipId: string,
    requestedCompanyId: string,
    canManageAllCompanies: boolean,
  ): Promise<{ id: string; displayName: string } | undefined>;

  hasAnyActive(
    workspaceId: string,
    workspaceMembershipId: string,
    canManageAllCompanies: boolean,
  ): Promise<boolean>;
}
