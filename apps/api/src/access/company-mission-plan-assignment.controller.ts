import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
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
@Controller()
@UseGuards(ActorContextAdapter)
export class CompanyMissionPlanAssignmentController {
  constructor(private readonly assignments: CompanyContextAssignmentService) {}
  @Post('company-mission-plan-configuration-assignments')
  grantConfiguration(
    @Req() request: ActorContextRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.assignments.grantMissionPlan({
      actor: actor(request),
      role: 'configuration',
      ...command(body),
      idempotencyKey: key,
    });
  }
  @Post('company-mission-plan-user-assignments')
  grantUser(
    @Req() request: ActorContextRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.assignments.grantMissionPlan({
      actor: actor(request),
      role: 'user',
      ...command(body),
      idempotencyKey: key,
    });
  }
  @Delete(
    'company-mission-plan-configuration-assignments/:workspaceMembershipId/:companyId',
  )
  revokeConfiguration(
    @Req() request: ActorContextRequest,
    @Param('workspaceMembershipId') workspaceMembershipId: string,
    @Param('companyId') companyId: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.assignments.revokeMissionPlan({
      actor: actor(request),
      role: 'configuration',
      workspaceMembershipId,
      companyId,
      idempotencyKey: key,
    });
  }
  @Delete(
    'company-mission-plan-user-assignments/:workspaceMembershipId/:companyId',
  )
  revokeUser(
    @Req() request: ActorContextRequest,
    @Param('workspaceMembershipId') workspaceMembershipId: string,
    @Param('companyId') companyId: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.assignments.revokeMissionPlan({
      actor: actor(request),
      role: 'user',
      workspaceMembershipId,
      companyId,
      idempotencyKey: key,
    });
  }
}
function actor(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
function command(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return { companyId: undefined, workspaceMembershipId: undefined };
  const body = Object.fromEntries(Object.entries(value));
  return {
    companyId: body.companyId,
    workspaceMembershipId: body.workspaceMembershipId,
  };
}
