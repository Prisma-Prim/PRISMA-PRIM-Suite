import {
  Controller,
  ForbiddenException,
  Get,
  Header,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { KnowledgeService } from './knowledge.service.js';

/** Ordinary web identity is admitted only at these three forwarding adapters. */
@Controller('knowledge/evidence')
@UseGuards(ActorContextAdapter)
export class KnowledgeWebController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get('sources')
  @Header('Cache-Control', 'private, no-store')
  list(@Req() request: ActorContextRequest, @Query() query: unknown) {
    return this.knowledge.list(actor(request), query);
  }

  @Get('search')
  @Header('Cache-Control', 'private, no-store')
  search(@Req() request: ActorContextRequest, @Query() query: unknown) {
    return this.knowledge.search(actor(request), query);
  }

  @Get('sources/:sourceId/passages/:locator')
  @Header('Cache-Control', 'private, no-store')
  passage(
    @Req() request: ActorContextRequest,
    @Param('sourceId') sourceId: string,
    @Param('locator') locator: string,
    @Query() query: unknown,
  ) {
    return this.knowledge.getPassage(actor(request), sourceId, locator, query);
  }
}

function actor(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
