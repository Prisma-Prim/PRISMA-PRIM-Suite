import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from './actor-context.adapter.js';
import { WorkspaceInvitationService } from './workspace-invitation.service.js';

@Controller('workspace-invitations')
@UseGuards(ActorContextAdapter)
export class WorkspaceInvitationController {
  constructor(private readonly invitations: WorkspaceInvitationService) {}

  @Post()
  issue(
    @Req() request: ActorContextRequest,
    @Body() body: { email?: unknown; expiresInDays?: unknown },
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.invitations.issue(actor(request), body ?? {}, key);
  }
  @Get()
  list(@Req() request: ActorContextRequest, @Query('after') after?: string) {
    return this.invitations.list(actor(request), after);
  }
  @Post(':id/refresh')
  refresh(@Req() request: ActorContextRequest, @Param('id') id: string) {
    return this.invitations.refresh(actor(request), id);
  }
  @Post(':id/revoke')
  revoke(
    @Req() request: ActorContextRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.invitations.revoke(actor(request), id, key);
  }
}

function actor(request: ActorContextRequest) {
  if (!request.actorContext) throw new UnauthorizedException();
  return request.actorContext;
}
