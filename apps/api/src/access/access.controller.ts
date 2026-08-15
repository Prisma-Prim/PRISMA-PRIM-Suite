import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import type { ActorContext } from './access.types.js';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from './actor-context.adapter.js';

@Controller('access')
export class AccessController {
  @Get('current-actor')
  @UseGuards(ActorContextAdapter)
  currentActor(@Req() request: ActorContextRequest): ActorContext {
    return request.actorContext!;
  }
}
