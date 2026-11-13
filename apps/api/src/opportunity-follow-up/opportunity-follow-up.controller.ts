import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
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
import { OpportunityFollowUpService } from './opportunity-follow-up.service.js';
@Controller('commercial-intake/opportunities/:opportunityId/follow-up')
@UseGuards(ActorContextAdapter)
export class OpportunityFollowUpController {
  constructor(private readonly followUp: OpportunityFollowUpService) {}
  @Get() @Header('Cache-Control', 'private, no-store') read(
    @Req() request: ActorContextRequest,
    @Param('opportunityId', new ParseUUIDPipe()) id: string,
    @Query() query: unknown,
  ) {
    return this.followUp.read(
      requireActorContext(request),
      id.toLowerCase(),
      query,
    );
  }
  @Get('history') @Header('Cache-Control', 'private, no-store') history(
    @Req() request: ActorContextRequest,
    @Param('opportunityId', new ParseUUIDPipe()) id: string,
    @Query() query: unknown,
  ) {
    return this.followUp.history(
      requireActorContext(request),
      id.toLowerCase(),
      query,
    );
  }
  @Post() @HttpCode(200) @Header('Cache-Control', 'private, no-store') record(
    @Req() request: ActorContextRequest,
    @Param('opportunityId', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.followUp.record(
      requireActorContext(request),
      id.toLowerCase(),
      body,
      key,
    );
  }
}
@Controller('commercial-intake/opportunity-follow-ups')
@UseGuards(ActorContextAdapter)
export class OpportunityFollowUpDiscoveryController {
  constructor(private readonly followUp: OpportunityFollowUpService) {}
  @Get() @Header('Cache-Control', 'private, no-store') read(
    @Req() request: ActorContextRequest,
    @Query() query: unknown,
  ) {
    return this.followUp.discover(requireActorContext(request), query);
  }
}
