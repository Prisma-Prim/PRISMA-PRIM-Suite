import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ClientModule } from '../client/client.module.js';
import { ServerClockModule } from '../clock/server-clock.js';
import { CommercialIntakeModule } from '../commercial-intake/commercial-intake.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { OfferModule } from '../offer/offer.module.js';
import { PricingConfigurationModule } from '../pricing-configuration/pricing-configuration.module.js';
import { ContractService } from './contract.service.js';
@Module({
  imports: [
    AccessModule,
    AccountabilityModule,
    ClientModule,
    CommercialIntakeModule,
    DatabaseModule,
    OfferModule,
    PricingConfigurationModule,
    ServerClockModule,
  ],
  providers: [ContractService],
  exports: [ContractService],
})
export class ContractModule {}
