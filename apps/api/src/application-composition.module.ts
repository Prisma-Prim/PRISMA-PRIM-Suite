import { DocumentContentController } from './documents/document-content.controller.js';
import { CompanyDocumentContentReaderAssignmentController } from './access/company-document-content-reader-assignment.controller.js';
import { CompanyDocumentContentUploaderAssignmentController } from './access/company-document-content-uploader-assignment.controller.js';
import { ContractAgreementsController } from './contract/contract-agreements.controller.js';
import { ContractModule } from './contract/contract.module.js';
import {
  ContractController,
  ProjectContractsController,
} from './contract/contract.controller.js';
import { CompanyContractApproverAssignmentController } from './access/company-contract-approver-assignment.controller.js';
import { CompanyContractPreparerAssignmentController } from './access/company-contract-preparer-assignment.controller.js';
import { TaskModule } from './task/task.module.js';
import { TaskController } from './task/task.controller.js';
import { CompanyTaskManagerAssignmentController } from './access/company-task-manager-assignment.controller.js';
import { DocumentProjectsController } from './documents/document-projects.controller.js';
import { CompanyDocumentProjectOrganizerAssignmentController } from './access/company-document-project-organizer-assignment.controller.js';
import { ProjectController } from './project/project.controller.js';
import { ProjectResponsibilityController } from './project/project-responsibility.controller.js';
import { ProjectModule } from './project/project.module.js';
import { ProjectLifecycleController } from './project/project-lifecycle.controller.js';
import { ProjectLifecycleModule } from './project/project-lifecycle.module.js';
import { CompanyProjectAssignmentController } from './access/company-project-assignment.controller.js';
import { WorkspaceSessionRevocationController } from './access/workspace-session-revocation.controller.js';
import { WorkspaceSessionRevocationService } from './access/workspace-session-revocation.service.js';
import { CompanyDocumentRegistrarAssignmentController } from './access/company-document-registrar-assignment.controller.js';
import { DocumentsController } from './documents/documents.controller.js';
import { DocumentVersionsController } from './documents/document-versions.controller.js';
import { CompanyDocumentApproverAssignmentController } from './access/company-document-approver-assignment.controller.js';
import { DocumentsModule } from './documents/documents.module.js';
import { Module } from '@nestjs/common';
import { VerifiedPrincipalAdapter } from './access/verified-principal.adapter.js';
import { WorkspaceInvitationAcceptanceController } from './access/workspace-invitation-acceptance.controller.js';
import { WorkspaceInvitationAcceptanceService } from './access/workspace-invitation-acceptance.service.js';
import { INVITATION_ACCEPTANCE_PROVIDER } from './access/workspace-invitation-acceptance-provider.js';
import { ClerkInvitationAcceptanceProvider } from './identity/clerk-invitation-acceptance.adapter.js';
import { WorkspaceInvitationController } from './access/workspace-invitation.controller.js';
import { WorkspaceInvitationService } from './access/workspace-invitation.service.js';
import { WORKSPACE_INVITATION_PROVIDER } from './access/workspace-invitation-provider.js';
import { ClerkInvitationProvider } from './identity/clerk-invitation.adapter.js';
import { AccessController } from './access/access.controller.js';
import { AccessModule } from './access/access.module.js';
import {
  AccessService,
  SYNCHRONIZE_ACCESS_IDENTITY_PROFILE,
} from './access/access.service.js';
import { ActorContextAdapter } from './access/actor-context.adapter.js';
import { CompanyContextAssignmentController } from './access/company-context-assignment.controller.js';
import { CompanyDirectorClientAssignmentController } from './access/company-director-client-assignment.controller.js';
import {
  CompanyContextAssignmentService,
  INCLUDE_REVOKED_ASSIGNMENTS_IN_ADMINISTRATION,
} from './access/company-context-assignment.service.js';
import { WorkspaceMembershipSuspensionController } from './access/workspace-membership-suspension.controller.js';
import { WorkspaceMembershipSuspensionService } from './access/workspace-membership-suspension.service.js';
import { AccountabilityModule } from './accountability/accountability.module.js';
import { ActivityLogController } from './accountability/activity-log.controller.js';
import { CompanyController } from './company/company.controller.js';
import { CompanyModule } from './company/company.module.js';
import { ClientController } from './client/client.controller.js';
import { ClientDuplicateReviewController } from './client/client-duplicate-review.controller.js';
import { ClientModule } from './client/client.module.js';
import { ClientUnionController } from './client/client-union.controller.js';
import { DatabaseModule } from './database/database.module.js';
import { CommercialIntakeModule } from './commercial-intake/commercial-intake.module.js';
import { SalesStageModule } from './sales-stage/sales-stage.module.js';
import { SalesStageController } from './sales-stage/sales-stage.controller.js';
import {
  CommercialIntakeController,
  CommercialIntakeOpportunityController,
} from './commercial-intake/commercial-intake.controller.js';
import { CompanyCommercialIntakeAssignmentController } from './access/company-commercial-intake-assignment.controller.js';
import { CommercialCatalogueModule } from './commercial-catalogue/commercial-catalogue.module.js';
import { CommercialCatalogueController } from './commercial-catalogue/commercial-catalogue.controller.js';
import { CompanyServiceCatalogueAssignmentController } from './access/company-service-catalogue-assignment.controller.js';
import { PricingConfigurationModule } from './pricing-configuration/pricing-configuration.module.js';
import { PricingConfigurationController } from './pricing-configuration/pricing-configuration.controller.js';
import { PricingSnapshotController } from './pricing-configuration/pricing-snapshot.controller.js';
import { CompanyPricingConfigurationAssignmentController } from './access/company-pricing-configuration-assignment.controller.js';
import { CompanyPricingUserAssignmentController } from './access/company-pricing-user-assignment.controller.js';
import { CompanyPricingAdjustmentAssignmentController } from './access/company-pricing-adjustment-assignment.controller.js';
import { CompanyProfitabilityContributorAssignmentController } from './access/company-profitability-contributor-assignment.controller.js';
import { CompanyProfitabilityDirectorAssignmentController } from './access/company-profitability-director-assignment.controller.js';
import { CompanyCommercialActivityReaderAssignmentController } from './access/company-commercial-activity-reader-assignment.controller.js';
import { CompanyOfferPreparerAssignmentController } from './access/company-offer-preparer-assignment.controller.js';
import { CompanyOfferApproverAssignmentController } from './access/company-offer-approver-assignment.controller.js';
import { CompanyOpportunityManagerAssignmentController } from './access/company-opportunity-manager-assignment.controller.js';
import { CompanySalesStageConfigurationAssignmentController } from './access/company-sales-stage-configuration-assignment.controller.js';
import { CompanyProjectApproverAssignmentController } from './access/company-project-approver-assignment.controller.js';
import { OperationalHomeModule } from './operational-home/operational-home.module.js';
import { OperationalHomeController } from './operational-home/operational-home.controller.js';
import { OfferController } from './offer/offer.controller.js';
import { OfferModule } from './offer/offer.module.js';
import { ProfitabilityEstimateModule } from './profitability-estimate/profitability-estimate.module.js';
import { ProfitabilityEstimateController } from './profitability-estimate/profitability-estimate.controller.js';

