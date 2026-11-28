import {
  Controller,
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
  requireActorContext,
} from '../access/actor-context.adapter.js';
import { DealService } from './deal.service.js';

/**
 * Read-only deals (#1533): a page of deals with their current stage,
 * and one deal's seven-stage thread keyed by its Opportunity. Commands
 * stay with each stage owner.
 */
@Controller('deals')
@UseGuards(ActorContextAdapter)
export class DealController {
  constructor(private readonly deals: DealService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(
    @Req() request: ActorContextRequest,
    @Query('limit') limit: unknown,
    @Query('cursor') cursor: unknown,
    @Query() viewQuery: unknown,
  ) {
    return this.deals.list(requireActorContext(request), {
      limit,
      cursor,
      viewQuery,
    });
  }

  @Get(':opportunityId')
  @Header('Cache-Control', 'private, no-store')
  detail(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
  ) {
    return this.deals.detail(requireActorContext(request), opportunityId);
  }
}
