import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  requireActorContext,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { CertificationService } from './certification.service.js';
import type { AuditStage } from './certification-stages.js';

const FINDING_UPDATES = {
  correction: 'correction',
  classification: 'classification',
  reclassification: 'reclassification',
  response: 'response',
  'plan-judgment': 'plan_judgment',
  verification: 'verification',
} as const satisfies Record<string, string>;

function findingUpdate(
  value: string,
): (typeof FINDING_UPDATES)[keyof typeof FINDING_UPDATES] {
  const entry = Object.entries(FINDING_UPDATES).find(
    ([path]) => path === value,
  );
  if (!entry) throw new NotFoundException();
  return entry[1];
}

function auditStage(value: string): AuditStage {
  if (value === 'stage-1') return 'stage_1';
  if (value === 'stage-2') return 'stage_2';
  throw new NotFoundException();
}

@Controller()
@UseGuards(ActorContextAdapter)
export class CertificationController {
  constructor(private readonly certification: CertificationService) {}

  @Header('Cache-Control', 'private, no-store')
  @Get('projects/:projectId/certification-cases')
  list(
    @Req() request: ActorContextRequest,
    @Param('projectId') projectId: string,
  ) {
    return this.certification.list({
      actor: requireActorContext(request),
      projectId,
    });
  }

  @Post('projects/:projectId/certification-cases')
  open(
    @Req() request: ActorContextRequest,
    @Param('projectId') projectId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.certification.open({
      actor: requireActorContext(request),
      projectId,
      body,
      key,
    });
  }

  @Header('Cache-Control', 'private, no-store')
  @Get('projects/:projectId/certification-legal-entities')
  legalEntities(
    @Req() request: ActorContextRequest,
    @Param('projectId') projectId: string,
  ) {
    return this.certification.legalEntities({
      actor: requireActorContext(request),
      projectId,
    });
  }

  @Header('Cache-Control', 'private, no-store')
  @Get('certification-cases/:caseId')
  detail(@Req() request: ActorContextRequest, @Param('caseId') caseId: string) {
    return this.certification.detail({
      actor: requireActorContext(request),
      caseId,
    });
  }

  @Header('Cache-Control', 'private, no-store')
  @Get('certification-cases/:caseId/timeline')
  timeline(
    @Req() request: ActorContextRequest,
    @Param('caseId') caseId: string,
  ) {
    return this.certification.timeline({
      actor: requireActorContext(request),
      caseId,
    });
  }

  @Post('certification-cases/:caseId/application')
  recordApplication(
    @Req() request: ActorContextRequest,
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.certification.recordApplication({
      actor: requireActorContext(request),
      caseId,
      body,
      key,
    });
  }

  @Post('certification-cases/:caseId/application-review')
  reviewApplication(
    @Req() request: ActorContextRequest,
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.certification.reviewApplication({
      actor: requireActorContext(request),
      caseId,
      body,
      key,
    });
  }

  @Header('Cache-Control', 'private, no-store')
  @HttpCode(200)
  @Post('certification-cases/:caseId/duration-proposal')
  durationProposal(
    @Req() request: ActorContextRequest,
    @Param('caseId') caseId: string,
    @Body() body: unknown,
  ) {
    return this.certification.durationProposal({
      actor: requireActorContext(request),
      caseId,
      body,
    });
  }

  @Post('certification-cases/:caseId/duration')
  confirmDuration(
    @Req() request: ActorContextRequest,
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.certification.confirmDuration({
      actor: requireActorContext(request),
      caseId,
      body,
      key,
    });
  }

  @Header('Cache-Control', 'private, no-store')
  @Get('certification-cases/:caseId/documents')
  documents(
    @Req() request: ActorContextRequest,
    @Param('caseId') caseId: string,
  ) {
    return this.certification.documents({
      actor: requireActorContext(request),
      caseId,
    });
  }

  @Post('certification-cases/:caseId/documents')
  attachDocument(
    @Req() request: ActorContextRequest,
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.certification.attachDocument({
      actor: requireActorContext(request),
      caseId,
      body,
      key,
    });
  }

  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @Get('certification-cases/:caseId/documents/:attachmentId/content')
  async documentContent(
    @Req() request: ActorContextRequest,
    @Param('caseId') caseId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    const content = await this.certification.documentContent({
      actor: requireActorContext(request),
      caseId,
      attachmentId,
    });
    return new StreamableFile(content.bytes, {
      type: 'application/pdf',
      length: content.bytes.length,
      disposition: `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent(content.fileName)}`,
    });
  }

  @Header('Cache-Control', 'private, no-store')
  @Get('certification-cases/:caseId/eligible-documents')
  eligibleDocuments(
    @Req() request: ActorContextRequest,
    @Param('caseId') caseId: string,
  ) {
    return this.certification.eligibleDocuments({
      actor: requireActorContext(request),
      caseId,
    });
  }

  @Post('certification-cases/:caseId/stages/:stage/plan')
  planStage(
    @Req() request: ActorContextRequest,
    @Param('caseId') caseId: string,
    @Param('stage') stage: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.certification.planStage({
      actor: requireActorContext(request),
      caseId,
      stage: auditStage(stage),
      body,
      key,
    });
  }

  @Post('certification-cases/:caseId/stages/:stage/report')
  reportStage(
    @Req() request: ActorContextRequest,
    @Param('caseId') caseId: string,
    @Param('stage') stage: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.certification.reportStage({
      actor: requireActorContext(request),
      caseId,
      stage: auditStage(stage),
      body,
      key,
    });
  }

  @Post('certification-cases/:caseId/findings')
  recordFinding(
    @Req() request: ActorContextRequest,
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.certification.recordFinding({
      actor: requireActorContext(request),
      caseId,
      body,
      key,
    });
  }

  @Post('certification-cases/:caseId/findings/:findingId/:update')
  recordFindingUpdate(
    @Req() request: ActorContextRequest,
    @Param('caseId') caseId: string,
    @Param('findingId') findingId: string,
    @Param('update') update: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.certification.recordFindingUpdate({
      actor: requireActorContext(request),
      caseId,
      findingId,
      kind: findingUpdate(update),
      body,
      key,
    });
  }

  @Post('certification-cases/:caseId/team')
  proposeTeam(
    @Req() request: ActorContextRequest,
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.certification.proposeTeam({
      actor: requireActorContext(request),
      caseId,
      body,
      key,
    });
  }

  @Post('certification-cases/:caseId/team-decision')
  decideTeam(
    @Req() request: ActorContextRequest,
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.certification.decideTeam({
      actor: requireActorContext(request),
      caseId,
      body,
      key,
    });
  }

  @Post('certification-cases/:caseId/agreement')
  recordAgreement(
    @Req() request: ActorContextRequest,
    @Param('caseId') caseId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.certification.recordAgreement({
      actor: requireActorContext(request),
      caseId,
      body,
      key,
    });
  }
}
