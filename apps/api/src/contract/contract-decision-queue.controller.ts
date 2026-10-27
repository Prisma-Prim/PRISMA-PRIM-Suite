import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { ContractDecisionQueueService } from './contract-decision-queue.service.js';

@Controller('contract-decision-queue')
@UseGuards(ActorContextAdapter)
export class ContractDecisionQueueController {
  constructor(private readonly queue: ContractDecisionQueueService) {}
  @Get()
  list(@Req() request: ActorContextRequest, @Query() query: unknown) {
    if (!request.actorContext) throw new ForbiddenException();
    return this.queue.list({ actor: request.actorContext, query });
  }
}
