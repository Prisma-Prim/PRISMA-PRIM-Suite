import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
  requireActorContext,
} from '../access/actor-context.adapter.js';
import { MissionPlanCopyService } from './mission-plan-copy.service.js';
import { MissionPlanCurrentWorkService } from './mission-plan-current-work.service.js';
@Controller('projects')
@UseGuards(ActorContextAdapter)
export class MissionPlanCopyController {
  constructor(
    private readonly plans: MissionPlanCopyService,
    private readonly currentWork: MissionPlanCurrentWorkService,
  ) {}
  @Get(':projectId/mission-plan/current-work') current(
    @Req() r: ActorContextRequest,
    @Param('projectId') projectId: string,
    @Query() query: unknown,
  ) {
    return this.currentWork.read({
      actor: requireActorContext(r),
      projectId,
      query,
    });
  }
  @Post('from-mission-plan') create(
    @Req() r: ActorContextRequest,
    @Body() payload: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.plans.create({ actor: requireActorContext(r), payload, key });
  }
  @Get(':projectId/mission-plan') read(
    @Req() r: ActorContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.plans.read({ actor: requireActorContext(r), projectId });
  }
}
