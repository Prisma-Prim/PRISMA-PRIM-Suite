import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ServerClockModule } from '../clock/server-clock.js';
import { DatabaseModule } from '../database/database.module.js';
import { OfferModelService } from './offer-model.service.js';

@Module({
  imports: [
    AccessModule,
    AccountabilityModule,
    ServerClockModule,
    DatabaseModule,
  ],
  providers: [OfferModelService],
  exports: [OfferModelService],
})
export class OfferModelModule {}
