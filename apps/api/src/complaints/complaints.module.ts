import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ClientModule } from '../client/client.module.js';
import { ServerClockModule } from '../clock/server-clock.js';
import { DatabaseModule } from '../database/database.module.js';
import { ProjectModule } from '../project/project.module.js';
import { ComplaintsService } from './complaints.service.js';

@Module({
  imports: [
    AccessModule,
    AccountabilityModule,
    ClientModule,
    ServerClockModule,
    DatabaseModule,
    ProjectModule,
  ],
  providers: [ComplaintsService],
  exports: [ComplaintsService],
})
export class ComplaintsModule {}
