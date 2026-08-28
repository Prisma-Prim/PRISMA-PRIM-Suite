import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from './actor-context.adapter.js';
import { WorkspaceMembershipSuspensionService } from './workspace-membership-suspension.service.js';
import type { WorkspaceMembershipSuspensionRecord } from './workspace-membership-suspension.types.js';

@Controller('workspace-membership-suspensions')
@UseGuards(ActorContextAdapter)
export class WorkspaceMembershipSuspensionController {
  constructor(
    private readonly suspensions: WorkspaceMembershipSuspensionService,
  ) {}

  @Post()
  suspend(
    @Req() request: ActorContextRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: { workspaceMembershipId?: unknown },
  ): Promise<WorkspaceMembershipSuspensionRecord> {
    return this.suspensions.suspend(request.actorContext!, {
      workspaceMembershipId: body?.workspaceMembershipId,
      idempotencyKey,
    });
  }
}
