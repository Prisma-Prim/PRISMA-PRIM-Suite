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
import { PricingConfigurationService } from './pricing-configuration.service.js';
import { TariffVersionService } from './tariff-version.service.js';

@Controller('pricing-configuration')
@UseGuards(ActorContextAdapter)
export class PricingConfigurationController {
  constructor(
    private readonly configuration: PricingConfigurationService,
    private readonly tariffs: TariffVersionService,
  ) {}

  @Post('rule-versions')
  publishRuleVersion(
    @Req() request: ActorContextRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.configuration.publishRuleVersion(
      requireActorContext(request),
      body,
      idempotencyKey,
    );
  }

  @Get('rule-scope')
  readRuleScope(@Req() request: ActorContextRequest) {
    return this.configuration.readRuleScope(requireActorContext(request));
  }

  @Get('rule-versions')
  listRuleVersions(
    @Req() request: ActorContextRequest,
    @Query('cursor') cursor: unknown,
    @Query('limit') limit: unknown,
  ) {
    return this.configuration.listRuleVersions(
      requireActorContext(request),
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
    return this.configuration.readRuleVersion(
      requireActorContext(request),
      versionId,
    );
  }

  // Offering and version identifiers are checked after authority inside the
  // service, so a malformed one receives the same safe not-found as an
  // unknown, cross-Company or cross-Workspace one.
  @Post('offerings/:offeringId/tariff-versions')
  publishTariffVersion(
    @Req() request: ActorContextRequest,
    @Param('offeringId') offeringId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.tariffs.publishTariffVersion(
      requireActorContext(request),
      offeringId,
      body,
      idempotencyKey,
    );
  }

  @Get('offerings/:offeringId/tariff-scope')
  readTariffScope(
    @Req() request: ActorContextRequest,
    @Param('offeringId') offeringId: string,
  ) {
    return this.tariffs.readTariffScope(
      requireActorContext(request),
      offeringId,
    );
  }

  @Get('offerings/:offeringId/tariff-versions')
  listTariffVersions(
    @Req() request: ActorContextRequest,
    @Param('offeringId') offeringId: string,
    @Query('cursor') cursor: unknown,
    @Query('limit') limit: unknown,
  ) {
    return this.tariffs.listTariffVersions(
      requireActorContext(request),
      offeringId,
      cursor,
      limit,
    );
  }

  @Get('tariff-versions/:versionId')
  readTariffVersion(
    @Req() request: ActorContextRequest,
    @Param('versionId') versionId: string,
  ) {
    return this.tariffs.readTariffVersion(
      requireActorContext(request),
      versionId,
    );
  }
}
