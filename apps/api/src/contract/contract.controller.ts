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
@Controller('contracts/opportunities/:opportunityId')
@UseGuards(ActorContextAdapter)
export class ContractController {
  constructor(private readonly contracts: ContractService) {}
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
  @Get() async read(
    @Req() request: ActorContextRequest,
    @Param('opportunityId') opportunityId: string,
  ) {
    return {
      contract: await this.contracts.read({
        actor: actorFrom(request),
        opportunityId,
      }),
    };
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
