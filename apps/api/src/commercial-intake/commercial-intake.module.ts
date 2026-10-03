import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ClientModule } from '../client/client.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { CommercialIntakeService } from './commercial-intake.service.js';
import { RequestClientAssociationService } from './request-client-association.service.js';

@Module({
  imports: [AccessModule, AccountabilityModule, ClientModule, DatabaseModule],
  providers: [CommercialIntakeService, RequestClientAssociationService],
  exports: [CommercialIntakeService, RequestClientAssociationService],
})
export class CommercialIntakeModule {}
