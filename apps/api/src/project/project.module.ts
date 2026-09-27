import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ClientModule } from '../client/client.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { ProjectClosedGuard } from './project-closed.guard.js';
import { ProjectResponsibilityService } from './project-responsibility.service.js';
import { ProjectService } from './project.service.js';
@Module({
  imports: [AccessModule, AccountabilityModule, ClientModule, DatabaseModule],
  providers: [ProjectClosedGuard, ProjectService, ProjectResponsibilityService],
  exports: [ProjectClosedGuard, ProjectService, ProjectResponsibilityService],
})
export class ProjectModule {}
