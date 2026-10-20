import { DatabaseModule } from '../database/database.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ServerClockModule } from '../clock/server-clock.js';
import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { IdeasService } from './ideas.service.js';

@Module({
  imports: [
    AccessModule,
    DatabaseModule,
    AccountabilityModule,
    ServerClockModule,
  ],
  providers: [IdeasService],
  exports: [IdeasService],
})
export class IdeasModule {}
