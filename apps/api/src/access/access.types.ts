export interface ExternalPrincipal {
  provider: string;
  subject: string;
  displayName: string;
  email: string;
}

export type WorkspacePermission =
  'company.manage' | 'company.assignment.manage' | 'client.manage';

export type CompanyClientPermission =
  'client.read' | 'client.create' | 'client.update';

export interface ActiveCompanyContext {
  id: string;
  displayName: string;
  clientPermissions: CompanyClientPermission[];
}

export interface ActorContext {
  internalUserId: string;
  workspaceMembershipId: string;
  workspaceId: string;
  workspaceName: string;
  displayName: string;
  email: string;
  active: boolean;
  workspacePermissions: WorkspacePermission[];
  activeCompany?: ActiveCompanyContext;
}
