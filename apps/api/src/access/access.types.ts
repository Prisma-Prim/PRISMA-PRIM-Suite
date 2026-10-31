import type { KnowledgeCapturedGrant } from './knowledge-captured-grants.js';
import type { MissionPlanActorProjection } from './mission-plan-captured-grants.js';
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
  CompanyOfferPreparerPermissionSetVersion,
  CompanyOfferApproverPermissionSetVersion,
  CompanyContractPermission,
  CompanyPricingAdjustmentPermission,
  CompanyCommercialActivityPermission,
  CompanyOpportunityManagerPermission,
  CompanyOpportunityManagerPermissionSetVersion,
  CompanyProfitabilityContributorPermission,
  CompanyProfitabilityDirectorPermission,
  CompanyOperationalRiskPermission,
  CompanyProjectPermission,
  CompanyProjectPermissionSetVersion,
  CompanyProjectApproverPermission,
  CompanySalesStageConfigurationPermission,
  CompanyProjectTemplatePermission,
  CompanyProjectTemplateConfigurationPermission,
  CompanyProjectStagePermission,
  TaskResultPermission,
  MissionResultReviewPermission,
} from './company-permissions.js';
import type { IdeasActorProjection } from './ideas-captured-grants.js';
import type { ContractModelActorProjection } from './contract-model-captured-grants.js';
import type { OfferModelActorProjection } from './offer-model-captured-grants.js';

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

export interface ActiveCompanyContext
  extends
    IdeasActorProjection,
    OfferModelActorProjection,
    ContractModelActorProjection,
    MissionPlanActorProjection {
  knowledgeGrants?: KnowledgeCapturedGrant[];
  id: string;
  displayName: string;
  clientPermissions: CompanyClientPermission[];
  documentPermissions?: DocumentPermission[];
  documentPermissionSetVersion?: DocumentPermissionSetVersion;
  documentPermissionAssignmentId?: string;
  missionDeliverableAccessAssignmentId?: string;
  missionDeliverableAccessPermissionSetVersion?: 'v1';
  contractSignatureDeclarerAssignmentId?: string;
  contractSignatureDeclarerPermissionSetVersion?: 'v1';
  receivedContractAccessAssignmentId?: string;
  receivedContractAccessPermissionSetVersion?: 'v1';
  /** The live captured Company Document Approver assignment, if any. */
  documentApproverAssignmentId?: string;
  documentApproverPermissionSetVersion?: 'v1';
  documentContentReaderAssignmentId?: string;
  documentContentReaderPermissionSetVersion?: 'v1';
  documentContentUploaderAssignmentId?: string;
  documentContentUploaderPermissionSetVersion?: 'v1';
  taskResultPermissions?: TaskResultPermission[];
  taskResultRecorderAssignmentId?: string;
  taskResultRecorderPermissionSetVersion?: 'v1';
  projectNextActionPermissions?: Array<'project.next_action.update'>;
  projectNextActionCoordinatorAssignmentId?: string;
  projectNextActionCoordinatorPermissionSetVersion?: 'v1';
  missionApplicabilityProposalPermissions?: Array<'project.mission_applicability.propose'>;
  missionApplicabilityCoordinatorAssignmentId?: string;
  missionApplicabilityCoordinatorPermissionSetVersion?: 'v1';
  missionApplicabilityDecisionPermissions?: Array<
    | 'project.mission_applicability.decide'
    | 'project.mission_applicability.restore'
  >;
  missionApplicabilityApproverAssignmentId?: string;
  missionApplicabilityApproverPermissionSetVersion?: 'v1';
  missionResultReviewPermissions?: MissionResultReviewPermission[];
  missionResultReviewerAssignmentId?: string;
  missionResultReviewerPermissionSetVersion?: 'v1';
  taskPermissions?: Array<'task.read' | 'task.manage'>;
  taskPermissionAssignmentId?: string;
  taskPermissionSetVersion?: 'v1';
  projectPermissions?: CompanyProjectPermission[];
  projectPermissionAssignmentId?: string;
  projectPermissionSetVersion?: CompanyProjectPermissionSetVersion;
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
  contractEarlyPreparationAssignmentId?: string;
  contractEarlyPreparationPermissionSetVersion?: 'v1';
  contractPermissionAssignmentId?: string;
  contractPermissionSetVersion?: 'v1' | 'v2';
  contractApproverAssignmentId?: string;
  contractApproverPermissionSetVersion?: 'v1' | 'v2';
  offerPermissions?: CompanyOfferPermission[];
  offerPermissionAssignmentId?: string;
  offerPermissionSetVersion?: CompanyOfferPreparerPermissionSetVersion;
  offerApproverAssignmentId?: string;
  offerApproverPermissionSetVersion?: CompanyOfferApproverPermissionSetVersion;
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
  operationalRiskPermissions?: CompanyOperationalRiskPermission[];
  operationalRiskReaderAssignmentId?: string;
  operationalRiskReaderPermissionSetVersion?: 'v1';
  operationalRiskRecorderAssignmentId?: string;
  operationalRiskRecorderPermissionSetVersion?: 'v1';
  projectStagePermissions?: CompanyProjectStagePermission[];
  projectStagePermissionAssignmentId?: string;
  projectStagePermissionSetVersion?: 'v1';
  projectTemplateConfigurationPermissions?: CompanyProjectTemplateConfigurationPermission[];
  projectTemplateConfigurationPermissionAssignmentId?: string;
  projectTemplateConfigurationPermissionSetVersion?: 'v1';
  projectTemplatePermissions?: CompanyProjectTemplatePermission[];
  projectTemplatePermissionAssignmentId?: string;
  projectTemplatePermissionSetVersion?: 'v1' | 'v2';
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
