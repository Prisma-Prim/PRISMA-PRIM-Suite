import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from './actor-context.adapter.js';
import { WorkspaceSessionRevocationService } from './workspace-session-revocation.service.js';

@Controller('workspace-session-revocations')
@UseGuards(ActorContextAdapter)
export class WorkspaceSessionRevocationController {
  constructor(
    private readonly revocations: WorkspaceSessionRevocationService,
  ) {}
  @Get()
  list(@Req() request: ActorContextRequest, @Query('after') after?: string) {
    if (!request.actorContext) throw new ForbiddenException();
    return this.revocations.list(request.actorContext, after);
  }
  @Post(':workspaceMembershipId/retry')
  async retry(
    @Req() request: ActorContextRequest,
    @Param('workspaceMembershipId') membershipId: string,
  ) {
    if (!request.actorContext) throw new ForbiddenException();
    await this.revocations.retry(request.actorContext, membershipId);
    return { status: 'checked' };
  }
}
