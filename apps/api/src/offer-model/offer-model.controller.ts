import {
  Body,
  Controller,
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
  requireActorContext,
} from '../access/actor-context.adapter.js';
import { OfferModelService } from './offer-model.service.js';

@Controller('offer-models/consulting-ro')
@UseGuards(ActorContextAdapter)
export class OfferModelController {
  constructor(private readonly models: OfferModelService) {}

  @Get()
  read(@Req() request: ActorContextRequest) {
    return this.models.read({ actor: requireActorContext(request) });
  }
  @Get('for-offer')
  readSelectionForOffer(@Req() request: ActorContextRequest) {
    return this.models.readSelectionForOffer({
      actor: requireActorContext(request),
    });
  }
  @Get('versions')
  history(@Req() request: ActorContextRequest, @Query() query: unknown) {
    return this.models.history({ actor: requireActorContext(request), query });
  }
  @Get('versions/:versionId')
  readVersion(
    @Req() request: ActorContextRequest,
    @Param('versionId') versionId: string,
  ) {
    return this.models.readVersion({
      actor: requireActorContext(request),
      versionId,
    });
  }
  @Post('versions')
  submit(
    @Req() request: ActorContextRequest,
    @Body() payload: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.models.submit({
      actor: requireActorContext(request),
      payload,
      key,
    });
  }
  @Post('versions/:versionId/decision')
  decide(
    @Req() request: ActorContextRequest,
    @Param('versionId') versionId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.models.decide({
      actor: requireActorContext(request),
      versionId,
      payload,
      key,
    });
  }
  @Post('versions/:versionId/withdrawal')
  withdraw(
    @Req() request: ActorContextRequest,
    @Param('versionId') versionId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.models.withdraw({
      actor: requireActorContext(request),
      versionId,
      payload,
      key,
    });
  }
}
