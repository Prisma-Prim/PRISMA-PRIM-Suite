import type { IncomingMessage } from 'node:http';
import {
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
  requireActorContext,
} from '../access/actor-context.adapter.js';
import { DocumentContentService } from './document-content.service.js';

@Controller('documents/:documentId/versions/:versionId/content')
@UseGuards(ActorContextAdapter)
export class DocumentContentController {
  constructor(private readonly content: DocumentContentService) {}

  @Post()
  upload(
    @Req() request: ActorContextRequest & IncomingMessage,
    @Param('documentId') documentId: string,
    @Param('versionId') versionId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Query() query: unknown,
  ) {
    return this.content.upload(requireActorContext(request), {
      documentId,
      versionId,
      query,
      key,
      request,
    });
  }

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async download(
    @Req() request: ActorContextRequest,
    @Param('documentId') documentId: string,
    @Param('versionId') versionId: string,
  ): Promise<StreamableFile> {
    const stored = await this.content.download(requireActorContext(request), {
      documentId,
      versionId,
    });
    return preservedFile(stored);
  }

  @Get('history')
  @Header('Cache-Control', 'private, no-store')
  history(
    @Req() request: ActorContextRequest,
    @Param('documentId') documentId: string,
    @Param('versionId') versionId: string,
    @Query() query: unknown,
  ) {
    return this.content.history(requireActorContext(request), {
      documentId,
      versionId,
      query,
    });
  }

  @Get(':representationId')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async historical(
    @Req() request: ActorContextRequest,
    @Param('documentId') documentId: string,
    @Param('versionId') versionId: string,
    @Param('representationId') representationId: string,
  ): Promise<StreamableFile> {
    const stored = await this.content.download(requireActorContext(request), {
      documentId,
      versionId,
      representationId,
    });
    return preservedFile(stored);
  }
}

function preservedFile(
  stored: Awaited<ReturnType<DocumentContentService['download']>>,
): StreamableFile {
  return new StreamableFile(stored.bytes, {
    type: 'application/pdf',
    length: stored.size,
    disposition: `attachment; filename="questionnaire.pdf"; filename*=UTF-8''${encodeURIComponent(stored.fileName).replace(/['()*]/gu, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`,
  });
}
