import { Body, Get, Headers, Param, Post, Query, Req } from '@nestjs/common';
import {
  type ActorContextRequest,
  requireActorContext,
} from '../access/actor-context.adapter.js';
import type {
  CompanyModelContent,
  CompanyModelIdentity,
} from './company-model.kind.js';
import type { CompanyModelService } from './company-model.service.js';

/**
 * The routes every Company model kind serves. A kind's controller extends it
 * with its own `@Controller` path and `ActorContextAdapter` guard.
 */
export abstract class CompanyModelController<
  Content extends CompanyModelContent,
  Identity extends CompanyModelIdentity,
  Selection extends string,
> {
  protected constructor(
    protected readonly models: CompanyModelService<
      Content,
      Identity,
      Selection
    >,
  ) {}

  @Get()
  read(@Req() request: ActorContextRequest) {
    return this.models.read({ actor: requireActorContext(request) });
  }
  @Get('versions')
  history(@Req() request: ActorContextRequest, @Query() query: unknown) {
    return this.models.history({ actor: requireActorContext(request), query });
  }
  @Get('versions/:versionId')
  readVersion(
    @Req() request: ActorContextRequest,
    @Param('versionId') versionId: string,
  ) {
    return this.models.readVersion({
      actor: requireActorContext(request),
      versionId,
    });
  }
  @Post('versions')
  submit(
    @Req() request: ActorContextRequest,
    @Body() payload: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.models.submit({
      actor: requireActorContext(request),
      payload,
      key,
    });
  }
  @Post('versions/:versionId/decision')
  decide(
    @Req() request: ActorContextRequest,
    @Param('versionId') versionId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.models.decide({
      actor: requireActorContext(request),
      versionId,
      payload,
      key,
    });
  }
  @Post('versions/:versionId/withdrawal')
  withdraw(
    @Req() request: ActorContextRequest,
    @Param('versionId') versionId: string,
    @Body() payload: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.models.withdraw({
      actor: requireActorContext(request),
      versionId,
      payload,
      key,
    });
  }
}
