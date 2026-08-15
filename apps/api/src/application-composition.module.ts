import { Module } from '@nestjs/common';
import { AccessController } from './access/access.controller.js';
import { AccessModule } from './access/access.module.js';
import { AccessService } from './access/access.service.js';
import { ACTIVE_COMPANY_CONTEXT_LOOKUP } from './access/active-company-context.port.js';
import { ActorContextAdapter } from './access/actor-context.adapter.js';
import { AccountabilityModule } from './accountability/accountability.module.js';
import { ActivityLogController } from './accountability/activity-log.controller.js';
import { CompanyController } from './company/company.controller.js';
import { CompanyModule } from './company/company.module.js';
import { PostgresActiveCompanyContextLookup } from './company/postgres-active-company-context.lookup.js';
import { DatabaseModule } from './database/database.module.js';

@Module({
  imports: [AccessModule, AccountabilityModule, CompanyModule, DatabaseModule],
  controllers: [AccessController, ActivityLogController, CompanyController],
  providers: [
    AccessService,
    ActorContextAdapter,
    {
      provide: ACTIVE_COMPANY_CONTEXT_LOOKUP,
      useExisting: PostgresActiveCompanyContextLookup,
    },
  ],
  exports: [AccessService, ActorContextAdapter],
})
export class ApplicationCompositionModule {}
