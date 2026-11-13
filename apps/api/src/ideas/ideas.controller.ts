import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
  requireActorContext,
} from '../access/actor-context.adapter.js';
import { IdeasService } from './ideas.service.js';

@Controller('ideas')
@UseGuards(ActorContextAdapter)
export class IdeasController {
  constructor(private readonly ideas: IdeasService) {}

  @Get()
  list(@Req() request: ActorContextRequest, @Query() query: unknown) {
    return this.ideas.list({ actor: requireActorContext(request), query });
  }
  @Post()
  record(
    @Req() request: ActorContextRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.ideas.record({
      actor: requireActorContext(request),
      body,
      key,
    });
  }
  @Get(':ideaId')
  detail(@Req() request: ActorContextRequest, @Param('ideaId') ideaId: string) {
    return this.ideas.detail({ actor: requireActorContext(request), ideaId });
  }
  @Post(':ideaId/dispositions')
  recordDisposition(
    @Req() request: ActorContextRequest,
    @Param('ideaId') ideaId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.ideas.recordDisposition({
      actor: requireActorContext(request),
      ideaId,
      body,
      key,
    });
  }

  @Get(':ideaId/dispositions')
  history(
    @Req() request: ActorContextRequest,
    @Param('ideaId') ideaId: string,
    @Query() query: unknown,
  ) {
    return this.ideas.history({
      actor: requireActorContext(request),
      ideaId,
      query,
    });
  }
}
