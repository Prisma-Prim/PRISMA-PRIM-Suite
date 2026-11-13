import {
  Body,
  Controller,
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
  requireActorContext,
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
    return this.documents.register(requireActorContext(request), body, key);
  }
  @Get() list(@Req() request: ActorContextRequest) {
    return this.documents.list(requireActorContext(request));
  }
  @Get('received-addendum-sources') receivedAddendumSources(
    @Req() request: ActorContextRequest,
    @Query() query: unknown,
  ) {
    return this.documents.receivedAddendumSources(
      requireActorContext(request),
      query,
    );
  }
  @Get('received-contract-sources') receivedContractSources(
    @Req() request: ActorContextRequest,
    @Query() query: unknown,
  ) {
    return this.documents.receivedContractSources(
      requireActorContext(request),
      query,
    );
  }
  @Get('external-invoice-sources') externalInvoiceSources(
    @Req() request: ActorContextRequest,
    @Query() query: unknown,
  ) {
    return this.documents.externalInvoiceSources(
      requireActorContext(request),
      query,
    );
  }
  @Get(':id') read(
    @Req() request: ActorContextRequest,
    @Param('id') id: string,
  ) {
    return this.documents.detail(requireActorContext(request), id);
  }
  @Get(':id/correction-history') readCorrectionHistory(
    @Req() request: ActorContextRequest,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    return this.documents.correctionHistory(requireActorContext(request), {
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
    return this.documents.correct(requireActorContext(request), id, body, key);
  }
}
