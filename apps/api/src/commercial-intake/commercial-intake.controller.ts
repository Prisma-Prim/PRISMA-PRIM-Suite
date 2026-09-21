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
import { CommercialIntakeService } from './commercial-intake.service.js';

@Controller('commercial-intake/requests')
@UseGuards(ActorContextAdapter)
export class CommercialIntakeController {
  constructor(private readonly intake: CommercialIntakeService) {}

  @Post()
  create(
    @Req() request: ActorContextRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.intake.create(actorFrom(request), body, idempotencyKey);
  }

  @Get()
  list(
    @Req() request: ActorContextRequest,
    @Query('limit') limit: unknown,
    @Query('cursor') cursor: unknown,
  ) {
    return this.intake.list(actorFrom(request), limit, cursor);
  }

  @Get(':requestId')
  read(
    @Req() request: ActorContextRequest,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
  ) {
    return this.intake.read(actorFrom(request), requestId);
  }
}

function actorFrom(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
