import {
  Body,
  Controller,
  ForbiddenException,
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
    return this.responsibility.read(actorFrom(request), projectId);
  }
  @Put('responsible')
  change(
    @Req() request: ActorContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.responsibility.change(actorFrom(request), projectId, body, key);
  }
  @Get('eligible-responsible-members')
  eligibleMembers(
    @Req() request: ActorContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.responsibility.eligibleMembers(actorFrom(request), projectId);
  }
}
function actorFrom(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
