import {
  Body,
  Controller,
  ForbiddenException,
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
      actorFrom(request),
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
      actorFrom(request),
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
      actorFrom(request),
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
      actorFrom(request),
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
      actorFrom(request),
      offeringId,
    );
  }
}

function actorFrom(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
