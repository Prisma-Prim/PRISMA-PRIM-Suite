import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
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
import { CommercialCatalogueService } from './commercial-catalogue.service.js';

@Controller('commercial-catalogue')
@UseGuards(ActorContextAdapter)
export class CommercialCatalogueController {
  constructor(private readonly catalogue: CommercialCatalogueService) {}

  @Post('service-definitions')
  createServiceDefinition(
    @Req() request: ActorContextRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.catalogue.createServiceDefinition(
      requireActorContext(request),
      body,
      idempotencyKey,
    );
  }

  @Get('service-definitions')
  listServiceDefinitions(
    @Req() request: ActorContextRequest,
    @Query('cursor') cursor: unknown,
    @Query('limit') limit: unknown,
  ) {
    return this.catalogue.listServiceDefinitions(
      requireActorContext(request),
      cursor,
      limit,
    );
  }

  @Post('offerings')
  createOffering(
    @Req() request: ActorContextRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.catalogue.createCompanyServiceOffering(
      requireActorContext(request),
      body,
      idempotencyKey,
    );
  }

  @Get('offerings')
  listOfferings(
    @Req() request: ActorContextRequest,
    @Query('cursor') cursor: unknown,
    @Query('limit') limit: unknown,
  ) {
    return this.catalogue.listCompanyServiceOfferings(
      requireActorContext(request),
      cursor,
      limit,
    );
  }

  @Get('offerings/:offeringId')
  readOffering(
    @Req() request: ActorContextRequest,
    @Param('offeringId', new ParseUUIDPipe()) offeringId: string,
  ) {
    return this.catalogue.getCompanyServiceOffering(
      requireActorContext(request),
      offeringId,
    );
  }
}
