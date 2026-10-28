import type { ServerResponse } from 'node:http';
import { readCommercialPdfAttachment } from '../commercial-pdf/commercial-pdf-read.js';
import { ContractPdfService } from './contract-pdf.service.js';
import { ModelContractService } from './model-contract.service.js';
import { ContractModelService } from '../contract-model/contract-model.service.js';
import { ReportedContractSigningService } from './reported-contract-signing.service.js';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { ContractService } from './contract.service.js';
import { ContractProjectsService } from './contract-projects.service.js';
import { ContractProjectCreationService } from './contract-project-creation.service.js';
@Controller('contracts/opportunities/:opportunityId')
@UseGuards(ActorContextAdapter)
export class ContractController {
  constructor(
    private readonly pdf: ContractPdfService,
    private readonly contracts: ContractService,
    private readonly signing: ReportedContractSigningService,
    private readonly modelContracts: ModelContractService,
    private readonly models: ContractModelService,
    private readonly projects: ContractProjectsService,
    private readonly projectCreation: ContractProjectCreationService,
  ) {}
  @Get('versions/:versionId/pdf')
  async downloadPdf(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('versionId') versionId: string,
    @Query() query: unknown,
    @Res({ passthrough: true })
    response: ServerResponse,
  ) {
    return readCommercialPdfAttachment(response, (signal) =>
      this.pdf.read({
        actor: actorFrom(request),
        opportunityId,
        versionId,
        query,
        signal,
      }),
    );
  }

  @Get('project-candidates') candidates(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
  ) {
    return this.projects.candidates({
      actor: actorFrom(request),
      opportunityId,
    });
  }
  @Post('projects') linkProject(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.projects.link({
      actor: actorFrom(request),
      opportunityId,
      payload,
      idempotencyKey,
    });
  }
  @Post('projects/create-from-mission-plan') createProjectFromMissionPlan(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.projectCreation.createFromMissionPlan({
      actor: actorFrom(request),
      opportunityId,
      payload,
      idempotencyKey,
    });
  }
  @Post('projects/create') createProject(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.projectCreation.create({
      actor: actorFrom(request),
      opportunityId,
      payload,
      idempotencyKey,
    });
  }
  @Post('direct') createDirect(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.contracts.createDirect({
      actor: actorFrom(request),
      opportunityId,
      payload,
      idempotencyKey,
    });
  }
  @Get('model-selection') modelSelection(@Req() request: ActorContextRequest) {
    return this.models.selectableForContract({ actor: actorFrom(request) });
  }
  @Post('from-approved-model') prepareModel(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.modelContracts.prepare({
      actor: actorFrom(request),
      opportunityId,
      payload,
      idempotencyKey,
    });
  }
  @Post('versions/from-approved-model') prepareModelVersion(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.modelContracts.createVersion({
      actor: actorFrom(request),
      opportunityId,
      payload,
      idempotencyKey,
    });
  }
  @Post('preparation') prepare(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.contracts.prepare({
      actor: actorFrom(request),
      opportunityId,
      payload,
      idempotencyKey,
    });
  }
  @Post() create(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.contracts.create({
      actor: actorFrom(request),
      opportunityId,
      payload,
      idempotencyKey,
    });
  }
  @Get() read(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
  ) {
    return this.contracts.readOpportunity({
      actor: actorFrom(request),
      opportunityId,
    });
  }
  @Get('versions/:versionId/signing-declarations/pdf-candidates')
  signingCandidates(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('versionId') versionId: string,
    @Query('cursor') cursor: string | undefined,
  ) {
    return this.signing.candidates({
      actor: actorFrom(request),
      opportunityId,
      versionId,
      cursor,
    });
  }
  @Post('versions/:versionId/signing-declarations') declareSigning(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('versionId') versionId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.signing.declare({
      actor: actorFrom(request),
      opportunityId,
      versionId,
      payload,
      idempotencyKey,
    });
  }
  @Post('versions/:versionId/signature') recordSignature(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('versionId') versionId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.contracts.recordSignature({
      actor: actorFrom(request),
      opportunityId,
      versionId,
      payload,
      idempotencyKey,
    });
  }
  @Post('versions/:versionId/approve') approve(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('versionId') versionId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.contracts.decide({
      actor: actorFrom(request),
      opportunityId,
      versionId,
      kind: 'APPROVE',
      payload,
      idempotencyKey,
    });
  }
  @Post('versions/:versionId/reject') reject(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('versionId') versionId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.contracts.decide({
      actor: actorFrom(request),
      opportunityId,
      versionId,
      kind: 'REJECT',
      payload,
      idempotencyKey,
    });
  }
  @Post('versions/:versionId/quality-checks') runQuality(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('versionId') versionId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.contracts.runQualityChecks({
      actor: actorFrom(request),
      opportunityId,
      versionId,
      payload,
      idempotencyKey,
    });
  }
  @Get('versions/:versionId/quality-checks') runs(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('versionId') versionId: string,
    @Query('limit') limit: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ) {
    return this.contracts.listQualityRuns({
      actor: actorFrom(request),
      opportunityId,
      versionId,
      limit,
      cursor,
    });
  }
  @Get('versions/:versionId/quality-checks/:runId') run(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('versionId') versionId: string,
    @Param('runId') runId: string,
  ) {
    return this.contracts.readQualityRun({
      actor: actorFrom(request),
      opportunityId,
      versionId,
      runId,
    });
  }
  @Get('versions') list(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Query('limit') limit: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ) {
    return this.contracts.listVersions({
      actor: actorFrom(request),
      opportunityId,
      limit,
      cursor,
    });
  }
  @Post('versions') createVersion(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.contracts.createVersion({
      actor: actorFrom(request),
      opportunityId,
      payload,
      idempotencyKey,
    });
  }
  @Get('versions/:versionId') async version(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('versionId') versionId: string,
  ) {
    return {
      contract: await this.contracts.read({
        actor: actorFrom(request),
        opportunityId,
        versionId,
      }),
    };
  }
  @Get('versions/:versionId/representation') async representation(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('versionId') versionId: string,
  ) {
    const contract = await this.contracts.read({
      actor: actorFrom(request),
      opportunityId,
      versionId,
    });
    if (!contract) throw new Error('Missing exact Contract Version.');
    return {
      contractId: contract.id,
      contractVersionId: contract.version.id,
      ...contract.version.representation,
    };
  }
}
function actorFrom(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}

@Controller('contracts/projects')
@UseGuards(ActorContextAdapter)
export class ProjectContractsController {
  constructor(private readonly projects: ContractProjectsService) {}
  @Get(':projectId') read(
    @Req() request: ActorContextRequest,
    @Param('projectId') projectId: string,
  ) {
    return this.projects.forProject({ actor: actorFrom(request), projectId });
  }
}
