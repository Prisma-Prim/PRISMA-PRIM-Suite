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
import { DocumentsService } from './documents.service.js';
@Controller('documents')
@UseGuards(ActorContextAdapter)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}
  @Post() register(
    @Req() request: ActorContextRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.documents.register(actor(request), body, key);
  }
  @Get() list(@Req() request: ActorContextRequest) {
    return this.documents.list(actor(request));
  }
  @Get(':id') read(
    @Req() request: ActorContextRequest,
    @Param('id') id: string,
  ) {
    return this.documents.read(actor(request), id);
  }
}
function actor(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
