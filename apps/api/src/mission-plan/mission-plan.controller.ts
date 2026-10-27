import {
  Body,
  Controller,
  ForbiddenException,
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
} from '../access/actor-context.adapter.js';
import { MissionPlanService } from './mission-plan.service.js';
@Controller('mission-plans')
@UseGuards(ActorContextAdapter)
export class MissionPlanController {
  constructor(private readonly plans: MissionPlanService) {}
  @Get() catalogue(@Req() r: ActorContextRequest, @Query() query: unknown) {
    return this.plans.catalogue({ actor: actor(r), query });
  }
  @Post() publish(
    @Req() r: ActorContextRequest,
    @Body() payload: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.plans.publish({ actor: actor(r), payload, key });
  }
  @Get(':planId/versions') history(
    @Req() r: ActorContextRequest,
    @Param('planId', new ParseUUIDPipe()) planId: string,
    @Query() query: unknown,
  ) {
    return this.plans.history({ actor: actor(r), planId, query });
  }
  @Post(':planId/versions') successor(
    @Req() r: ActorContextRequest,
    @Param('planId', new ParseUUIDPipe()) planId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.plans.publish({ actor: actor(r), payload, key, planId });
  }
  @Get(':planId/versions/:versionId') read(
    @Req() r: ActorContextRequest,
    @Param('planId', new ParseUUIDPipe()) planId: string,
    @Param('versionId', new ParseUUIDPipe()) versionId: string,
  ) {
    return this.plans.read({ actor: actor(r), planId, versionId });
  }
}
function actor(r: ActorContextRequest) {
  if (!r.actorContext) throw new ForbiddenException();
  return r.actorContext;
}
