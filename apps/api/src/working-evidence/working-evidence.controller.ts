import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
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
} from '../access/actor-context.adapter.js';
import { WorkingEvidenceService } from './working-evidence.service.js';
import { noQuery, refuse } from './working-evidence.contract.js';

type Request = ActorContextRequest & { body?: unknown };
function actor(request: Request) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
function readRequest(request: Request) {
  const length = request.header('content-length');
  if (
    (length !== undefined && length !== '0') ||
    request.header('transfer-encoding') !== undefined
  )
    return refuse('invalid_request');
  if (
    request.body !== undefined &&
    request.body !== null &&
    !(
      typeof request.body === 'object' &&
      !Array.isArray(request.body) &&
      Object.keys(request.body).length === 0
    )
  )
    return refuse('invalid_request');
  return actor(request);
}
@Controller()
@UseGuards(ActorContextAdapter)
export class WorkingEvidenceController {
  constructor(private readonly cases: WorkingEvidenceService) {}
  @Post('projects/:projectId/working-evidence-cases')
  record(
    @Req() request: Request,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @Query() query: unknown,
  ) {
    noQuery(query);
    return this.cases.record(actor(request), projectId, body);
  }
  @Post('working-evidence-cases/:caseId/corrections')
  correct(
    @Req() request: Request,
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Query() query: unknown,
  ) {
    noQuery(query);
    return this.cases.correct(actor(request), caseId, body);
  }
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Get('projects/:projectId/working-evidence-cases')
  list(
    @Req() request: Request,
    @Param('projectId') projectId: string,
    @Query() query: unknown,
  ) {
    return this.cases.list(readRequest(request), projectId, query);
  }
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Get('projects/:projectId/working-evidence-sources')
  sources(
    @Req() request: Request,
    @Param('projectId') projectId: string,
    @Query() query: unknown,
  ) {
    return this.cases.sources(readRequest(request), projectId, query);
  }
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Get('working-evidence-cases/:caseId')
  detail(
    @Req() request: Request,
    @Param('caseId') caseId: string,
    @Query() query: unknown,
  ) {
    return this.cases.detail(readRequest(request), caseId, query);
  }
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Get('working-evidence-cases/:caseId/revisions')
  history(
    @Req() request: Request,
    @Param('caseId') caseId: string,
    @Query() query: unknown,
  ) {
    return this.cases.history(readRequest(request), caseId, query);
  }
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Get('working-evidence-cases/:caseId/revisions/:revisionId')
  revision(
    @Req() request: Request,
    @Param('caseId') caseId: string,
    @Param('revisionId') revisionId: string,
    @Query() query: unknown,
  ) {
    return this.cases.revision(readRequest(request), caseId, revisionId, query);
  }
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Get('working-evidence-cases/:caseId/revisions/:revisionId/statement')
  @Header(
    'Content-Security-Policy',
    "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox allow-top-navigation-by-user-activation",
  )
  async statement(
    @Req() request: Request,
    @Param('caseId') caseId: string,
    @Param('revisionId') revisionId: string,
    @Query() query: unknown,
  ) {
    return this.download(
      await this.cases.artifact(
        readRequest(request),
        caseId,
        revisionId,
        'statement',
        null,
        query,
      ),
    );
  }
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Get('working-evidence-cases/:caseId/revisions/:revisionId/annex')
  async annex(
    @Req() request: Request,
    @Param('caseId') caseId: string,
    @Param('revisionId') revisionId: string,
    @Query() query: unknown,
  ) {
    return this.download(
      await this.cases.artifact(
        readRequest(request),
        caseId,
        revisionId,
        'annex',
        null,
        query,
      ),
    );
  }
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Get(
    'working-evidence-cases/:caseId/revisions/:revisionId/evidence/:evidenceId',
  )
  async evidence(
    @Req() request: Request,
    @Param('caseId') caseId: string,
    @Param('revisionId') revisionId: string,
    @Param('evidenceId') evidenceId: string,
    @Query() query: unknown,
  ) {
    return this.download(
      await this.cases.artifact(
        readRequest(request),
        caseId,
        revisionId,
        'evidence',
        evidenceId,
        query,
      ),
    );
  }
  private download(output: { bytes: Buffer; type: string; filename: string }) {
    return new StreamableFile(output.bytes, {
      type: output.type,
      length: output.bytes.length,
      disposition: `attachment; filename="${output.filename}"`,
    });
  }
}
