import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { ClientUnionService } from './client-union.service.js';
import { unionRecord } from './client-union-validation.js';

function actor(request: ActorContextRequest) {
  if (!request.actorContext) throw new NotFoundException();
  return request.actorContext;
}

@Controller()
@UseGuards(ActorContextAdapter)
export class ClientUnionController {
  constructor(private readonly unions: ClientUnionService) {}

  @Get('client-union-sources')
  sources(@Req() request: ActorContextRequest) {
    return this.unions.supersededSources(actor(request));
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
    return this.unions.beginReview(actor(request), clientId);
  }

  @Get('client-union-reviews/:reference')
  review(
    @Req() request: ActorContextRequest,
    @Param('reference', new ParseUUIDPipe()) reference: string,
  ) {
    return this.unions.review(actor(request), reference);
  }

  @Post('client-union-reviews/:reference/confirm')
  confirm(
    @Req() request: ActorContextRequest,
    @Param('reference', new ParseUUIDPipe()) reference: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.unions.confirm({
      actor: actor(request),
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
    return this.unions.history(actor(request), clientId);
  }

  @Get('client-union-operations/:reference')
  detail(
    @Req() request: ActorContextRequest,
    @Param('reference', new ParseUUIDPipe()) reference: string,
  ) {
    return this.unions.detail(actor(request), reference);
  }

  @Post('client-union-operations/:reference/reversal')
  reverse(
    @Req() request: ActorContextRequest,
    @Param('reference', new ParseUUIDPipe()) reference: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.unions.reverse({
      actor: actor(request),
      reference,
      value: body,
      key,
    });
  }
}
