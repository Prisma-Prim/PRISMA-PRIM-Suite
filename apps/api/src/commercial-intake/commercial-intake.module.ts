import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ClientModule } from '../client/client.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { CommercialIntakeService } from './commercial-intake.service.js';

@Module({
  imports: [AccessModule, AccountabilityModule, ClientModule, DatabaseModule],
  providers: [CommercialIntakeService],
  exports: [CommercialIntakeService],
})
export class CommercialIntakeModule {}
