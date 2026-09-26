import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ServerClockModule } from '../clock/server-clock.js';
import { CommercialCatalogueModule } from '../commercial-catalogue/commercial-catalogue.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { PricingConfigurationService } from './pricing-configuration.service.js';
import { TariffVersionService } from './tariff-version.service.js';

// Exports only the services its composed REST controller consumes. Offering
// readability is read through the catalogue module that owns offerings.
@Module({
  imports: [
    AccessModule,
    AccountabilityModule,
    CommercialCatalogueModule,
    DatabaseModule,
    ServerClockModule,
  ],
  providers: [PricingConfigurationService, TariffVersionService],
  exports: [PricingConfigurationService, TariffVersionService],
})
export class PricingConfigurationModule {}
