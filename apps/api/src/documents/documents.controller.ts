import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
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
  @Get('received-contract-sources') receivedContractSources(
    @Req() request: ActorContextRequest,
    @Query() query: unknown,
  ) {
    return this.documents.receivedContractSources(actor(request), query);
  }
  @Get(':id') read(
    @Req() request: ActorContextRequest,
    @Param('id') id: string,
  ) {
    return this.documents.detail(actor(request), id);
  }
  @Get(':id/correction-history') readCorrectionHistory(
    @Req() request: ActorContextRequest,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    return this.documents.correctionHistory(actor(request), {
      documentId: id,
      query,
    });
  }
  @Patch(':id') correct(
    @Req() request: ActorContextRequest,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.documents.correct(actor(request), id, body, key);
  }
}
function actor(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
