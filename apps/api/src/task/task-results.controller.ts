import {
  Body,
  Controller,
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
  requireActorContext,
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
    return this.results.current(requireActorContext(request), { taskId });
  }
  @Get('history')
  history(
    @Req() request: ActorContextRequest,
    @Param('taskId') taskId: string,
    @Query() query: unknown,
  ) {
    return this.results.history(requireActorContext(request), {
      taskId,
      query,
    });
  }
  @Post()
  record(
    @Req() request: ActorContextRequest,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.results.record(requireActorContext(request), {
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
    return this.results.eligibleVersions(requireActorContext(request), {
      taskId,
    });
  }

  @Post('corrections')
  correct(
    @Req() request: ActorContextRequest,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.results.correct(requireActorContext(request), {
      taskId,
      body,
      idempotencyKey: key,
    });
  }
}
