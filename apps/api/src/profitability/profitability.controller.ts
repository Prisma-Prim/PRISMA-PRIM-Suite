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
import { ProfitabilityService } from './profitability.service.js';

@Controller('commercial/opportunities/:opportunityId/profitability-estimate')
@UseGuards(ActorContextAdapter)
export class ProfitabilityController {
  constructor(private readonly profitability: ProfitabilityService) {}
  @Post('versions') submit(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.profitability.submit(actor(request), opportunityId, body, key);
  }
  @Post('versions/:versionId/decision') decide(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('versionId') versionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.profitability.decide(
      actor(request),
      opportunityId,
      versionId,
      body,
      key,
    );
  }
  @Get('versions') list(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Query('cursor') cursor: unknown,
    @Query('limit') limit: unknown,
  ) {
    return this.profitability.list(
      actor(request),
      opportunityId,
      cursor,
      limit,
    );
  }
  @Get('versions/:versionId') read(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('versionId') versionId: string,
  ) {
    return this.profitability.read(actor(request), opportunityId, versionId);
  }
}
function actor(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
