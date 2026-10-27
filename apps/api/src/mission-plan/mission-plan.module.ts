import { ProjectModule } from '../project/project.module.js';
import { TaskModule } from '../task/task.module.js';
import { MissionPlanCopyService } from './mission-plan-copy.service.js';
import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { ServerClockModule } from '../clock/server-clock.js';
import { MissionPlanService } from './mission-plan.service.js';
@Module({
  imports: [
    ProjectModule,
    TaskModule,
    AccessModule,
    AccountabilityModule,
    DatabaseModule,
    ServerClockModule,
  ],
  providers: [MissionPlanService, MissionPlanCopyService],
  exports: [MissionPlanService, MissionPlanCopyService],
})
export class MissionPlanModule {}
