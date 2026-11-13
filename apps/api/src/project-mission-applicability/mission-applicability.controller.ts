import {
  Body,
  Headers,
  Post,
  Query,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
  requireActorContext,
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
    return this.applicability.read(
      requireActorContext(request),
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
    return this.applicability.record(
      requireActorContext(request),
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
    return this.applicability.history(
      requireActorContext(request),
      projectId.toLowerCase(),
      query,
    );
  }
}
