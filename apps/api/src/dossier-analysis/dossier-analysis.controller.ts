import type { IncomingMessage } from 'node:http';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
  requireActorContext,
} from '../access/actor-context.adapter.js';
import { DossierSafeFailureInterceptor } from './safe-failure.interceptor.js';
import { DossierAnalysisService } from './dossier-analysis.service.js';
import { DossierRunService } from './run.service.js';
import { DossierSourceService } from './source.service.js';
import { DossierSuggestionService } from './suggestion.service.js';
import { DossierDraftPreparationService } from './draft-preparation.service.js';

@Controller('projects/:projectId/dossier-analysis')
@UseGuards(ActorContextAdapter)
@UseInterceptors(DossierSafeFailureInterceptor)
export class DossierAnalysisController {
  constructor(
    private readonly workspace: DossierAnalysisService,
    private readonly sources: DossierSourceService,
    private readonly runs: DossierRunService,
    private readonly suggestions: DossierSuggestionService,
    private readonly drafts: DossierDraftPreparationService,
  ) {}
  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@Req() req: ActorContextRequest, @Param('projectId') projectId: string) {
    return this.workspace.workspace(requireActorContext(req), projectId);
  }
  @Get('inventory')
  @Header('Cache-Control', 'private, no-store')
  inventory(
    @Req() req: ActorContextRequest,
    @Param('projectId') projectId: string,
  ) {
    return this.workspace.inventory(requireActorContext(req), projectId);
  }
  @Post('sources')
  addPdf(
    @Req() req: ActorContextRequest,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.sources.addPdf(requireActorContext(req), projectId, body, key);
  }
  @Post('sources/docx')
  addDocx(
    @Req() req: ActorContextRequest & IncomingMessage,
    @Param('projectId') projectId: string,
    @Query() query: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.sources.addDocx(
      requireActorContext(req),
      projectId,
      query,
      key,
      req,
    );
  }
  @Delete('sources/:sourceId')
  remove(
    @Req() req: ActorContextRequest,
    @Param('projectId') projectId: string,
    @Param('sourceId') sourceId: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.sources.remove(
      requireActorContext(req),
      projectId,
      sourceId,
      key,
    );
  }
  @Get('sources/:sourceId/original')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async original(
    @Req() req: ActorContextRequest,
    @Param('projectId') projectId: string,
    @Param('sourceId') sourceId: string,
  ) {
    const file = await this.sources.original(
      requireActorContext(req),
      projectId,
      sourceId,
    );
    return new StreamableFile(file.bytes, {
      type:
        file.kind === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      length: file.bytes.length,
      disposition: `attachment; filename="original.${file.kind}"; filename*=UTF-8''${encodeURIComponent(file.fileName).replace(/['()*]/gu, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)}`,
    });
  }
  @Get('runs')
  @Header('Cache-Control', 'private, no-store')
  history(
    @Req() req: ActorContextRequest,
    @Param('projectId') projectId: string,
    @Query() query: unknown,
  ) {
    return this.workspace.history(requireActorContext(req), projectId, query);
  }
  @Post('runs')
  run(
    @Req() req: ActorContextRequest,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.runs.create(requireActorContext(req), projectId, body, key);
  }
  @Get('runs/:runId')
  @Header('Cache-Control', 'private, no-store')
  detail(
    @Req() req: ActorContextRequest,
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
  ) {
    return this.workspace.detail(requireActorContext(req), projectId, runId);
  }
  @Get('runs/:runId/certification-draft')
  @Header('Cache-Control', 'private, no-store')
  prepareDraft(
    @Req() req: ActorContextRequest,
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
    @Query() query: unknown,
  ) {
    return this.drafts.prepare({
      actor: requireActorContext(req),
      projectId,
      runId,
      query,
    });
  }
  @Get('runs/:runId/certification-stage-draft')
  @Header('Cache-Control', 'private, no-store')
  prepareStageDraft(
    @Req() req: ActorContextRequest,
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
    @Query() query: unknown,
  ) {
    return this.drafts.prepareStage({
      actor: requireActorContext(req),
      projectId,
      runId,
      query,
    });
  }
  @Get('runs/:runId/search')
  @Header('Cache-Control', 'private, no-store')
  search(
    @Req() req: ActorContextRequest,
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
    @Query() query: unknown,
  ) {
    return this.runs.search(requireActorContext(req), projectId, runId, query);
  }
  @Get('runs/:runId/context')
  @Header('Cache-Control', 'private, no-store')
  context(
    @Req() req: ActorContextRequest,
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
  ) {
    return this.runs.context(requireActorContext(req), projectId, runId);
  }
  @Post('runs/:runId/suggestions')
  import(
    @Req() req: ActorContextRequest,
    @Param('projectId') projectId: string,
    @Param('runId') runId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.suggestions.import(
      requireActorContext(req),
      projectId,
      runId,
      body,
      key,
    );
  }
  @Post('suggestions/:suggestionId/reviews')
  review(
    @Req() req: ActorContextRequest,
    @Param('projectId') projectId: string,
    @Param('suggestionId') suggestionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.suggestions.review(
      requireActorContext(req),
      projectId,
      suggestionId,
      body,
      key,
    );
  }
}
