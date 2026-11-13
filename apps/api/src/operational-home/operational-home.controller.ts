import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
  requireActorContext,
} from '../access/actor-context.adapter.js';
import { OperationalHomeService } from './operational-home.service.js';
import type { OperationalHomeView } from './operational-home.types.js';

@Controller('operational-home')
@UseGuards(ActorContextAdapter)
export class OperationalHomeController {
  constructor(private readonly home: OperationalHomeService) {}

  @Get()
  read(
    @Req() request: ActorContextRequest,
    @Query() query: unknown,
  ): Promise<OperationalHomeView> {
    return this.home.read(requireActorContext(request), query);
  }
}
