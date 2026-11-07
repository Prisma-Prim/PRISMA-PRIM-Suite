import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  requireActorContext,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { CertificationService } from './certification.service.js';

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
}
