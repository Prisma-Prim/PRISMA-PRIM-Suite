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

@Controller('company-offer-model-editor-assignments')
@UseGuards(ActorContextAdapter)
export class CompanyOfferModelEditorAssignmentController {
  constructor(private readonly assignments: CompanyContextAssignmentService) {}

  @Post()
  grant(
    @Req() request: ActorContextRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    const command = record(body);
    return this.assignments.grantOfferModel({
      actor: actorFrom(request),
      role: 'editor',
      workspaceMembershipId: command.workspaceMembershipId,
      companyId: command.companyId,
      idempotencyKey,
    });
  }

  @Delete(':workspaceMembershipId/:companyId')
  revoke(
    @Req() request: ActorContextRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('workspaceMembershipId') workspaceMembershipId: string,
    @Param('companyId') companyId: string,
  ) {
    return this.assignments.revokeOfferModel({
      role: 'editor',
      actor: actorFrom(request),
      workspaceMembershipId,
      companyId,
      idempotencyKey,
    });
  }
}

@Controller('company-offer-model-approver-assignments')
@UseGuards(ActorContextAdapter)
export class CompanyOfferModelApproverAssignmentController {
  constructor(private readonly assignments: CompanyContextAssignmentService) {}

  @Post()
  grant(
    @Req() request: ActorContextRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    const command = record(body);
    return this.assignments.grantOfferModel({
      actor: actorFrom(request),
      role: 'approver',
      workspaceMembershipId: command.workspaceMembershipId,
      companyId: command.companyId,
      idempotencyKey,
    });
  }

  @Delete(':workspaceMembershipId/:companyId')
  revoke(
    @Req() request: ActorContextRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('workspaceMembershipId') workspaceMembershipId: string,
    @Param('companyId') companyId: string,
  ) {
    return this.assignments.revokeOfferModel({
      role: 'approver',
      actor: actorFrom(request),
      workspaceMembershipId,
      companyId,
      idempotencyKey,
    });
  }
}

function actorFrom(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return {};
  return Object.fromEntries(Object.entries(value));
}
