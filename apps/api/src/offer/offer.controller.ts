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
import { OfferService } from './offer.service.js';
import { EstimateOfferPreparationService } from './offer-estimate-preparation.service.js';

@Controller('offers/opportunities/:opportunityId')
@UseGuards(ActorContextAdapter)
export class OfferController {
  constructor(
    private readonly offers: OfferService,
    private readonly estimateOffers: EstimateOfferPreparationService,
  ) {}

  @Post('from-approved-estimate')
  createFromApprovedEstimate(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.estimateOffers.create({
      actor: actorFrom(request),
      opportunityId,
      payload,
      key,
    });
  }

  @Post('versions/from-approved-estimate')
  createVersionFromApprovedEstimate(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.estimateOffers.createVersion({
      actor: actorFrom(request),
      opportunityId,
      payload,
      key,
    });
  }

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

  @Post('versions')
  createVersion(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.offers.createVersion({
      actor: actorFrom(request),
      opportunityId,
      payload,
      idempotencyKey,
    });
  }

  @Get('versions')
  listVersions(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Query('cursor') cursor: string | undefined,
    @Query('limit') limit: string | undefined,
  ) {
    return this.offers.listVersions({
      actor: actorFrom(request),
      opportunityId,
      cursor,
      limit,
    });
  }

  @Get('versions/:offerVersionId')
  async readVersion(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('offerVersionId') offerVersionId: string,
  ) {
    return {
      offer: await this.offers.read(
        actorFrom(request),
        opportunityId,
        offerVersionId,
      ),
    };
  }

  @Post('versions/:offerVersionId/approve')
  approve(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('offerVersionId') offerVersionId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.offers.decide({
      actor: actorFrom(request),
      opportunityId,
      offerVersionId,
      payload,
      idempotencyKey,
      kind: 'APPROVE',
    });
  }

  @Post('versions/:offerVersionId/transmission')
  recordTransmission(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('offerVersionId') offerVersionId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.offers.recordTransmission({
      actor: actorFrom(request),
      opportunityId,
      offerVersionId,
      payload,
      idempotencyKey,
    });
  }

  @Post('versions/:offerVersionId/client-response')
  recordClientResponse(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('offerVersionId') offerVersionId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.offers.recordClientResponse({
      actor: actorFrom(request),
      opportunityId,
      offerVersionId,
      payload,
      idempotencyKey,
    });
  }

  @Post('versions/:offerVersionId/reject')
  reject(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('offerVersionId') offerVersionId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.offers.decide({
      actor: actorFrom(request),
      opportunityId,
      offerVersionId,
      payload,
      idempotencyKey,
      kind: 'REJECT',
    });
  }
}

function actorFrom(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
