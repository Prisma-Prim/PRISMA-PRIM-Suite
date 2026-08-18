export interface ActorContext {
  internalUserId: string;
  workspaceMembershipId: string;
  workspaceId: string;
  workspaceName: string;
  displayName: string;
  email: string;
  active: true;
  workspacePermissions: Array<'company.manage' | 'company.assignment.manage'>;
  activeCompany?: {
    id: string;
    displayName: string;
  };
}
