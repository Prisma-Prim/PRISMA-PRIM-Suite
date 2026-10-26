import { ProjectTemplateVersionService } from './project-template-version.service.js';
import { ProjectStageAccessService } from '../access/project-stage-access.service.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ClientModule } from '../client/client.module.js';
import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { ProjectTemplateAccessService } from '../access/project-template-access.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { ProjectModule } from '../project/project.module.js';
import { TaskModule } from '../task/task.module.js';
import { ProjectStageService } from './project-stage.service.js';
import { ProjectTemplateService } from './project-template.service.js';
import { MissionReadinessService } from './mission-readiness.service.js';

@Module({
  imports: [
    AccessModule,
    AccountabilityModule,
    ClientModule,
    DatabaseModule,
    ProjectModule,
    TaskModule,
  ],
  providers: [
    MissionReadinessService,
    ProjectTemplateAccessService,
    ProjectStageAccessService,
    ProjectTemplateService,
    ProjectTemplateVersionService,
    ProjectStageService,
  ],
  exports: [
    MissionReadinessService,
    ProjectTemplateService,
    ProjectStageService,
    ProjectTemplateVersionService,
  ],
})
export class ProjectTemplateModule {}
