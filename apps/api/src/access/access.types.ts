import type { CompanyGrant } from './company-grants.js';
import type { CompanyAuthorityContext } from './company-authority-context.js';

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

/** Public Company representation. A registry bundle never adds a property here. */
export interface ActiveCompanyContext {
  id: string;
  displayName: string;
  grants: CompanyGrant[];
  paymentObservationReadCapture?: string;
  paymentObservationContextCapture?: string;
  paymentEvidenceContextCapture?: string;
  paymentEvidenceReferenceReadCapture?: string;
  invoiceRecordReadCapture?: string;
  offerMessageReadCapture?: string;
  workingEvidenceClientReadCapture?: string;
  workingEvidenceContextCapture?: string;
  receivedAddendumClientReadCapture?: string;
  opportunityFollowUpReadCapture?: string;
}

export type { CompanyClientPermission } from './company-permissions.js';

/** UUID representation only; neither existence nor authorization is implied. */
export type InternalUserId = string & { readonly __brand: 'InternalUserId' };
export type WorkspaceId = string & { readonly __brand: 'WorkspaceId' };
export type WorkspaceMembershipId = string & {
  readonly __brand: 'WorkspaceMembershipId';
};
export type CompanyId = string & { readonly __brand: 'CompanyId' };

/** The identity pair used to resolve an active Workspace Membership. */
export interface ActiveAuthoritySelection {
  internalUserId: InternalUserId;
  workspaceId?: WorkspaceId;
}

export interface ActorContext {
  internalUserId: InternalUserId;
  workspaceMembershipId: string;
  workspaceId: WorkspaceId;
  workspaceName: string;
  displayName: string;
  email: string;
  active: boolean;
  workspacePermissions: WorkspacePermission[];
  activeCompany?: CompanyAuthorityContext;
}
