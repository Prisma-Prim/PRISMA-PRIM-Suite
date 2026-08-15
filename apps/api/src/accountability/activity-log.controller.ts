import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AccessService } from '../access/access.service.js';
import {
  ExternalPrincipalAdapter,
  type PrincipalRequest,
} from '../access/external-principal.adapter.js';
import { AccountabilityService } from './accountability.service.js';
import type { ActivityLogPage } from './accountability.types.js';

@Controller('activity-log')
export class ActivityLogController {
  constructor(
    private readonly accessService: AccessService,
    private readonly accountability: AccountabilityService,
  ) {}

  @Get()
  @UseGuards(ExternalPrincipalAdapter)
  async list(@Req() request: PrincipalRequest): Promise<ActivityLogPage> {
    const actor = await this.accessService.resolveActor(
      request.externalPrincipal!,
    );
    return this.accountability.listForActor(actor);
  }
}
