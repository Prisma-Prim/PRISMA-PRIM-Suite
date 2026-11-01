import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { CommercialIntakeModule } from '../commercial-intake/commercial-intake.module.js';
import { OpportunityFollowUpService } from './opportunity-follow-up.service.js';
import { OpportunityFollowUpStore } from './opportunity-follow-up.store.js';
@Module({
  imports: [AccessModule, DatabaseModule, CommercialIntakeModule],
  providers: [OpportunityFollowUpService, OpportunityFollowUpStore],
  exports: [OpportunityFollowUpService],
})
export class OpportunityFollowUpModule {}
