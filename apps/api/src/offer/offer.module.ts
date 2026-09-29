import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ClientModule } from '../client/client.module.js';
import { ServerClockModule } from '../clock/server-clock.js';
import { CommercialIntakeModule } from '../commercial-intake/commercial-intake.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { PricingConfigurationModule } from '../pricing-configuration/pricing-configuration.module.js';
import { OfferService } from './offer.service.js';

@Module({
  imports: [
    AccessModule,
    AccountabilityModule,
    ClientModule,
    CommercialIntakeModule,
    DatabaseModule,
    PricingConfigurationModule,
    ServerClockModule,
  ],
  providers: [OfferService],
  exports: [OfferService],
})
export class OfferModule {}
