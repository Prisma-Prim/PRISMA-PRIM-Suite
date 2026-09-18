import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  VerifiedPrincipalAdapter,
  type VerifiedPrincipalRequest,
} from './verified-principal.adapter.js';
import { WorkspaceInvitationAcceptanceService } from './workspace-invitation-acceptance.service.js';

@Controller('access/invitations')
@UseGuards(VerifiedPrincipalAdapter)
export class WorkspaceInvitationAcceptanceController {
  constructor(
    private readonly acceptance: WorkspaceInvitationAcceptanceService,
  ) {}

  @Post('accept')
  accept(
    @Req() request: VerifiedPrincipalRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    if (!request.principal) throw new UnauthorizedException();
    return this.acceptance.accept({ principal: request.principal, body, key });
  }
}
