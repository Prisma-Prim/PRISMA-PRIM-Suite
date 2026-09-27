import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ClientModule } from '../client/client.module.js';
import { ServerClockModule } from '../clock/server-clock.js';
import { DatabaseModule } from '../database/database.module.js';
import { ProjectModule } from '../project/project.module.js';
import { ProjectOpenTaskQuery } from './project-open-task.query.js';
import { TaskService } from './task.service.js';
@Module({
  imports: [
    AccessModule,
    AccountabilityModule,
    ClientModule,
    DatabaseModule,
    ProjectModule,
    ServerClockModule,
  ],
  providers: [ProjectOpenTaskQuery, TaskService],
  exports: [ProjectOpenTaskQuery, TaskService],
})
export class TaskModule {}
