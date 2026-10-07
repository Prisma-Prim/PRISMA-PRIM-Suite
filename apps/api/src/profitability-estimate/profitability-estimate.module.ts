import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ServerClockModule } from '../clock/server-clock.js';
import { CommercialIntakeModule } from '../commercial-intake/commercial-intake.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { ProfitabilityEstimateService } from './profitability-estimate.service.js';

@Module({
  imports: [
    AccessModule,
    AccountabilityModule,
    ServerClockModule,
    CommercialIntakeModule,
    DatabaseModule,
  ],
  providers: [ProfitabilityEstimateService],
  exports: [ProfitabilityEstimateService],
})
export class ProfitabilityEstimateModule {}
