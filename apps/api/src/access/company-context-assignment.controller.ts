import {
  Body,
  Controller,
  Delete,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from './actor-context.adapter.js';
import { CompanyContextAssignmentService } from './company-context-assignment.service.js';
import type { CompanyContextAssignmentRecord } from './company-context-assignment.types.js';

@Controller('company-context-assignments')
@UseGuards(ActorContextAdapter)
export class CompanyContextAssignmentController {
  constructor(private readonly assignments: CompanyContextAssignmentService) {}

  @Post()
  grant(
    @Req() request: ActorContextRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: { workspaceMembershipId?: unknown; companyId?: unknown },
  ): Promise<CompanyContextAssignmentRecord> {
    return this.assignments.grant(request.actorContext!, {
      workspaceMembershipId: body?.workspaceMembershipId,
      companyId: body?.companyId,
      idempotencyKey,
    });
  }

  @Delete(':workspaceMembershipId/:companyId')
  revoke(
    @Req() request: ActorContextRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('workspaceMembershipId') workspaceMembershipId: string,
    @Param('companyId') companyId: string,
  ): Promise<CompanyContextAssignmentRecord> {
    return this.assignments.revoke(
      request.actorContext!,
      workspaceMembershipId,
      companyId,
      idempotencyKey,
    );
  }
}
