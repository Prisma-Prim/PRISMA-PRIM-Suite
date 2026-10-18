import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
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
import { ProjectStageService } from './project-stage.service.js';
import { ProjectTemplateService } from './project-template.service.js';

@Controller()
@UseGuards(ActorContextAdapter)
export class ProjectTemplateController {
  constructor(
    private readonly templates: ProjectTemplateService,
    private readonly stages: ProjectStageService,
  ) {}

  @Get('projects/:projectId/stage-progress')
  progress(
    @Req() request: ActorContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.stages.read(actor(request), projectId);
  }
  @Post('projects/:projectId/stage-advance')
  advance(
    @Req() request: ActorContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.stages.advance({ actor: actor(request), projectId, body, key });
  }
  @Get('project-templates')
  catalogue(@Req() request: ActorContextRequest) {
    return this.templates.catalogue(actor(request));
  }
  @Post('projects/from-template')
  create(
    @Req() request: ActorContextRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.templates.create(actor(request), body, key);
  }
  @Get('projects/:projectId/template')
  read(
    @Req() request: ActorContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.templates.read(actor(request), projectId);
  }
}
function actor(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
