import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ServerClockModule } from '../clock/server-clock.js';
import { DatabaseModule } from '../database/database.module.js';
import { OperationalRiskService } from './operational-risk.service.js';

@Module({
  imports: [
    DatabaseModule,
    AccessModule,
    AccountabilityModule,
    ServerClockModule,
  ],
  providers: [OperationalRiskService],
  exports: [OperationalRiskService],
})
export class OperationalRiskModule {}
