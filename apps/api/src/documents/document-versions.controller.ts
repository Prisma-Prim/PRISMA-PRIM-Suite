import {
  Body,
  Controller,
  Get,
  Headers,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
  requireActorContext,
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
  @Header('Cache-Control', 'private, no-store')
  list(
    @Req() request: ActorContextRequest,
    @Param('documentId') documentId: string,
  ): Promise<DocumentVersionsRead> {
    return this.versions.list(requireActorContext(request), documentId);
  }

  /** Starts a new draft Version: `201` with a `drafted` receipt. */
  @Post()
  startDraft(
    @Req() request: ActorContextRequest,
    @Param('documentId') documentId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<DocumentVersionReceipt> {
    return this.versions.startDraft(requireActorContext(request), {
      documentId,
      body,
      key,
    });
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
    return this.versions.designate(requireActorContext(request), {
      documentId,
      versionId,
      body,
      key,
    });
  }

  /** Adds a typed external reference to a draft or the current official Version. */
  @Post(':versionId/representations')
  addRepresentation(
    @Req() request: ActorContextRequest,
    @Param('documentId') documentId: string,
    @Param('versionId') versionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<DocumentVersionReceipt> {
    return this.versions.addRepresentation(requireActorContext(request), {
      documentId,
      versionId,
      body,
      key,
    });
  }

  /** Retains and hides one reference removed from the current draft. */
  @Post(':versionId/representations/:representationId/removal')
  @HttpCode(200)
  removeRepresentation(
    @Req() request: ActorContextRequest,
    @Param('documentId') documentId: string,
    @Param('versionId') versionId: string,
    @Param('representationId') representationId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ): Promise<DocumentVersionReceipt> {
    return this.versions.removeRepresentation(requireActorContext(request), {
      documentId,
      versionId,
      representationId,
      body,
      key,
    });
  }
}
