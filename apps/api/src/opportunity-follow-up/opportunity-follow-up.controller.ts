import {
  Body,
  Controller,
  ForbiddenException,
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
} from '../access/actor-context.adapter.js';
import { OpportunityFollowUpService } from './opportunity-follow-up.service.js';
function actor(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
@Controller('commercial-intake/opportunities/:opportunityId/follow-up')
@UseGuards(ActorContextAdapter)
export class OpportunityFollowUpController {
  constructor(private readonly followUp: OpportunityFollowUpService) {}
  @Get() @Header('Cache-Control', 'private, no-store') read(
    @Req() request: ActorContextRequest,
    @Param('opportunityId', new ParseUUIDPipe()) id: string,
    @Query() query: unknown,
  ) {
    return this.followUp.read(actor(request), id.toLowerCase(), query);
  }
  @Get('history') @Header('Cache-Control', 'private, no-store') history(
    @Req() request: ActorContextRequest,
    @Param('opportunityId', new ParseUUIDPipe()) id: string,
    @Query() query: unknown,
  ) {
    return this.followUp.history(actor(request), id.toLowerCase(), query);
  }
  @Post() @HttpCode(200) @Header('Cache-Control', 'private, no-store') record(
    @Req() request: ActorContextRequest,
    @Param('opportunityId', new ParseUUIDPipe()) id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.followUp.record(actor(request), id.toLowerCase(), body, key);
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
    return this.followUp.discover(actor(request), query);
  }
}
