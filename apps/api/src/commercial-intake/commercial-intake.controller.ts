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
import { RequestClientAssociationService } from './request-client-association.service.js';

@Controller('commercial-intake/requests')
@UseGuards(ActorContextAdapter)
export class CommercialIntakeController {
  constructor(
    private readonly intake: CommercialIntakeService,
    private readonly clientAssociation: RequestClientAssociationService,
  ) {}

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

  @Post(':requestId/client-association')
  @HttpCode(200)
  associateClient(
    @Req() request: ActorContextRequest,
    @Param('requestId') requestId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    return this.clientAssociation.associate(
      actorFrom(request),
      requestId,
      body,
      idempotencyKey,
    );
  }
}

// The Opportunity mutations after R3A1, each at an observed version: replace
// the next action, replace the responsible actor within the Company, change
// the outcome status, or assign or clear the Sales Stage. The only
// Opportunity-level reads are the eligible responsible actors and the older
// pages of the outcome and Sales Stage histories.
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

  @Post(':opportunityId/outcome')
  @HttpCode(200)
  changeOutcome(
    @Req() request: ActorContextRequest,
    @Param('opportunityId', new ParseUUIDPipe()) opportunityId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.intake.changeOutcome(
      actorFrom(request),
      opportunityId,
      body,
      idempotencyKey,
    );
  }

  @Get(':opportunityId/outcome-history')
  outcomeHistory(
    @Req() request: ActorContextRequest,
    @Param('opportunityId', new ParseUUIDPipe()) opportunityId: string,
    @Query('cursor') cursor: unknown,
  ) {
    return this.intake.outcomeHistory(
      actorFrom(request),
      opportunityId,
      cursor,
    );
  }

  @Post(':opportunityId/stage')
  @HttpCode(200)
  setStage(
    @Req() request: ActorContextRequest,
    @Param('opportunityId', new ParseUUIDPipe()) opportunityId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.intake.setStage(
      actorFrom(request),
      opportunityId,
      body,
      idempotencyKey,
    );
  }

  @Get(':opportunityId/stage-history')
  stageHistory(
    @Req() request: ActorContextRequest,
    @Param('opportunityId', new ParseUUIDPipe()) opportunityId: string,
    @Query('cursor') cursor: unknown,
  ) {
    return this.intake.stageHistory(actorFrom(request), opportunityId, cursor);
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
