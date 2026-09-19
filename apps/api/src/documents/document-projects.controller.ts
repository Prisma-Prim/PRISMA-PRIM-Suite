import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { DocumentProjectsService } from './document-projects.service.js';
@Controller()
@UseGuards(ActorContextAdapter)
export class DocumentProjectsController {
  constructor(private readonly associations: DocumentProjectsService) {}
  @Get('projects/:projectId/documents')
  list(
    @Req() request: ActorContextRequest,
    @Param('projectId') projectId: string,
  ) {
    return this.associations.list(actor(request), projectId);
  }
  @Get('projects/:projectId/eligible-documents')
  eligible(
    @Req() request: ActorContextRequest,
    @Param('projectId') projectId: string,
  ) {
    return this.associations.list(actor(request), projectId, true);
  }
  @Post('documents/:documentId/project-association')
  mutate(
    @Req() request: ActorContextRequest,
    @Param('documentId') documentId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.associations.mutate(actor(request), documentId, body, key);
  }
}
function actor(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
