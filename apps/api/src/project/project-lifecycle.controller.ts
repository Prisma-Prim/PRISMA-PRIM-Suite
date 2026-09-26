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
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { ProjectLifecycleService } from './project-lifecycle.service.js';

@Controller('projects/:projectId')
@UseGuards(ActorContextAdapter)
export class ProjectLifecycleController {
  constructor(private readonly lifecycle: ProjectLifecycleService) {}
  @Get('lifecycle')
  read(
    @Req() request: ActorContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.lifecycle.read(actorFrom(request), projectId);
  }
  @Get('eligible-start-exception-members')
  eligibleMembers(
    @Req() request: ActorContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.lifecycle.eligibleStartExceptionMembers(
      actorFrom(request),
      projectId,
    );
  }
  @Post('lifecycle-transitions')
  @HttpCode(200)
  transition(
    @Req() request: ActorContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.lifecycle.transition(actorFrom(request), projectId, body, key);
  }
}
function actorFrom(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
