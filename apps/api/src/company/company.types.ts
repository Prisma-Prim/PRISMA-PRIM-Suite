export interface CompanyRecord {
  id: string;
  workspaceId: string;
  displayName: string;
  status: 'active' | 'inactive';
  createdAt: string;
  createdByInternalUserId: string;
}

export interface RegisterCompanyCommand {
  displayName: unknown;
  idempotencyKey: string | undefined;
}
