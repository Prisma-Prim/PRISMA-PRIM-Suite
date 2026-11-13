import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
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
import { ProjectNextActionService } from './project-next-action.service.js';

@Controller('projects/:projectId/next-action')
@UseGuards(ActorContextAdapter)
export class ProjectNextActionController {
  constructor(private readonly nextAction: ProjectNextActionService) {}
  @Get()
  read(
    @Req() request: ActorContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Query() query: unknown,
  ) {
    return this.nextAction.read(
      requireActorContext(request),
      projectId.toLowerCase(),
      query,
    );
  }
  @Post()
  @HttpCode(200)
  record(
    @Req() request: ActorContextRequest,
    @Param('projectId', new ParseUUIDPipe()) projectId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.nextAction.record(
      requireActorContext(request),
      projectId.toLowerCase(),
      body,
      key,
    );
  }
}
