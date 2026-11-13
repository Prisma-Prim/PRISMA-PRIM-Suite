import {
  Body,
  Controller,
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
  requireActorContext,
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
    return this.invitations.issue(
      requireActorContext(request),
      body ?? {},
      key,
    );
  }
  @Get()
  list(@Req() request: ActorContextRequest, @Query('after') after?: string) {
    return this.invitations.list(requireActorContext(request), after);
  }
  @Post(':id/refresh')
  refresh(@Req() request: ActorContextRequest, @Param('id') id: string) {
    return this.invitations.refresh(requireActorContext(request), id);
  }
  @Post(':id/revoke')
  revoke(
    @Req() request: ActorContextRequest,
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.invitations.revoke(requireActorContext(request), id, key);
  }
}
