import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ClientModule } from '../client/client.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { TaskModule } from '../task/task.module.js';
import { ProjectModule } from './project.module.js';
import { ProjectLifecycleService } from './project-lifecycle.service.js';

// Separate from ProjectModule, which Task and Documents import, so the
// lifecycle can later consume a Task-owned query without a module cycle.
@Module({
  imports: [
    AccessModule,
    AccountabilityModule,
    ClientModule,
    DatabaseModule,
    ProjectModule,
    TaskModule,
  ],
  providers: [ProjectLifecycleService],
  exports: [ProjectLifecycleService],
})
export class ProjectLifecycleModule {}
