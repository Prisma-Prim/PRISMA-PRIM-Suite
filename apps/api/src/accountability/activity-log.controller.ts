import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { AccountabilityService } from './accountability.service.js';
import type { ActivityLogPage } from './accountability.types.js';

@Controller('activity-log')
export class ActivityLogController {
  constructor(private readonly accountability: AccountabilityService) {}

  @Get()
  @UseGuards(ActorContextAdapter)
  list(@Req() request: ActorContextRequest): Promise<ActivityLogPage> {
    return this.accountability.listForActor(request.actorContext!);
  }
}
