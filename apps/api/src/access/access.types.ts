import type {
  CompanyClientPermission,
  DocumentPermission,
  DocumentPermissionSetVersion,
  CompanyDirectorClientPermissionSetVersion,
  CompanyCommercialIntakePermission,
  CompanyCommercialIntakePermissionSetVersion,
  CompanyServiceCataloguePermission,
  CompanyPricingConfigurationPermission,
  CompanyPricingUserPermission,
  CompanyOfferPermission,
  CompanyContractPermission,
  CompanyPricingAdjustmentPermission,
  CompanyCommercialActivityPermission,
  CompanyOpportunityManagerPermission,
  CompanyOpportunityManagerPermissionSetVersion,
  CompanyProfitabilityContributorPermission,
  CompanyProfitabilityDirectorPermission,
  CompanyProjectPermission,
  CompanyProjectApproverPermission,
  CompanySalesStageConfigurationPermission,
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
  /** The live captured Company Document Approver assignment, if any. */
  documentApproverAssignmentId?: string;
  documentApproverPermissionSetVersion?: 'v1';
  documentContentReaderAssignmentId?: string;
  documentContentReaderPermissionSetVersion?: 'v1';
  documentContentUploaderAssignmentId?: string;
  documentContentUploaderPermissionSetVersion?: 'v1';
  taskPermissions?: Array<'task.read' | 'task.manage'>;
  taskPermissionAssignmentId?: string;
  taskPermissionSetVersion?: 'v1';
  projectPermissions?: CompanyProjectPermission[];
  projectApproverPermissions?: CompanyProjectApproverPermission[];
  projectApproverPermissionAssignmentId?: string;
  projectApproverPermissionSetVersion?: 'v1';
  commercialIntakePermissions?: CompanyCommercialIntakePermission[];
  commercialIntakePermissionAssignmentId?: string;
  commercialIntakePermissionSetVersion?: CompanyCommercialIntakePermissionSetVersion;
  serviceCataloguePermissions?: CompanyServiceCataloguePermission[];
  serviceCataloguePermissionAssignmentId?: string;
  serviceCataloguePermissionSetVersion?: 'v1';
  pricingConfigurationPermissions?: CompanyPricingConfigurationPermission[];
  pricingConfigurationPermissionAssignmentId?: string;
  pricingConfigurationPermissionSetVersion?: 'v1';
  pricingUserPermissions?: CompanyPricingUserPermission[];
  pricingUserPermissionAssignmentId?: string;
  pricingUserPermissionSetVersion?: 'v1';
  contractPermissions?: CompanyContractPermission[];
  contractPermissionAssignmentId?: string;
  contractPermissionSetVersion?: 'v1';
  contractApproverAssignmentId?: string;
  contractApproverPermissionSetVersion?: 'v1';
  offerPermissions?: CompanyOfferPermission[];
  offerPermissionAssignmentId?: string;
  offerPermissionSetVersion?: 'v1';
  offerApproverAssignmentId?: string;
  offerApproverPermissionSetVersion?: 'v1';
  pricingAdjustmentPermissions?: CompanyPricingAdjustmentPermission[];
  pricingAdjustmentPermissionAssignmentId?: string;
  pricingAdjustmentPermissionSetVersion?: 'v1';
  commercialActivityPermissions?: CompanyCommercialActivityPermission[];
  commercialActivityPermissionSetVersion?: 'v1';
  opportunityManagerPermissions?: CompanyOpportunityManagerPermission[];
  opportunityManagerPermissionAssignmentId?: string;
  opportunityManagerPermissionSetVersion?: CompanyOpportunityManagerPermissionSetVersion;
  profitabilityContributorPermissions?: CompanyProfitabilityContributorPermission[];
  profitabilityContributorPermissionAssignmentId?: string;
  profitabilityContributorPermissionSetVersion?: 'v1';
  profitabilityDirectorPermissions?: CompanyProfitabilityDirectorPermission[];
  profitabilityDirectorPermissionAssignmentId?: string;
  profitabilityDirectorPermissionSetVersion?: 'v1';
  salesStageConfigurationPermissions?: CompanySalesStageConfigurationPermission[];
  salesStageConfigurationPermissionAssignmentId?: string;
  salesStageConfigurationPermissionSetVersion?: 'v1';
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
