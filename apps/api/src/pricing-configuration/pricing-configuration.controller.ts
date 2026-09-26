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
import { PricingConfigurationService } from './pricing-configuration.service.js';

@Controller('pricing-configuration')
@UseGuards(ActorContextAdapter)
export class PricingConfigurationController {
  constructor(private readonly configuration: PricingConfigurationService) {}

  @Post('rule-versions')
  publishRuleVersion(
    @Req() request: ActorContextRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.configuration.publishRuleVersion(
      actorFrom(request),
      body,
      idempotencyKey,
    );
  }

  @Get('rule-scope')
  readRuleScope(@Req() request: ActorContextRequest) {
    return this.configuration.readRuleScope(actorFrom(request));
  }

  @Get('rule-versions')
  listRuleVersions(
    @Req() request: ActorContextRequest,
    @Query('cursor') cursor: unknown,
    @Query('limit') limit: unknown,
  ) {
    return this.configuration.listRuleVersions(
      actorFrom(request),
      cursor,
      limit,
    );
  }

  // The identifier is checked after authority inside the service, so a
  // malformed one receives the same safe not-found as an unknown one.
  @Get('rule-versions/:versionId')
  readRuleVersion(
    @Req() request: ActorContextRequest,
    @Param('versionId') versionId: string,
  ) {
    return this.configuration.readRuleVersion(actorFrom(request), versionId);
  }
}

function actorFrom(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
