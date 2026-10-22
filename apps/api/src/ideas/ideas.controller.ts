import {
  Controller,
  ForbiddenException,
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
} from '../access/actor-context.adapter.js';
import { IdeasService } from './ideas.service.js';

@Controller('ideas')
@UseGuards(ActorContextAdapter)
export class IdeasController {
  constructor(private readonly ideas: IdeasService) {}

  @Get()
  list(@Req() request: ActorContextRequest, @Query() query: unknown) {
    if (!request.actorContext) throw new ForbiddenException();
    return this.ideas.list({ actor: request.actorContext, query });
  }
  @Post()
  record(
    @Req() request: ActorContextRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    if (!request.actorContext) throw new ForbiddenException();
    return this.ideas.record({ actor: request.actorContext, body, key });
  }
  @Get(':ideaId')
  detail(@Req() request: ActorContextRequest, @Param('ideaId') ideaId: string) {
    if (!request.actorContext) throw new ForbiddenException();
    return this.ideas.detail({ actor: request.actorContext, ideaId });
  }
  @Post(':ideaId/dispositions')
  recordDisposition(
    @Req() request: ActorContextRequest,
    @Param('ideaId') ideaId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    if (!request.actorContext) throw new ForbiddenException();
    return this.ideas.recordDisposition({
      actor: request.actorContext,
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
    if (!request.actorContext) throw new ForbiddenException();
    return this.ideas.history({ actor: request.actorContext, ideaId, query });
  }
}
