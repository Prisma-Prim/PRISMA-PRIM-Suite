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
import { MissionResultReviewService } from './mission-result-review.service.js';

@Controller('projects/:projectId/mission-result-reviews')
@UseGuards(ActorContextAdapter)
export class MissionResultReviewController {
  constructor(private readonly reviews: MissionResultReviewService) {}
  @Get()
  read(
    @Req() request: ActorContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    if (!request.actorContext) throw new ForbiddenException();
    return this.reviews.read(request.actorContext, projectId);
  }
  @Post()
  record(
    @Req() request: ActorContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    if (!request.actorContext) throw new ForbiddenException();
    return this.reviews.record(request.actorContext, projectId, body, key);
  }
  @Get('history')
  history(
    @Query() query: unknown,
    @Req() request: ActorContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    if (!request.actorContext) throw new ForbiddenException();
    return this.reviews.history(request.actorContext, projectId, query);
  }
}
