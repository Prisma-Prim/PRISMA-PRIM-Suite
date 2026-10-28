import { TeamTasksService } from './team-tasks.service.js';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { TaskService } from './task.service.js';
import { TaskPlanningService } from './task-planning.service.js';
@Controller()
@UseGuards(ActorContextAdapter)
export class TaskController {
  constructor(
    private readonly tasks: TaskService,
    private readonly planning: TaskPlanningService,
    private readonly team: TeamTasksService,
  ) {}
  @Post('projects/:projectId/tasks/planning') plan(
    @Req() request: ActorContextRequest,
    @Param('projectId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.planning.plan(actor(request), id, body, key);
  }
  @Get('projects/:projectId/tasks') list(
    @Req() request: ActorContextRequest,
    @Param('projectId') id: string,
  ) {
    return this.tasks.list(actor(request), id);
  }
  @Get('projects/:projectId/eligible-task-assignees') eligible(
    @Req() request: ActorContextRequest,
    @Param('projectId') id: string,
  ) {
    return this.tasks.eligibleAssignees(actor(request), id);
  }
  @Post('projects/:projectId/tasks') create(
    @Req() request: ActorContextRequest,
    @Param('projectId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.tasks.create(actor(request), id, body, key);
  }
  @Get('assigned-tasks') listAssigned(
    @Req() request: ActorContextRequest,
    @Query() query: unknown,
  ) {
    return this.tasks.listAssigned(actor(request), query);
  }
  @Get('unassigned-tasks') listUnassigned(
    @Req() request: ActorContextRequest,
    @Query() query: unknown,
  ) {
    return this.tasks.listUnassigned(actor(request), query);
  }
  @Get('team-tasks') listTeam(@Req() request: ActorContextRequest) {
    return this.team.list(actor(request), request.originalUrl);
  }
  @Get('blocked-tasks') listBlocked(
    @Req() request: ActorContextRequest,
    @Query() query: unknown,
  ) {
    return this.tasks.listBlocked(actor(request), query);
  }
  @Get('due-soon-tasks') listDueSoon(
    @Req() request: ActorContextRequest,
    @Query() query: unknown,
  ) {
    return this.tasks.listDueSoon(actor(request), query);
  }
  @Get('attention-tasks') listAttention(
    @Req() request: ActorContextRequest,
    @Query() query: unknown,
  ) {
    return this.tasks.listAttention(actor(request), query);
  }
  @Get('overdue-tasks') listOverdue(
    @Req() request: ActorContextRequest,
    @Query() query: unknown,
  ) {
    return this.tasks.listOverdue(actor(request), query);
  }
  @Get('tasks/:taskId') read(
    @Req() request: ActorContextRequest,
    @Param('taskId') id: string,
  ) {
    return this.tasks.read(actor(request), id);
  }
  @Get('tasks/:taskId/history') history(
    @Req() request: ActorContextRequest,
    @Param('taskId') id: string,
  ) {
    return this.tasks.history(actor(request), id);
  }
  @Patch('tasks/:taskId') edit(
    @Req() request: ActorContextRequest,
    @Param('taskId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.tasks.edit(actor(request), id, body, key);
  }
  @Post('tasks/:taskId/complete') complete(
    @Req() request: ActorContextRequest,
    @Param('taskId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.tasks.complete(actor(request), id, body, key);
  }
  @Post('tasks/:taskId/reopen') reopen(
    @Req() request: ActorContextRequest,
    @Param('taskId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.tasks.reopen(actor(request), id, body, key);
  }
  @Post('tasks/:taskId/status') changeStatus(
    @Req() request: ActorContextRequest,
    @Param('taskId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.tasks.changeStatus(actor(request), id, body, key);
  }
  @Post('tasks/:taskId/cancel') cancel(
    @Req() request: ActorContextRequest,
    @Param('taskId') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.tasks.cancel(actor(request), id, body, key);
  }
}
function actor(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
