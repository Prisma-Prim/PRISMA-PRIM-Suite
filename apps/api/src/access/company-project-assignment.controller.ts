import {
  BadRequestException,
  ForbiddenException,
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

@Controller('company-project-assignments')
@UseGuards(ActorContextAdapter)
export class CompanyProjectAssignmentController {
  constructor(private readonly assignments: CompanyContextAssignmentService) {}

  @Post()
  grant(
    @Req() request: ActorContextRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ): Promise<CompanyContextAssignmentRecord> {
    if (typeof body !== 'object' || body === null || Array.isArray(body))
      throw new BadRequestException();
    return this.assignments.grantProjectAccess(actorFrom(request), {
      workspaceMembershipId:
        'workspaceMembershipId' in body
          ? body.workspaceMembershipId
          : undefined,
      companyId: 'companyId' in body ? body.companyId : undefined,
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
    return this.assignments.revokeProjectAccess(
      actorFrom(request),
      workspaceMembershipId,
      companyId,
      idempotencyKey,
    );
  }
}

function actorFrom(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
