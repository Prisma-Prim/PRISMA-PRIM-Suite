import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { OperationalRiskService } from './operational-risk.service.js';

@Controller('operational-risks')
@UseGuards(ActorContextAdapter)
export class OperationalRiskController {
  constructor(private readonly risks: OperationalRiskService) {}

  @Get()
  list(@Req() request: ActorContextRequest, @Query() query: unknown) {
    return this.risks.list({ actor: actorFrom(request), query });
  }

  @Post()
  record(
    @Req() request: ActorContextRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.risks.record({ actor: actorFrom(request), body, key });
  }

  @Get(':riskId')
  detail(@Req() request: ActorContextRequest, @Param('riskId') riskId: string) {
    return this.risks.detail({ actor: actorFrom(request), riskId });
  }

  @Get(':riskId/history')
  history(
    @Req() request: ActorContextRequest,
    @Param('riskId') riskId: string,
    @Query() query: unknown,
  ) {
    return this.risks.history({ actor: actorFrom(request), riskId, query });
  }

  @Post(':riskId/journal')
  append(
    @Req() request: ActorContextRequest,
    @Param('riskId') riskId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.risks.append({ actor: actorFrom(request), riskId, body, key });
  }

  @Post(':riskId/intake-corrections')
  correct(
    @Req() request: ActorContextRequest,
    @Param('riskId') riskId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.risks.correct({ actor: actorFrom(request), riskId, body, key });
  }

  @Get(':riskId/journal/:journalEntryId')
  journalStatement(
    @Req() request: ActorContextRequest,
    @Param('riskId') riskId: string,
    @Param('journalEntryId') journalEntryId: string,
    @Query() query: unknown,
  ) {
    return this.risks.journalStatement({
      actor: actorFrom(request),
      riskId,
      journalEntryId,
      query,
    });
  }

  @Post(':riskId/journal/:journalEntryId/corrections')
  correctJournal(
    @Req() request: ActorContextRequest,
    @Param('riskId') riskId: string,
    @Param('journalEntryId') journalEntryId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.risks.correctJournal({
      actor: actorFrom(request),
      riskId,
      journalEntryId,
      body,
      key,
    });
  }
}

function actorFrom(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
