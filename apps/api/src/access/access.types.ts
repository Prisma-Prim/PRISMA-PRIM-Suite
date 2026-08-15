export interface ExternalPrincipal {
  provider: string;
  subject: string;
  displayName: string;
  email: string;
}

export type WorkspacePermission = 'company.manage';

export interface ActorContext {
  internalUserId: string;
  workspaceMembershipId: string;
  workspaceId: string;
  workspaceName: string;
  displayName: string;
  email: string;
  active: boolean;
  workspacePermissions: WorkspacePermission[];
}
