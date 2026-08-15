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
import { AccessService } from '../access/access.service.js';
import {
  ExternalPrincipalAdapter,
  type PrincipalRequest,
} from '../access/external-principal.adapter.js';
import { CompanyService } from './company.service.js';
import type { CompanyRecord } from './company.types.js';

@Controller('companies')
@UseGuards(ExternalPrincipalAdapter)
export class CompanyController {
  constructor(
    private readonly access: AccessService,
    private readonly companies: CompanyService,
  ) {}

  @Post()
  async register(
    @Req() request: PrincipalRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: { displayName?: unknown },
  ): Promise<CompanyRecord> {
    const actor = await this.access.resolveActor(request.externalPrincipal!);
    return this.companies.register(actor, {
      displayName: body?.displayName,
      idempotencyKey,
    });
  }

  @Get(':companyId')
  async get(
    @Req() request: PrincipalRequest,
    @Param('companyId', new ParseUUIDPipe()) companyId: string,
  ): Promise<CompanyRecord> {
    const actor = await this.access.resolveActor(request.externalPrincipal!);
    return this.companies.get(actor, companyId);
  }
}
