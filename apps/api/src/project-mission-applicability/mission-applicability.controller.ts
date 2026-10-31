import {
  Body,
  Headers,
  Post,
  Query,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { MissionApplicabilityService } from './mission-applicability.service.js';

@Controller('projects/:projectId/mission-applicability')
@UseGuards(ActorContextAdapter)
export class MissionApplicabilityController {
  constructor(private readonly applicability: MissionApplicabilityService) {}
  @Get()
  read(
    @Req() request: ActorContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    if (!request.actorContext) throw new ForbiddenException();
    return this.applicability.read(
      request.actorContext,
      projectId.toLowerCase(),
    );
  }
  @Post()
  record(
    @Req() request: ActorContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    if (!request.actorContext) throw new ForbiddenException();
    return this.applicability.record(
      request.actorContext,
      projectId.toLowerCase(),
      body,
      key,
    );
  }
  @Get('history')
  history(
    @Query() query: unknown,
    @Req() request: ActorContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    if (!request.actorContext) throw new ForbiddenException();
    return this.applicability.history(
      request.actorContext,
      projectId.toLowerCase(),
      query,
    );
  }
}
