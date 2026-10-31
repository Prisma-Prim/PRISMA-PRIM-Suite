import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ClientModule } from '../client/client.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { ProjectModule } from '../project/project.module.js';
import { ProjectNextActionService } from './project-next-action.service.js';
import { ProjectNextActionStore } from './project-next-action.store.js';

@Module({
  imports: [
    AccessModule,
    AccountabilityModule,
    ClientModule,
    DatabaseModule,
    ProjectModule,
  ],
  providers: [ProjectNextActionStore, ProjectNextActionService],
  exports: [ProjectNextActionService],
})
export class ProjectNextActionModule {}
