import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { SalesStageService } from './sales-stage.service.js';

// The active Company's Sales Stage list with its configuration revision, and
// the Create operation of Commercial Workflow PRD section 24.2.
@Controller('sales-stages')
@UseGuards(ActorContextAdapter)
export class SalesStageController {
  constructor(private readonly stages: SalesStageService) {}

  @Get()
  list(@Req() request: ActorContextRequest) {
    return this.stages.list(actorFrom(request));
  }

  @Post()
  create(
    @Req() request: ActorContextRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.stages.create(actorFrom(request), body, idempotencyKey);
  }
}

function actorFrom(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
