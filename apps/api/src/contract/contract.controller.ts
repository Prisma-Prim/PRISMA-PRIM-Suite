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
}
function actorFrom(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
