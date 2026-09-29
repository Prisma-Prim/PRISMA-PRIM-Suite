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

// The only Opportunity mutation after R3A1: replace the next action of one
// Opportunity at an observed version. No Opportunity-level read exists.
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
}

function actorFrom(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
