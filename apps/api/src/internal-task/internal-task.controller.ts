import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
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
import { InternalTaskService } from './internal-task.service.js';

@Controller('company-internal-tasks')
@UseGuards(ActorContextAdapter)
export class InternalTaskController {
  constructor(private readonly tasks: InternalTaskService) {}
  @Post()
  create(
    @Req() request: ActorContextRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.tasks.create(requireActorContext(request), body, key);
  }
  @Get()
  list(@Req() request: ActorContextRequest, @Query() query: unknown) {
    return this.tasks.list(requireActorContext(request), query);
  }
  @Get('eligible-assignees')
  eligible(@Req() request: ActorContextRequest, @Query() query: unknown) {
    return this.tasks.eligible(requireActorContext(request), query);
  }
  @Get(':taskId')
  detail(
    @Req() request: ActorContextRequest,
    @Param('taskId') id: string,
    @Query() query: unknown,
  ) {
    return this.tasks.detail(requireActorContext(request), id, query);
  }
  @Post(':taskId/changes')
  @HttpCode(200)
  change(
    @Req() request: ActorContextRequest,
    @Param('taskId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.tasks.change(requireActorContext(request), id, body, key);
  }
}
