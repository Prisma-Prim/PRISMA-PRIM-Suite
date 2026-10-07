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

@Controller('company-profitability-director-assignments')
@UseGuards(ActorContextAdapter)
export class CompanyProfitabilityDirectorAssignmentController {
  constructor(private readonly assignments: CompanyContextAssignmentService) {}

  @Post()
  grant(
    @Req() request: ActorContextRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
  ) {
    const command = record(body);
    return this.assignments.grantProfitabilityDirector(actorFrom(request), {
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
    return this.assignments.revokeProfitabilityDirector(
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

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return {};
  return Object.fromEntries(Object.entries(value));
}
