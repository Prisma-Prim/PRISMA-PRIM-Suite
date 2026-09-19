import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ClientModule } from '../client/client.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { ProjectModule } from '../project/project.module.js';
import { TaskService } from './task.service.js';
@Module({
  imports: [
    AccessModule,
    AccountabilityModule,
    ClientModule,
    DatabaseModule,
    ProjectModule,
  ],
  providers: [TaskService],
  exports: [TaskService],
})
export class TaskModule {}
