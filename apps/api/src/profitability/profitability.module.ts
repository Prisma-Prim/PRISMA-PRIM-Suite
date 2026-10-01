import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { CommercialIntakeModule } from '../commercial-intake/commercial-intake.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { ProfitabilityService } from './profitability.service.js';

@Module({
  imports: [
    AccessModule,
    AccountabilityModule,
    CommercialIntakeModule,
    DatabaseModule,
  ],
  providers: [ProfitabilityService],
  exports: [ProfitabilityService],
})
export class ProfitabilityModule {}
