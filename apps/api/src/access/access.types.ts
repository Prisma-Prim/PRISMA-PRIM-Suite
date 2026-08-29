import type {
  CompanyClientPermission,
  CompanyDirectorClientPermissionSetVersion,
} from './company-permissions.js';

export interface ExternalPrincipal {
  provider: string;
  subject: string;
  displayName: string;
  email: string;
}

export type WorkspacePermission =
  'company.manage' | 'company.assignment.manage' | 'client.manage';

export interface ActiveCompanyContext {
  id: string;
  displayName: string;
  clientPermissions: CompanyClientPermission[];
  clientPermissionAssignmentId?: string;
  clientPermissionSetVersion?: CompanyDirectorClientPermissionSetVersion;
}

export type { CompanyClientPermission } from './company-permissions.js';

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
