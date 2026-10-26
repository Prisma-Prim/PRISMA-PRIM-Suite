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
import { ProfitabilityDecisionQueueService } from './profitability-decision-queue.service.js';

@Controller('profitability-estimate-decision-queue')
@UseGuards(ActorContextAdapter)
export class ProfitabilityDecisionQueueController {
  constructor(private readonly queue: ProfitabilityDecisionQueueService) {}
  @Get()
  list(@Req() request: ActorContextRequest, @Query() query: unknown) {
    if (!request.actorContext) throw new ForbiddenException();
    return this.queue.list({
      actor: request.actorContext,
      query,
    });
  }
}
