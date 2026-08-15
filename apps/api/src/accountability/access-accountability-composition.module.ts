import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { ExternalPrincipalAdapter } from '../access/external-principal.adapter.js';
import { AccountabilityModule } from './accountability.module.js';
import { ActivityLogController } from './activity-log.controller.js';

@Module({
  imports: [AccessModule, AccountabilityModule],
  controllers: [ActivityLogController],
  providers: [ExternalPrincipalAdapter],
})
export class AccessAccountabilityCompositionModule {}
