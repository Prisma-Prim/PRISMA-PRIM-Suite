import {
  Controller,
  Body,
  ForbiddenException,
  Get,
  Post,
  Param,
  Headers,
  Req,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { ComplaintsService } from './complaints.service.js';

@Controller('complaints')
@UseGuards(ActorContextAdapter)
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get()
  list(@Req() request: ActorContextRequest, @Query('offset') offset: unknown) {
    if (!request.actorContext) throw new ForbiddenException();
    return this.complaints.list(request.actorContext, offset);
  }

  @Post()
  record(
    @Req() request: ActorContextRequest,
    @Body() input: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    if (!request.actorContext) throw new ForbiddenException();
    return this.complaints.record({ actor: request.actorContext, input, key });
  }

  @Get(':complaintId')
  read(
    @Req() request: ActorContextRequest,
    @Param('complaintId') complaintId: string,
  ) {
    if (!request.actorContext) throw new ForbiddenException();
    return this.complaints.read(request.actorContext, complaintId);
  }

  @Post(':complaintId/intake-corrections')
  correctIntake(
    @Req() request: ActorContextRequest,
    @Param('complaintId') complaintId: string,
    @Body() input: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    if (!request.actorContext) throw new ForbiddenException();
    return this.complaints.correctIntake({
      actor: request.actorContext,
      complaintId,
      input,
      key,
    });
  }

  @Post(':complaintId/journal')
  recordJournal(
    @Req() request: ActorContextRequest,
    @Param('complaintId') complaintId: string,
    @Body() input: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    if (!request.actorContext) throw new ForbiddenException();
    return this.complaints.recordJournal({
      actor: request.actorContext,
      complaintId,
      input,
      key,
      target: { kind: 'append' },
    });
  }

  @Post(':complaintId/journal/:originalEntryId/corrections')
  correctJournal(
    @Req() request: ActorContextRequest,
    @Param('complaintId') complaintId: string,
    @Param('originalEntryId') originalEntryId: string,
    @Body() input: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    if (!request.actorContext) throw new ForbiddenException();
    return this.complaints.recordJournal({
      actor: request.actorContext,
      complaintId,
      input,
      key,
      target: { kind: 'correction', originalEntryId },
    });
  }

  @Get(':complaintId/history')
  history(
    @Req() request: ActorContextRequest,
    @Param('complaintId') complaintId: string,
    @Query('offset') offset: unknown,
  ) {
    if (!request.actorContext) throw new ForbiddenException();
    return this.complaints.history(request.actorContext, complaintId, offset);
  }
}
