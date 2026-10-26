import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ClientModule } from '../client/client.module.js';
import { ProjectModule } from '../project/project.module.js';
import { TaskModule } from '../task/task.module.js';
import { MissionResultReviewStore } from './mission-result-review.store.js';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { ProjectTemplateModule } from '../project-template/project-template.module.js';
import { MissionResultReviewService } from './mission-result-review.service.js';

@Module({
  imports: [
    DatabaseModule,
    ProjectTemplateModule,
    AccessModule,
    AccountabilityModule,
    ClientModule,
    ProjectModule,
    TaskModule,
  ],
  providers: [MissionResultReviewService, MissionResultReviewStore],
  exports: [MissionResultReviewService],
})
export class MissionResultReviewModule {}
