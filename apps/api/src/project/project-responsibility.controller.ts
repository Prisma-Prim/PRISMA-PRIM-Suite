import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
  requireActorContext,
} from '../access/actor-context.adapter.js';
import { ProjectResponsibilityService } from './project-responsibility.service.js';

@Controller('projects/:projectId')
@UseGuards(ActorContextAdapter)
export class ProjectResponsibilityController {
  constructor(private readonly responsibility: ProjectResponsibilityService) {}
  @Get('responsible')
  read(
    @Req() request: ActorContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.responsibility.read(requireActorContext(request), projectId);
  }
  @Put('responsible')
  change(
    @Req() request: ActorContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.responsibility.change(
      requireActorContext(request),
      projectId,
      body,
      key,
    );
  }
  @Get('eligible-responsible-members')
  eligibleMembers(
    @Req() request: ActorContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.responsibility.eligibleMembers(
      requireActorContext(request),
      projectId,
    );
  }
}
