import { OfferModelModule } from '../offer-model/offer-model.module.js';
import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ClientModule } from '../client/client.module.js';
import { ServerClockModule } from '../clock/server-clock.js';
import { CommercialIntakeModule } from '../commercial-intake/commercial-intake.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { PricingConfigurationModule } from '../pricing-configuration/pricing-configuration.module.js';
import { OfferService } from './offer.service.js';
import { ProfitabilityEstimateModule } from '../profitability-estimate/profitability-estimate.module.js';
import { EstimateOfferPreparationService } from './offer-estimate-preparation.service.js';

@Module({
  imports: [
    AccessModule,
    OfferModelModule,
    AccountabilityModule,
    ClientModule,
    CommercialIntakeModule,
    DatabaseModule,
    PricingConfigurationModule,
    ProfitabilityEstimateModule,
    ServerClockModule,
  ],
  providers: [OfferService, EstimateOfferPreparationService],
  exports: [OfferService, EstimateOfferPreparationService],
})
export class OfferModule {}
