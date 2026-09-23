import type {
  CompanyClientPermission,
  DocumentPermission,
  DocumentPermissionSetVersion,
  CompanyDirectorClientPermissionSetVersion,
  CompanyCommercialIntakePermission,
  CompanyServiceCataloguePermission,
  CompanyCommercialActivityPermission,
} from './company-permissions.js';

export interface ExternalPrincipal {
  provider: string;
  subject: string;
  displayName: string;
  email: string;
}

export type WorkspacePermission =
  | 'company.manage'
  | 'company.assignment.manage'
  | 'client.manage'
  | 'member.invite';

export interface ActiveCompanyContext {
  id: string;
  displayName: string;
  clientPermissions: CompanyClientPermission[];
  documentPermissions?: DocumentPermission[];
  documentPermissionSetVersion?: DocumentPermissionSetVersion;
  taskPermissions?: Array<'task.read' | 'task.manage'>;
  taskPermissionAssignmentId?: string;
  taskPermissionSetVersion?: 'v1';
  projectPermissions?: Array<'project.read' | 'project.create'>;
  commercialIntakePermissions?: CompanyCommercialIntakePermission[];
  commercialIntakePermissionAssignmentId?: string;
  commercialIntakePermissionSetVersion?: 'v1';
  serviceCataloguePermissions?: CompanyServiceCataloguePermission[];
  serviceCataloguePermissionAssignmentId?: string;
  serviceCataloguePermissionSetVersion?: 'v1';
  commercialActivityPermissions?: CompanyCommercialActivityPermission[];
  commercialActivityPermissionSetVersion?: 'v1';
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
