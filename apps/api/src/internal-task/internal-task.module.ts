import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { ServerClockModule } from '../clock/server-clock.js';
import { InternalTaskService } from './internal-task.service.js';
import { InternalTaskStore } from './internal-task.store.js';
@Module({
  imports: [
    AccessModule,
    AccountabilityModule,
    DatabaseModule,
    ServerClockModule,
  ],
  providers: [InternalTaskService, InternalTaskStore],
  exports: [InternalTaskService],
})
export class InternalTaskModule {}
