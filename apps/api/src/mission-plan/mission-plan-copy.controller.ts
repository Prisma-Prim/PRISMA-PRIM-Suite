import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { MissionPlanCopyService } from './mission-plan-copy.service.js';
@Controller('projects')
@UseGuards(ActorContextAdapter)
export class MissionPlanCopyController {
  constructor(private readonly plans: MissionPlanCopyService) {}
  @Post('from-mission-plan') create(
    @Req() r: ActorContextRequest,
    @Body() payload: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.plans.create({ actor: actor(r), payload, key });
  }
  @Get(':projectId/mission-plan') read(
    @Req() r: ActorContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.plans.read({ actor: actor(r), projectId });
  }
}
function actor(r: ActorContextRequest) {
  if (!r.actorContext) throw new ForbiddenException();
  return r.actorContext;
}
