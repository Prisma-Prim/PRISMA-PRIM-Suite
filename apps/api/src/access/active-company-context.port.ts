export const ACTIVE_COMPANY_CONTEXT_LOOKUP = Symbol(
  'ACTIVE_COMPANY_CONTEXT_LOOKUP',
);

export interface ActiveCompanyContextLookup {
  findActive(
    workspaceId: string,
    requestedCompanyId: string,
  ): Promise<{ id: string; displayName: string } | undefined>;
}
