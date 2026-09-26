import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { DocumentVersionsService } from './document-versions.service.js';
import type {
  DocumentVersionReceipt,
  DocumentVersionsRead,
} from './document-versions.types.js';

@Controller('documents/:documentId/versions')
@UseGuards(ActorContextAdapter)
export class DocumentVersionsController {
  constructor(private readonly versions: DocumentVersionsService) {}

  @Get()
  list(
    @Req() request: ActorContextRequest,
    @Param('documentId') documentId: string,
  ): Promise<DocumentVersionsRead> {
    return this.versions.list(actor(request), documentId);
  }

  /** Starts a new draft Version: `201` with a `drafted` receipt. */
  @Post()
  startDraft(
    @Req() request: ActorContextRequest,
    @Param('documentId') documentId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<DocumentVersionReceipt> {
    return this.versions.startDraft(actor(request), { documentId, body, key });
  }

  /** Designates the draft as official: `200` with its receipt. */
  @Post(':versionId/official-designation')
  @HttpCode(200)
  designate(
    @Req() request: ActorContextRequest,
    @Param('documentId') documentId: string,
    @Param('versionId') versionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<DocumentVersionReceipt> {
    return this.versions.designate(actor(request), {
      documentId,
      versionId,
      body,
      key,
    });
  }
}

function actor(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
