import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { OfferService } from './offer.service.js';

@Controller('offers/opportunities/:opportunityId')
@UseGuards(ActorContextAdapter)
export class OfferController {
  constructor(private readonly offers: OfferService) {}

  @Post()
  create(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.offers.create(
      actorFrom(request),
      opportunityId,
      body,
      idempotencyKey,
    );
  }

  @Get()
  async read(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
  ) {
    return { offer: await this.offers.read(actorFrom(request), opportunityId) };
  }

  @Post('versions/:offerVersionId/quality-checks')
  runQualityChecks(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('offerVersionId') offerVersionId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.offers.runQualityChecks({
      actor: actorFrom(request),
      opportunityId,
      offerVersionId,
      payload,
      idempotencyKey,
    });
  }
}

function actorFrom(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
