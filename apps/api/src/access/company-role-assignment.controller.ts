import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
  requireActorContext,
} from './actor-context.adapter.js';
import { CompanyContextAssignmentService } from './company-context-assignment.service.js';
import {
  CompanyRoleAssignmentRouteGuard,
  type CompanyRoleAssignmentRequest,
  requireCompanyRoleAssignmentBundle,
} from './company-role-assignment-route.guard.js';

@Controller()
export class CompanyRoleAssignmentController {
  constructor(private readonly assignments: CompanyContextAssignmentService) {}

  @Get('company-context-assignments/administration')
  @UseGuards(ActorContextAdapter)
  readAdministrationState(@Req() request: ActorContextRequest) {
    return this.assignments.readAdministrationState(
      requireActorContext(request),
    );
  }

  @Post('company-:noun-assignments')
  @UseGuards(CompanyRoleAssignmentRouteGuard, ActorContextAdapter)
  grant(
    @Req() request: CompanyRoleAssignmentRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() value: unknown,
  ) {
    const actor = requireActorContext(request);
    return this.assignments.executeAssignment(actor, {
      bundle: requireCompanyRoleAssignmentBundle(request),
      operation: 'grant',
      ...assignmentBody(value),
      idempotencyKey,
    });
  }

  @Delete('company-:noun-assignments/:workspaceMembershipId/:companyId')
  @UseGuards(CompanyRoleAssignmentRouteGuard, ActorContextAdapter)
  revoke(
    @Req() request: CompanyRoleAssignmentRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('workspaceMembershipId') workspaceMembershipId: string,
    @Param('companyId') companyId: string,
  ) {
    return this.assignments.executeAssignment(requireActorContext(request), {
      bundle: requireCompanyRoleAssignmentBundle(request),
      operation: 'revoke',
      workspaceMembershipId,
      companyId,
      idempotencyKey,
    });
  }
}

function assignmentBody(value: unknown) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2 ||
    Object.keys(value).some(
      (key) => key !== 'workspaceMembershipId' && key !== 'companyId',
    ) ||
    !('workspaceMembershipId' in value) ||
    !('companyId' in value)
  )
    throw new BadRequestException(
      'Expected exactly the Company and membership.',
    );
  return {
    workspaceMembershipId: value.workspaceMembershipId,
    companyId: value.companyId,
  };
}
