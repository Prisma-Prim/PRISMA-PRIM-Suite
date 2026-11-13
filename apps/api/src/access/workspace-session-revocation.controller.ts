import {
  Controller,
  Get,
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
import { WorkspaceSessionRevocationService } from './workspace-session-revocation.service.js';

@Controller('workspace-session-revocations')
@UseGuards(ActorContextAdapter)
export class WorkspaceSessionRevocationController {
  constructor(
    private readonly revocations: WorkspaceSessionRevocationService,
  ) {}
  @Get()
  list(@Req() request: ActorContextRequest, @Query('after') after?: string) {
    return this.revocations.list(requireActorContext(request), after);
  }
  @Post(':workspaceMembershipId/retry')
  async retry(
    @Req() request: ActorContextRequest,
    @Param('workspaceMembershipId') membershipId: string,
  ) {
    await this.revocations.retry(requireActorContext(request), membershipId);
    return { status: 'checked' };
  }
}
