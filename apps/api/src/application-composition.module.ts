import { TaskModule } from './task/task.module.js';
import { TaskController } from './task/task.controller.js';
import { CompanyTaskManagerAssignmentController } from './access/company-task-manager-assignment.controller.js';
import { DocumentProjectsController } from './documents/document-projects.controller.js';
import { CompanyDocumentProjectOrganizerAssignmentController } from './access/company-document-project-organizer-assignment.controller.js';
import { ProjectController } from './project/project.controller.js';
import { ProjectModule } from './project/project.module.js';
import { CompanyProjectAssignmentController } from './access/company-project-assignment.controller.js';
import { WorkspaceSessionRevocationController } from './access/workspace-session-revocation.controller.js';
import { WorkspaceSessionRevocationService } from './access/workspace-session-revocation.service.js';
import { CompanyDocumentRegistrarAssignmentController } from './access/company-document-registrar-assignment.controller.js';
import { DocumentsController } from './documents/documents.controller.js';
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
import { AccessService } from './access/access.service.js';
import { ActorContextAdapter } from './access/actor-context.adapter.js';
import { CompanyContextAssignmentController } from './access/company-context-assignment.controller.js';
import { CompanyDirectorClientAssignmentController } from './access/company-director-client-assignment.controller.js';
import { CompanyContextAssignmentService } from './access/company-context-assignment.service.js';
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
import { CompanyPricingConfigurationAssignmentController } from './access/company-pricing-configuration-assignment.controller.js';
import { CompanyCommercialActivityReaderAssignmentController } from './access/company-commercial-activity-reader-assignment.controller.js';

@Module({
  imports: [
    TaskModule,
    DocumentsModule,
    ProjectModule,
    AccessModule,
    AccountabilityModule,
    ClientModule,
    CompanyModule,
    DatabaseModule,
    CommercialIntakeModule,
    CommercialCatalogueModule,
    PricingConfigurationModule,
  ],
  controllers: [
    TaskController,
    CompanyTaskManagerAssignmentController,
    DocumentsController,
    DocumentProjectsController,
    CompanyDocumentRegistrarAssignmentController,
    CompanyDocumentProjectOrganizerAssignmentController,
    ProjectController,
    CompanyProjectAssignmentController,
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
    CommercialIntakeOpportunityController,
    CompanyCommercialIntakeAssignmentController,
    CommercialCatalogueController,
    CompanyServiceCatalogueAssignmentController,
    PricingConfigurationController,
    CompanyPricingConfigurationAssignmentController,
    CompanyCommercialActivityReaderAssignmentController,
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
    AccessService,
    ActorContextAdapter,
    CompanyContextAssignmentService,
    WorkspaceMembershipSuspensionService,
    WorkspaceSessionRevocationService,
  ],
  exports: [AccessService, ActorContextAdapter],
})
export class ApplicationCompositionModule {}
