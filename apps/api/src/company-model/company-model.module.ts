import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ServerClockModule } from '../clock/server-clock.js';
import { ContractModelService } from '../contract-model/contract-model.adapter.js';
import { DatabaseModule } from '../database/database.module.js';
import { OfferModelService } from '../offer-model/offer-model.adapter.js';

/** Every Company model kind's lifecycle, one adapter per kind. */
@Module({
  imports: [
    AccessModule,
    AccountabilityModule,
    ServerClockModule,
    DatabaseModule,
  ],
  providers: [OfferModelService, ContractModelService],
  exports: [OfferModelService, ContractModelService],
})
export class CompanyModelModule {}
