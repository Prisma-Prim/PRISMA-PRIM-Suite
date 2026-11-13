import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
  requireActorContext,
} from '../access/actor-context.adapter.js';
import { ContractDecisionQueueService } from './contract-decision-queue.service.js';

@Controller('contract-decision-queue')
@UseGuards(ActorContextAdapter)
export class ContractDecisionQueueController {
  constructor(private readonly queue: ContractDecisionQueueService) {}
  @Get()
  list(@Req() request: ActorContextRequest, @Query() query: unknown) {
    return this.queue.list({ actor: requireActorContext(request), query });
  }
}
