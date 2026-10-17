import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { ProjectTemplateAccessService } from '../access/project-template-access.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { ProjectModule } from '../project/project.module.js';
import { TaskModule } from '../task/task.module.js';
import { ProjectTemplateService } from './project-template.service.js';

@Module({
  imports: [AccessModule, DatabaseModule, ProjectModule, TaskModule],
  providers: [ProjectTemplateAccessService, ProjectTemplateService],
  exports: [ProjectTemplateService],
})
export class ProjectTemplateModule {}
