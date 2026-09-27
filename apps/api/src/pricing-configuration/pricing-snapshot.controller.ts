import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { PricingSnapshotService } from './pricing-snapshot.service.js';

@Controller('pricing/opportunities/:opportunityId/snapshots')
@UseGuards(ActorContextAdapter)
export class PricingSnapshotController {
  constructor(private readonly snapshots: PricingSnapshotService) {}

  @Post()
  calculate(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.snapshots.calculate(
      actorFrom(request),
      opportunityId,
      body,
      idempotencyKey,
    );
  }

  @Get()
  list(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Query('cursor') cursor: unknown,
    @Query('limit') limit: unknown,
  ) {
    return this.snapshots.list(
      actorFrom(request),
      opportunityId,
      cursor,
      limit,
    );
  }

  // Direct identifiers are checked only after authority and Opportunity
  // readability, so malformed and inaccessible values share the safe 404.
  @Get(':snapshotId')
  read(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('snapshotId') snapshotId: string,
  ) {
    return this.snapshots.read({
      actor: actorFrom(request),
      opportunityId,
      snapshotId,
    });
  }
}

function actorFrom(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
