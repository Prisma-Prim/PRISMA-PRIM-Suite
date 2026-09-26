import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ServerClockModule } from '../clock/server-clock.js';
import { DatabaseModule } from '../database/database.module.js';
import { PricingConfigurationService } from './pricing-configuration.service.js';

// Exports only the service its composed REST controller consumes.
@Module({
  imports: [
    AccessModule,
    AccountabilityModule,
    DatabaseModule,
    ServerClockModule,
  ],
  providers: [PricingConfigurationService],
  exports: [PricingConfigurationService],
})
export class PricingConfigurationModule {}
