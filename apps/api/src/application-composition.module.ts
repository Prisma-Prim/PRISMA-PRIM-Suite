import { Module } from '@nestjs/common';
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
import { DatabaseModule } from './database/database.module.js';

@Module({
  imports: [
    AccessModule,
    AccountabilityModule,
    ClientModule,
    CompanyModule,
    DatabaseModule,
  ],
  controllers: [
    AccessController,
    ActivityLogController,
    ClientDuplicateReviewController,
    ClientController,
    CompanyController,
    CompanyContextAssignmentController,
    CompanyDirectorClientAssignmentController,
    WorkspaceMembershipSuspensionController,
  ],
  providers: [
    AccessService,
    ActorContextAdapter,
    CompanyContextAssignmentService,
    WorkspaceMembershipSuspensionService,
  ],
  exports: [AccessService, ActorContextAdapter],
})
export class ApplicationCompositionModule {}
