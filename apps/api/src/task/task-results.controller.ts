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
import { TaskResultsService } from './task-results.service.js';

@Controller('tasks/:taskId/results')
@UseGuards(ActorContextAdapter)
export class TaskResultsController {
  constructor(private readonly results: TaskResultsService) {}
  @Get()
  current(
    @Req() request: ActorContextRequest,
    @Param('taskId') taskId: string,
  ) {
    return this.results.current(actor(request), { taskId });
  }
  @Get('history')
  history(
    @Req() request: ActorContextRequest,
    @Param('taskId') taskId: string,
    @Query() query: unknown,
  ) {
    return this.results.history(actor(request), { taskId, query });
  }
  @Post()
  record(
    @Req() request: ActorContextRequest,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.results.record(actor(request), {
      taskId,
      body,
      idempotencyKey: key,
    });
  }

  @Get('eligible-versions')
  eligibleVersions(
    @Req() request: ActorContextRequest,
    @Param('taskId') taskId: string,
  ) {
    return this.results.eligibleVersions(actor(request), { taskId });
  }

  @Post('corrections')
  correct(
    @Req() request: ActorContextRequest,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.results.correct(actor(request), {
      taskId,
      body,
      idempotencyKey: key,
    });
  }
}
function actor(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
