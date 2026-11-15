import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { currentActor, type CurrentActor } from './current-actor.js';
import {
  ActorContextAdapter,
  type ActorContextRequest,
  requireActorContext,
} from './actor-context.adapter.js';

@Controller('access')
export class AccessController {
  @Get('current-actor')
  @UseGuards(ActorContextAdapter)
  currentActor(@Req() request: ActorContextRequest): CurrentActor {
    return currentActor(requireActorContext(request));
  }
}
