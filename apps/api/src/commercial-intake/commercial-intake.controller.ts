import {
  Body,
  Controller,
  ForbiddenException,
  Get,
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

// The Opportunity mutations after R3A1, each at an observed version: replace
// the next action, or replace the responsible actor within the Company. No
// Opportunity-level read exists besides the eligible responsible actors.
@Controller('commercial-intake/opportunities')
@UseGuards(ActorContextAdapter)
export class CommercialIntakeOpportunityController {
  constructor(private readonly intake: CommercialIntakeService) {}

  @Post(':opportunityId/next-action')
  @HttpCode(200)
  updateNextAction(
    @Req() request: ActorContextRequest,
    @Param('opportunityId', new ParseUUIDPipe()) opportunityId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.intake.updateNextAction(
      actorFrom(request),
      opportunityId,
      body,
      idempotencyKey,
    );
  }

  @Post(':opportunityId/responsible')
  @HttpCode(200)
  changeResponsible(
    @Req() request: ActorContextRequest,
    @Param('opportunityId', new ParseUUIDPipe()) opportunityId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.intake.changeResponsible(
      actorFrom(request),
      opportunityId,
      body,
      idempotencyKey,
    );
  }

  @Get(':opportunityId/eligible-responsible-actors')
  eligibleResponsibleActors(
    @Req() request: ActorContextRequest,
    @Param('opportunityId', new ParseUUIDPipe()) opportunityId: string,
  ) {
    return this.intake.eligibleResponsibleActors(
      actorFrom(request),
      opportunityId,
    );
  }
}

function actorFrom(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
