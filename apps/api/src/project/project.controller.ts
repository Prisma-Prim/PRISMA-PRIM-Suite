import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  BadRequestException,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { ProjectService } from './project.service.js';
@Controller('projects')
@UseGuards(ActorContextAdapter)
export class ProjectController {
  constructor(private readonly projects: ProjectService) {}
  @Get()
  list(@Req() request: ActorContextRequest, @Query() query: unknown) {
    return this.projects.list(actorFrom(request), directorySelection(query));
  }
  @Get(':projectId')
  read(
    @Req() request: ActorContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
  ) {
    return this.projects.read(actorFrom(request), projectId);
  }
  @Post()
  create(
    @Req() request: ActorContextRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.projects.create(actorFrom(request), body, key);
  }
}
function actorFrom(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}

/** The optional new namespace is strict; legacy list parameters remain ignored. */
function directorySelection(query: unknown): { view: 'mine_open' } | undefined {
  if (typeof query !== 'object' || query === null || Array.isArray(query))
    throw new BadRequestException('Invalid Project directory selection.');
  const entries: [string, unknown][] = Object.entries(query);
  if (!entries.some(([key]) => key === 'view' || key.startsWith('view[')))
    return undefined;
  if (
    entries.length !== 1 ||
    entries[0]?.[0] !== 'view' ||
    entries[0][1] !== 'mine_open'
  )
    throw new BadRequestException('Invalid Project directory selection.');
  return { view: 'mine_open' };
}
