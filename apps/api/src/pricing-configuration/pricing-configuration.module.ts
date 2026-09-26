import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ServerClockModule } from '../clock/server-clock.js';
import { CommercialCatalogueModule } from '../commercial-catalogue/commercial-catalogue.module.js';
import { CommercialIntakeModule } from '../commercial-intake/commercial-intake.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { PricingConfigurationService } from './pricing-configuration.service.js';
import { PricingSnapshotService } from './pricing-snapshot.service.js';
import { TariffVersionService } from './tariff-version.service.js';

// Exports only the services its composed REST controller consumes. Offering
// readability is read through the catalogue module that owns offerings.
@Module({
  imports: [
    AccessModule,
    AccountabilityModule,
    CommercialCatalogueModule,
    CommercialIntakeModule,
    DatabaseModule,
    ServerClockModule,
  ],
  providers: [
    PricingConfigurationService,
    PricingSnapshotService,
    TariffVersionService,
  ],
  exports: [
    PricingConfigurationService,
    PricingSnapshotService,
    TariffVersionService,
  ],
})
export class PricingConfigurationModule {}
