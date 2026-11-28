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
import { AffaireService } from './affaire.service.js';

/**
 * Read-only affaires (#1533): a page of affaires with their current stage,
 * and one affaire's seven-stage thread keyed by its Opportunity. Commands
 * stay with each stage owner.
 */
@Controller('affaires')
@UseGuards(ActorContextAdapter)
export class AffaireController {
  constructor(private readonly affaires: AffaireService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(
    @Req() request: ActorContextRequest,
    @Query('limit') limit: unknown,
    @Query('cursor') cursor: unknown,
    @Query() viewQuery: unknown,
  ) {
    return this.affaires.list(requireActorContext(request), {
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
    return this.affaires.detail(requireActorContext(request), opportunityId);
  }
}