@Module({
  imports: [
    TaskModule,
    DocumentsModule,
    ProjectModule,
    ProjectLifecycleModule,
    AccessModule,
    AccountabilityModule,
    ClientModule,
    CompanyModule,
    DatabaseModule,
    CommercialIntakeModule,
    SalesStageModule,
    CommercialCatalogueModule,
    PricingConfigurationModule,
    OperationalHomeModule,
    OfferModule,
    ContractModule,
    ProfitabilityEstimateModule,
  ],
  controllers: [
    ProjectContractsController,
    TaskController,
    CompanyTaskManagerAssignmentController,
    DocumentsController,
    DocumentVersionsController,
    DocumentContentController,
    DocumentProjectsController,
    CompanyDocumentRegistrarAssignmentController,
    CompanyDocumentApproverAssignmentController,
    CompanyDocumentContentReaderAssignmentController,
    CompanyDocumentContentUploaderAssignmentController,
    CompanyDocumentProjectOrganizerAssignmentController,
    ProjectController,
    ProjectResponsibilityController,
    ProjectLifecycleController,
    CompanyProjectAssignmentController,
    CompanyProjectApproverAssignmentController,
    WorkspaceInvitationAcceptanceController,
    WorkspaceInvitationController,
    ClientUnionController,
    AccessController,
    ActivityLogController,
    ClientDuplicateReviewController,
    ClientController,
    CompanyController,
    CompanyContextAssignmentController,
    CompanyDirectorClientAssignmentController,
    WorkspaceMembershipSuspensionController,
    WorkspaceSessionRevocationController,
    CommercialIntakeController,
    SalesStageController,
    CommercialIntakeOpportunityController,
    CompanyCommercialIntakeAssignmentController,
    CommercialCatalogueController,
    CompanyServiceCatalogueAssignmentController,
    PricingConfigurationController,
    PricingSnapshotController,
    CompanyPricingConfigurationAssignmentController,
    CompanyPricingUserAssignmentController,
    CompanyPricingAdjustmentAssignmentController,
    CompanyCommercialActivityReaderAssignmentController,
    CompanyProfitabilityContributorAssignmentController,
    CompanyProfitabilityDirectorAssignmentController,
    CompanyOfferPreparerAssignmentController,
    CompanyContractPreparerAssignmentController,
    CompanyContractApproverAssignmentController,
    CompanyOfferApproverAssignmentController,
    CompanyOpportunityManagerAssignmentController,
    CompanySalesStageConfigurationAssignmentController,
    OperationalHomeController,
    OfferController,
    ContractController,
    ContractAgreementsController,
    ProfitabilityEstimateController,
  ],
  providers: [
    VerifiedPrincipalAdapter,
    WorkspaceInvitationAcceptanceService,
    {
      provide: INVITATION_ACCEPTANCE_PROVIDER,
      useFactory: () => new ClerkInvitationAcceptanceProvider(),
    },
    WorkspaceInvitationService,
    {
      provide: WORKSPACE_INVITATION_PROVIDER,
      useFactory: () => new ClerkInvitationProvider(),
    },
    {
      provide: SYNCHRONIZE_ACCESS_IDENTITY_PROFILE,
      useValue: true,
    },
    {
      provide: INCLUDE_REVOKED_ASSIGNMENTS_IN_ADMINISTRATION,
      useValue: false,
    },
    AccessService,
    ActorContextAdapter,
    CompanyContextAssignmentService,
    WorkspaceMembershipSuspensionService,
    WorkspaceSessionRevocationService,
  ],
  exports: [AccessService, ActorContextAdapter],
})
export class ApplicationCompositionModule {}
