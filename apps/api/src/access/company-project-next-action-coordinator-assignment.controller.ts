import {
  Body,
  Controller,
  Delete,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from './actor-context.adapter.js';
import { CompanyContextAssignmentService } from './company-context-assignment.service.js';
import type { CompanyContextAssignmentRecord } from './company-context-assignment.types.js';

@Controller('company-project-next-action-coordinator-assignments')
@UseGuards(ActorContextAdapter)
export class CompanyProjectNextActionCoordinatorAssignmentController {
  constructor(private readonly assignments: CompanyContextAssignmentService) {}
  @Post()
  grant(
    @Req() request: ActorContextRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() value: unknown,
  ): Promise<CompanyContextAssignmentRecord> {
    if (!request.actorContext) throw new ForbiddenException();
    const body =
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value))
        : {};
    return this.assignments.grantProjectNextActionCoordinator(
      request.actorContext,
      {
        workspaceMembershipId: body.workspaceMembershipId,
        companyId: body.companyId,
        idempotencyKey: key,
      },
    );
  }
  @Delete(':workspaceMembershipId/:companyId')
  revoke(
    @Req() request: ActorContextRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Param('workspaceMembershipId') workspaceMembershipId: string,
    @Param('companyId') companyId: string,
  ): Promise<CompanyContextAssignmentRecord> {
    if (!request.actorContext) throw new ForbiddenException();
    return this.assignments.revokeProjectNextActionCoordinator(
      request.actorContext,
      {
        workspaceMembershipId,
        companyId,
        idempotencyKey: key,
      },
    );
  }
}
