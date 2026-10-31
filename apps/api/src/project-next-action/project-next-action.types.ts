export interface NextActionScope {
  workspaceId: string;
  companyId: string;
  projectId: string;
  originalClientAccountId: string;
}
export interface NextActionAttribution {
  internalUserId: string;
  workspaceMembershipId: string;
  displayName: string;
  occurredAt: string;
}
export interface NextActionRecord extends NextActionScope {
  format: 'project-next-action-v1';
  revision: number;
  text: string | null;
  lastChange: NextActionAttribution | null;
}
export interface NextActionReceipt {
  format: 'project-next-action-command-v1';
  outcome: 'changed' | 'unchanged';
  record: NextActionRecord;
}
