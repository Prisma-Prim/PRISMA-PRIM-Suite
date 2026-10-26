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
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { ContractService } from './contract.service.js';
import { ContractProjectsService } from './contract-projects.service.js';
import { ContractProjectCreationService } from './contract-project-creation.service.js';
@Controller('contracts/opportunities/:opportunityId/agreements/:contractId')
@UseGuards(ActorContextAdapter)
export class ContractAgreementsController {
  constructor(
    private readonly contracts: ContractService,
    private readonly signing: ReportedContractSigningService,
    private readonly projects: ContractProjectsService,
    private readonly projectCreation: ContractProjectCreationService,
  ) {}
  @Get('project-candidates') candidates(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('contractId') contractId: string,
  ) {
    return this.projects.candidates({
      actor: actorFrom(request),
      opportunityId,
      contractId,
    });
  }
  @Post('projects') linkProject(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('contractId') contractId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.projects.link({
      actor: actorFrom(request),
      opportunityId,
      contractId,
      payload,
      idempotencyKey,
    });
  }
  @Post('projects/create') createProject(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('contractId') contractId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.projectCreation.create({
      actor: actorFrom(request),
      opportunityId,
      contractId,
      payload,
      idempotencyKey,
    });
  }
  @Post('addenda') createAddendum(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('contractId') parentContractId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.contracts.createAddendum({
      actor: actorFrom(request),
      opportunityId,
      parentContractId,
      payload,
      idempotencyKey,
    });
  }
  @Get() async read(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('contractId') contractId: string,
  ) {
    return {
      contract: await this.contracts.read({
        actor: actorFrom(request),
        opportunityId,
        contractId,
      }),
    };
  }
  @Get('versions/:versionId/signing-declarations/pdf-candidates')
  signingCandidates(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('contractId') contractId: string,
    @Param('versionId') versionId: string,
    @Query('cursor') cursor: string | undefined,
  ) {
    return this.signing.candidates({
      actor: actorFrom(request),
      opportunityId,
      versionId,
      contractId,
      cursor,
    });
  }
  @Post('versions/:versionId/signing-declarations') declareSigning(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('contractId') contractId: string,
    @Param('versionId') versionId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.signing.declare({
      actor: actorFrom(request),
      opportunityId,
      versionId,
      contractId,
      payload,
      idempotencyKey,
    });
  }
  @Post('versions/:versionId/signature') recordSignature(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('contractId') contractId: string,
    @Param('versionId') versionId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.contracts.recordSignature({
      actor: actorFrom(request),
      opportunityId,
      contractId,
      versionId,
      payload,
      idempotencyKey,
    });
  }
  @Post('versions/:versionId/approve') approve(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('contractId') contractId: string,
    @Param('versionId') versionId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.contracts.decide({
      actor: actorFrom(request),
      opportunityId,
      contractId,
      versionId,
      kind: 'APPROVE',
      payload,
      idempotencyKey,
    });
  }
  @Post('versions/:versionId/reject') reject(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('contractId') contractId: string,
    @Param('versionId') versionId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.contracts.decide({
      actor: actorFrom(request),
      opportunityId,
      contractId,
      versionId,
      kind: 'REJECT',
      payload,
      idempotencyKey,
    });
  }
  @Post('versions/:versionId/quality-checks') runQuality(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('contractId') contractId: string,
    @Param('versionId') versionId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.contracts.runQualityChecks({
      actor: actorFrom(request),
      opportunityId,
      contractId,
      versionId,
      payload,
      idempotencyKey,
    });
  }
  @Get('versions/:versionId/quality-checks') runs(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('contractId') contractId: string,
    @Param('versionId') versionId: string,
    @Query('limit') limit: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ) {
    return this.contracts.listQualityRuns({
      actor: actorFrom(request),
      opportunityId,
      contractId,
      versionId,
      limit,
      cursor,
    });
  }
  @Get('versions/:versionId/quality-checks/:runId') run(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('contractId') contractId: string,
    @Param('versionId') versionId: string,
    @Param('runId') runId: string,
  ) {
    return this.contracts.readQualityRun({
      actor: actorFrom(request),
      opportunityId,
      contractId,
      versionId,
      runId,
    });
  }
  @Get('versions') list(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('contractId') contractId: string,
    @Query('limit') limit: string | undefined,
    @Query('cursor') cursor: string | undefined,
  ) {
    return this.contracts.listVersions({
      actor: actorFrom(request),
      opportunityId,
      contractId,
      limit,
      cursor,
    });
  }
  @Post('versions') createVersion(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('contractId') contractId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    return this.contracts.createVersion({
      actor: actorFrom(request),
      opportunityId,
      contractId,
      payload,
      idempotencyKey,
    });
  }
  @Get('versions/:versionId') async version(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('contractId') contractId: string,
    @Param('versionId') versionId: string,
  ) {
    return {
      contract: await this.contracts.read({
        actor: actorFrom(request),
        opportunityId,
        contractId,
        versionId,
      }),
    };
  }
  @Get('versions/:versionId/representation') async representation(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
    @Param('contractId') contractId: string,
    @Param('versionId') versionId: string,
  ) {
    const contract = await this.contracts.read({
      actor: actorFrom(request),
      opportunityId,
      contractId,
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
