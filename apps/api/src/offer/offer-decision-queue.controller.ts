import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
  requireActorContext,
} from '../access/actor-context.adapter.js';
import { OfferDecisionQueueService } from './offer-decision-queue.service.js';

@Controller('offer-decision-queue')
@UseGuards(ActorContextAdapter)
export class OfferDecisionQueueController {
  constructor(private readonly queue: OfferDecisionQueueService) {}
  @Get()
  list(@Req() request: ActorContextRequest, @Query() query: unknown) {
    return this.queue.list({ actor: requireActorContext(request), query });
  }
}
