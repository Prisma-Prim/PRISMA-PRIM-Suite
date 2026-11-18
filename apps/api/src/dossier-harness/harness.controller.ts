import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  requireActorContext,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { DossierSafeFailureInterceptor } from '../dossier-analysis/safe-failure.interceptor.js';
import { DossierHarnessConnectionService } from './connection.service.js';
import { DossierHarnessJobService } from './job.service.js';

@Controller('projects/:projectId/dossier-analysis/harness')
@UseGuards(ActorContextAdapter)
@UseInterceptors(DossierSafeFailureInterceptor)
export class DossierHarnessController {
  constructor(
    private readonly connections: DossierHarnessConnectionService,
    private readonly jobs: DossierHarnessJobService,
  ) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  status(@Req() req: ActorContextRequest, @Param('projectId') project: string) {
    return this.connections.status(requireActorContext(req), project);
  }
  @Post('connect')
  start(@Req() req: ActorContextRequest, @Param('projectId') project: string) {
    return this.connections.start(requireActorContext(req), project);
  }
  @Post('connect/complete')
  complete(
    @Req() req: ActorContextRequest,
    @Param('projectId') project: string,
    @Body() body: unknown,
  ) {
    return this.connections.complete(requireActorContext(req), project, body);
  }
  @Post('disconnect')
  disconnect(
    @Req() req: ActorContextRequest,
    @Param('projectId') project: string,
  ) {
    return this.connections.disconnect(requireActorContext(req), project);
  }
  @Get('jobs')
  @Header('Cache-Control', 'private, no-store')
  list(
    @Req() req: ActorContextRequest,
    @Param('projectId') project: string,
    @Query('runId') run: unknown,
  ) {
    return this.jobs.list(requireActorContext(req), project, run);
  }
  @Get('jobs/:id')
  @Header('Cache-Control', 'private, no-store')
  get(
    @Req() req: ActorContextRequest,
    @Param('projectId') project: string,
    @Param('id') id: string,
  ) {
    return this.jobs.get(requireActorContext(req), project, id);
  }
  @Post('jobs')
  create(
    @Req() req: ActorContextRequest,
    @Param('projectId') project: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.jobs.create(requireActorContext(req), project, body, key);
  }
  @Post('jobs/:id/advance')
  advance(
    @Req() req: ActorContextRequest,
    @Param('projectId') project: string,
    @Param('id') id: string,
  ) {
    return this.jobs.advance(requireActorContext(req), project, id);
  }
  @Post('jobs/:id/control')
  control(
    @Req() req: ActorContextRequest,
    @Param('projectId') project: string,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.jobs.control(requireActorContext(req), project, id, body);
  }
  @Post('jobs/:id/import')
  import(
    @Req() req: ActorContextRequest,
    @Param('projectId') project: string,
    @Param('id') id: string,
  ) {
    return this.jobs.import(requireActorContext(req), project, id);
  }
}
