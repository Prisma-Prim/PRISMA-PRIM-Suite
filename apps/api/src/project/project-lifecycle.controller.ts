import {
  Body,
  Controller,
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
  requireActorContext,
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
    return this.lifecycle.read(requireActorContext(request), projectId);
  }
  @Get('eligible-start-exception-members')
  eligibleMembers(
    @Req() request: ActorContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.lifecycle.eligibleStartExceptionMembers(
      requireActorContext(request),
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
    return this.lifecycle.transition(
      requireActorContext(request),
      projectId,
      body,
      key,
    );
  }
}
