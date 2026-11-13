import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
  requireActorContext,
} from '../access/actor-context.adapter.js';
import { ClientUnionService } from './client-union.service.js';
import { unionRecord } from './client-union-validation.js';

@Controller()
@UseGuards(ActorContextAdapter)
export class ClientUnionController {
  constructor(private readonly unions: ClientUnionService) {}

  @Get('client-union-sources')
  sources(@Req() request: ActorContextRequest) {
    return this.unions.supersededSources(requireActorContext(request));
  }

  @Post('clients/:clientId/union-reviews')
  begin(
    @Req() request: ActorContextRequest,
    @Param('clientId', new ParseUUIDPipe()) clientId: string,
    @Body() body: unknown,
  ) {
    if (Object.keys(unionRecord(body ?? {})).length > 0)
      throw new BadRequestException(
        'Client union comparison uses only the persisted dossier.',
      );
    return this.unions.beginReview(requireActorContext(request), clientId);
  }

  @Get('client-union-reviews/:reference')
  review(
    @Req() request: ActorContextRequest,
    @Param('reference', new ParseUUIDPipe()) reference: string,
  ) {
    return this.unions.review(requireActorContext(request), reference);
  }

  @Post('client-union-reviews/:reference/confirm')
  confirm(
    @Req() request: ActorContextRequest,
    @Param('reference', new ParseUUIDPipe()) reference: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.unions.confirm({
      actor: requireActorContext(request),
      reference,
      value: body,
      key,
    });
  }

  @Get('clients/:clientId/union-history')
  history(
    @Req() request: ActorContextRequest,
    @Param('clientId', new ParseUUIDPipe()) clientId: string,
  ) {
    return this.unions.history(requireActorContext(request), clientId);
  }

  @Get('client-union-operations/:reference')
  detail(
    @Req() request: ActorContextRequest,
    @Param('reference', new ParseUUIDPipe()) reference: string,
  ) {
    return this.unions.detail(requireActorContext(request), reference);
  }

  @Post('client-union-operations/:reference/reversal')
  reverse(
    @Req() request: ActorContextRequest,
    @Param('reference', new ParseUUIDPipe()) reference: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.unions.reverse({
      actor: requireActorContext(request),
      reference,
      value: body,
      key,
    });
  }
}
