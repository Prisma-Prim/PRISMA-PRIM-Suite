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
import { OfferModelService } from './offer-model.service.js';

@Controller('offer-models/consulting-ro')
@UseGuards(ActorContextAdapter)
export class OfferModelController {
  constructor(private readonly models: OfferModelService) {}

  @Get()
  read(@Req() request: ActorContextRequest) {
    return this.models.read({ actor: actorFrom(request) });
  }
  @Get('for-offer')
  readSelectionForOffer(@Req() request: ActorContextRequest) {
    return this.models.readSelectionForOffer({ actor: actorFrom(request) });
  }
  @Get('versions')
  history(@Req() request: ActorContextRequest, @Query() query: unknown) {
    return this.models.history({ actor: actorFrom(request), query });
  }
  @Get('versions/:versionId')
  readVersion(
    @Req() request: ActorContextRequest,
    @Param('versionId') versionId: string,
  ) {
    return this.models.readVersion({ actor: actorFrom(request), versionId });
  }
  @Post('versions')
  submit(
    @Req() request: ActorContextRequest,
    @Body() payload: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.models.submit({ actor: actorFrom(request), payload, key });
  }
  @Post('versions/:versionId/decision')
  decide(
    @Req() request: ActorContextRequest,
    @Param('versionId') versionId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.models.decide({
      actor: actorFrom(request),
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
      actor: actorFrom(request),
      versionId,
      payload,
      key,
    });
  }
}
function actorFrom(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
