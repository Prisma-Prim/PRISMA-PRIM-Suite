import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { ClientDuplicateReviewService } from './client-duplicate-review.service.js';
import type {
  ClientDuplicateReviewDetail,
  ClientDuplicateReviewListItem,
} from './client-duplicate-review.types.js';

@Controller('client-duplicate-reviews')
@UseGuards(ActorContextAdapter)
export class ClientDuplicateReviewController {
  constructor(private readonly reviews: ClientDuplicateReviewService) {}

  @Get()
  list(
    @Req() request: ActorContextRequest,
  ): Promise<ClientDuplicateReviewListItem[]> {
    return this.reviews.list(request.actorContext!);
  }

  @Get(':duplicateReviewReference')
  read(
    @Req() request: ActorContextRequest,
    @Param('duplicateReviewReference', new ParseUUIDPipe()) reference: string,
  ): Promise<ClientDuplicateReviewDetail> {
    return this.reviews.read(request.actorContext!, reference);
  }
}
