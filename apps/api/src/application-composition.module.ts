import { CompanyRoleAssignmentController } from './access/company-role-assignment.controller.js';
import { WorkingEvidenceModule } from './working-evidence/working-evidence.module.js';
import { WorkingEvidenceController } from './working-evidence/working-evidence.controller.js';
import { PaymentModule } from './payment/payment.module.js';
import { PaymentController } from './payment/payment.controller.js';
import { InvoiceRecordModule } from './invoice-record/invoice-record.module.js';
import { InvoiceRecordController } from './invoice-record/invoice-record.controller.js';
import { OpportunityFollowUpModule } from './opportunity-follow-up/opportunity-follow-up.module.js';
import {
  OpportunityFollowUpController,
  OpportunityFollowUpDiscoveryController,
} from './opportunity-follow-up/opportunity-follow-up.controller.js';
import { InternalTaskModule } from './internal-task/internal-task.module.js';
import { InternalTaskController } from './internal-task/internal-task.controller.js';
import { ProjectNextActionModule } from './project-next-action/project-next-action.module.js';
import { ProjectNextActionController } from './project-next-action/project-next-action.controller.js';
import { MissionApplicabilityModule } from './project-mission-applicability/mission-applicability.module.js';
import { MissionApplicabilityController } from './project-mission-applicability/mission-applicability.controller.js';
import {
  KnowledgeActorGuard,
  KnowledgeIdentityVerifier,
} from './knowledge/knowledge-identity.js';
import { KnowledgeModule } from './knowledge/knowledge.module.js';
import { KnowledgeWebController } from './knowledge/knowledge-web.controller.js';
import {
  KnowledgeController,
  KnowledgeReadController,
  KnowledgeAssignmentController,
} from './knowledge/knowledge.controller.js';
import { ProjectPdfBundleController } from './documents/project-pdf-bundle.controller.js';
import { MissionPlanCopyController } from './mission-plan/mission-plan-copy.controller.js';
import { MissionPlanModule } from './mission-plan/mission-plan.module.js';
import { MissionPlanController } from './mission-plan/mission-plan.controller.js';
import { IdeasController } from './ideas/ideas.controller.js';
import { IdeasModule } from './ideas/ideas.module.js';
import { CertificationController } from './certification/certification.controller.js';
import { CertificationModule } from './certification/certification.module.js';
import { OperationalRiskModule } from './operational-risk/operational-risk.module.js';
import { OperationalRiskController } from './operational-risk/operational-risk.controller.js';
import { DocumentContentController } from './documents/document-content.controller.js';
import { TaskResultsController } from './task/task-results.controller.js';
import { MissionResultReviewModule } from './project-mission-review/mission-result-review.module.js';
import { MissionResultReviewController } from './project-mission-review/mission-result-review.controller.js';
import { ProjectTemplateModule } from './project-template/project-template.module.js';
import { ProjectTemplateController } from './project-template/project-template.controller.js';
import { ContractAgreementsController } from './contract/contract-agreements.controller.js';
import { ContractModule } from './contract/contract.module.js';
import { ContractDecisionQueueController } from './contract/contract-decision-queue.controller.js';
import {
  ContractController,
  ProjectContractsController,
} from './contract/contract.controller.js';
import { OfferModelController } from './offer-model/offer-model.adapter.js';
import { ContractModelController } from './contract-model/contract-model.adapter.js';
import { CompanyModelModule } from './company-model/company-model.module.js';
import { TaskModule } from './task/task.module.js';
import { TaskController } from './task/task.controller.js';
import { DocumentProjectsController } from './documents/document-projects.controller.js';
import { ProjectController } from './project/project.controller.js';
import { ProjectResponsibilityController } from './project/project-responsibility.controller.js';
import { ProjectModule } from './project/project.module.js';
import { ProjectLifecycleController } from './project/project-lifecycle.controller.js';
import { ProjectLifecycleModule } from './project/project-lifecycle.module.js';
import { WorkspaceSessionRevocationController } from './access/workspace-session-revocation.controller.js';
import { WorkspaceSessionRevocationService } from './access/workspace-session-revocation.service.js';
import { DocumentsController } from './documents/documents.controller.js';
import { DocumentVersionsController } from './documents/document-versions.controller.js';
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
import { CommercialCatalogueModule } from './commercial-catalogue/commercial-catalogue.module.js';
import { CommercialCatalogueController } from './commercial-catalogue/commercial-catalogue.controller.js';
import { PricingConfigurationModule } from './pricing-configuration/pricing-configuration.module.js';
import { PricingConfigurationController } from './pricing-configuration/pricing-configuration.controller.js';
import { PricingSnapshotController } from './pricing-configuration/pricing-snapshot.controller.js';
import { OperationalHomeModule } from './operational-home/operational-home.module.js';
import { OperationalHomeController } from './operational-home/operational-home.controller.js';
import { OfferDecisionQueueController } from './offer/offer-decision-queue.controller.js';
import { OfferController } from './offer/offer.controller.js';
import { OfferModule } from './offer/offer.module.js';
import { ProfitabilityEstimateModule } from './profitability-estimate/profitability-estimate.module.js';
import { ProfitabilityDecisionQueueController } from './profitability-estimate/profitability-decision-queue.controller.js';
import { ProfitabilityEstimateController } from './profitability-estimate/profitability-estimate.controller.js';
@Module({
  imports: [
    WorkingEvidenceModule,
    PaymentModule,
    InvoiceRecordModule,
    KnowledgeModule,
    MissionPlanModule,
    CompanyModelModule,
    IdeasModule,
    CertificationModule,
    OperationalRiskModule,
    ProjectTemplateModule,
    MissionResultReviewModule,
    InternalTaskModule,
    OpportunityFollowUpModule,
    ProjectNextActionModule,
    MissionApplicabilityModule,
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
    WorkingEvidenceController,
    PaymentController,
    InvoiceRecordController,
    CompanyRoleAssignmentController,
    KnowledgeWebController,
    KnowledgeController,
    KnowledgeReadController,
    KnowledgeAssignmentController,
    ProjectPdfBundleController,
    MissionPlanController,
    MissionPlanCopyController,
    ContractModelController,
    OfferModelController,
    IdeasController,
    CertificationController,
    OperationalRiskController,
    ProjectTemplateController,
    MissionResultReviewController,
    OpportunityFollowUpController,
    OpportunityFollowUpDiscoveryController,
    ProjectNextActionController,
    MissionApplicabilityController,
    ProjectContractsController,
    TaskController,
    TaskResultsController,
    InternalTaskController,
    DocumentsController,
    DocumentVersionsController,
    DocumentContentController,
    DocumentProjectsController,
    ProjectController,
    ProjectResponsibilityController,
    ProjectLifecycleController,
    WorkspaceInvitationAcceptanceController,
    WorkspaceInvitationController,
    ClientUnionController,
    AccessController,
    ActivityLogController,
    ClientDuplicateReviewController,
    ClientController,
    CompanyController,
    WorkspaceMembershipSuspensionController,
    WorkspaceSessionRevocationController,
    CommercialIntakeController,
    SalesStageController,
    CommercialIntakeOpportunityController,
    CommercialCatalogueController,
    PricingConfigurationController,
    PricingSnapshotController,
    OperationalHomeController,
    OfferController,
    OfferDecisionQueueController,
    ContractDecisionQueueController,
    ContractController,
    ContractAgreementsController,
    ProfitabilityEstimateController,
    ProfitabilityDecisionQueueController,
  ],
  providers: [
    KnowledgeActorGuard,
    KnowledgeIdentityVerifier,
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
