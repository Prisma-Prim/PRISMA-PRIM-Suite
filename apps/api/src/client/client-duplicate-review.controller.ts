import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
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
  ClientDuplicateReviewPage,
  ClientDuplicateReviewPageRequest,
} from './client-duplicate-review.types.js';

const DEFAULT_DUPLICATE_REVIEW_PAGE_SIZE = 20;
const MAX_DUPLICATE_REVIEW_PAGE_SIZE = 20;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

@Controller('client-duplicate-reviews')
@UseGuards(ActorContextAdapter)
export class ClientDuplicateReviewController {
  constructor(private readonly reviews: ClientDuplicateReviewService) {}

  @Get()
  list(
    @Req() request: ActorContextRequest,
    @Query('page_size') pageSize: unknown,
    @Query('cursor') cursor: unknown,
  ): Promise<ClientDuplicateReviewPage> {
    return this.reviews.list(
      request.actorContext!,
      duplicateReviewPageRequest({ pageSize, cursor }),
    );
  }

  @Get(':duplicateReviewReference')
  read(
    @Req() request: ActorContextRequest,
    @Param('duplicateReviewReference', new ParseUUIDPipe()) reference: string,
  ): Promise<ClientDuplicateReviewDetail> {
    return this.reviews.read(request.actorContext!, reference);
  }
}

function duplicateReviewPageRequest({
  pageSize,
  cursor,
}: {
  pageSize: unknown;
  cursor: unknown;
}): ClientDuplicateReviewPageRequest {
  return {
    pageSize: duplicateReviewPageSize(pageSize),
    cursor: duplicateReviewCursor(cursor),
  };
}

function duplicateReviewPageSize(value: unknown): number {
  if (value === undefined) return DEFAULT_DUPLICATE_REVIEW_PAGE_SIZE;
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/u.test(value)) {
    throw invalidPaginationQuery();
  }
  const pageSize = Number(value);
  if (
    !Number.isSafeInteger(pageSize) ||
    pageSize > MAX_DUPLICATE_REVIEW_PAGE_SIZE
  ) {
    throw invalidPaginationQuery();
  }
  return pageSize;
}

function duplicateReviewCursor(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !UUID_V4.test(value)) {
    throw invalidPaginationQuery();
  }
  return value.toLowerCase();
}

function invalidPaginationQuery(): BadRequestException {
  return new BadRequestException('Invalid duplicate-review pagination query.');
}
