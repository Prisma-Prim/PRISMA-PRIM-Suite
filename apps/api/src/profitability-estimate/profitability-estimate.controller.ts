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
import { ProfitabilityEstimateService } from './profitability-estimate.service.js';

@Controller('opportunities/:opportunityId/profitability-estimates')
@UseGuards(ActorContextAdapter)
export class ProfitabilityEstimateController {
  constructor(private readonly estimates: ProfitabilityEstimateService) {}

  @Post()
  create(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.estimates.create({
      actor: actorFrom(request),
      opportunityId,
      body,
      key,
    });
  }

  @Get()
  list(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Query() query: unknown,
  ) {
    return this.estimates.list({
      actor: actorFrom(request),
      opportunityId,
      query,
    });
  }

  @Get('versions/:versionId')
  read(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.estimates.read({
      actor: actorFrom(request),
      opportunityId,
      versionId,
    });
  }

  @Post('versions/:versionId/decision')
  decide(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('versionId') versionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.estimates.decide({
      actor: actorFrom(request),
      opportunityId,
      versionId,
      body,
      key,
    });
  }
}

function actorFrom(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
