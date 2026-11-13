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
    return this.reviews.read(requireActorContext(request), projectId);
  }
  @Post()
  record(
    @Req() request: ActorContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.reviews.record(
      requireActorContext(request),
      projectId,
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
    return this.reviews.history(requireActorContext(request), projectId, query);
  }
}
