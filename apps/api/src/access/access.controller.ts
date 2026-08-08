import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AccessService } from './access.service.js';
import type { ActorContext } from './access.types.js';
import {
  ExternalPrincipalAdapter,
  type PrincipalRequest,
} from './external-principal.adapter.js';

@Controller('access')
export class AccessController {
  constructor(private readonly accessService: AccessService) {}

  @Get('current-actor')
  @UseGuards(ExternalPrincipalAdapter)
  currentActor(@Req() request: PrincipalRequest): Promise<ActorContext> {
    return this.accessService.resolveActor(request.externalPrincipal!);
  }
}
