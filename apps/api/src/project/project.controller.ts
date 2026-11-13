import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
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
import { ProjectService } from './project.service.js';
import { readProjectDirectorySelection } from './project-directory-selection.js';
@Controller('projects')
@UseGuards(ActorContextAdapter)
export class ProjectController {
  constructor(private readonly projects: ProjectService) {}
  @Get()
  list(@Req() request: ActorContextRequest, @Query() query: unknown) {
    const selection = readProjectDirectorySelection(query);
    return selection && 'clientDossierId' in selection
      ? this.projects.listForClient(requireActorContext(request), selection)
      : this.projects.list(requireActorContext(request), selection);
  }
  @Get(':projectId')
  read(
    @Req() request: ActorContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.projects.read(requireActorContext(request), projectId);
  }
  @Post()
  create(
    @Req() request: ActorContextRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.projects.create(requireActorContext(request), body, key);
  }
}
