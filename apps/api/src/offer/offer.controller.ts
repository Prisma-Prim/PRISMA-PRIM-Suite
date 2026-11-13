import type { ServerResponse } from 'node:http';
import { readCommercialPdfAttachment } from '../commercial-pdf/commercial-pdf-read.js';
import { OfferPdfService } from './offer-pdf.service.js';
import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
  requireActorContext,
} from '../access/actor-context.adapter.js';
import { OfferService } from './offer.service.js';
import { EstimateOfferPreparationService } from './offer-estimate-preparation.service.js';

@Controller('offers/opportunities/:opportunityId')
@UseGuards(ActorContextAdapter)
export class OfferController {
  constructor(
    private readonly pdf: OfferPdfService,
    private readonly offers: OfferService,
    private readonly estimateOffers: EstimateOfferPreparationService,
  ) {}

  @Get('versions/:versionId/message-preparation')
  readMessagePreparation(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('versionId') versionId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: ServerResponse,
  ) {
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return this.offers.readMessagePreparation({
      actor: requireActorContext(request),
      opportunityId,
      versionId,
      query,
    });
  }

  @Get('versions/:versionId/pdf')
  async downloadPdf(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('versionId') versionId: string,
    @Query() query: unknown,
    @Res({ passthrough: true })
    response: ServerResponse,
  ) {
    return readCommercialPdfAttachment(response, (signal) =>
      this.pdf.read({
        actor: requireActorContext(request),
        opportunityId,
        versionId,
        query,
        signal,
      }),
    );
  }

  @Post('from-approved-model')
  createFromApprovedModel(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.estimateOffers.createFromModel({
      actor: requireActorContext(request),
      opportunityId,
      payload,
      key,
    });
  }

  @Post('versions/from-approved-model')
  createVersionFromApprovedModel(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.estimateOffers.createModelVersion({
      actor: requireActorContext(request),
      opportunityId,
      payload,
      key,
    });
  }

  @Post('from-approved-estimate')
  createFromApprovedEstimate(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.estimateOffers.create({
      actor: requireActorContext(request),
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
      actor: requireActorContext(request),
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
      requireActorContext(request),
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
    return {
      offer: await this.offers.read(
        requireActorContext(request),
        opportunityId,
      ),
    };
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
      actor: requireActorContext(request),
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
      actor: requireActorContext(request),
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
      actor: requireActorContext(request),
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
        requireActorContext(request),
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
      actor: requireActorContext(request),
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
      actor: requireActorContext(request),
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
      actor: requireActorContext(request),
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
      actor: requireActorContext(request),
      opportunityId,
      offerVersionId,
      payload,
      idempotencyKey,
      kind: 'REJECT',
    });
  }
}
