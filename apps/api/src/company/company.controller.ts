import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { CompanyService } from './company.service.js';
import type { CompanyRecord } from './company.types.js';

@Controller('companies')
@UseGuards(ActorContextAdapter)
export class CompanyController {
  constructor(private readonly companies: CompanyService) {}

  @Get()
  list(@Req() request: ActorContextRequest): Promise<CompanyRecord[]> {
    return this.companies.listVisible(request.actorContext!);
  }

  @Post()
  async register(
    @Req() request: ActorContextRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: { displayName?: unknown },
  ): Promise<CompanyRecord> {
    return this.companies.register(request.actorContext!, {
      displayName: body?.displayName,
      idempotencyKey,
    });
  }

  @Get(':companyId')
  async get(
    @Req() request: ActorContextRequest,
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
  ): Promise<CompanyRecord> {
    return this.companies.get(request.actorContext!, companyId);
  }
}
