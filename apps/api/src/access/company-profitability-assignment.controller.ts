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

function actorFrom(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
function command(value: unknown): {
  workspaceMembershipId: unknown;
  companyId: unknown;
} {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return { workspaceMembershipId: undefined, companyId: undefined };
  const record = Object.fromEntries(Object.entries(value));
  return {
    workspaceMembershipId: record.workspaceMembershipId,
    companyId: record.companyId,
  };
}

@Controller('company-profitability-contributor-assignments')
@UseGuards(ActorContextAdapter)
export class CompanyProfitabilityContributorAssignmentController {
  constructor(private readonly assignments: CompanyContextAssignmentService) {}
  @Post() grant(
    @Req() request: ActorContextRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.assignments.grantProfitabilityContributor(actorFrom(request), {
      ...command(body),
      idempotencyKey: key,
    });
  }
  @Delete(':workspaceMembershipId/:companyId') revoke(
    @Req() request: ActorContextRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Param('workspaceMembershipId') memberId: string,
    @Param('companyId') companyId: string,
  ) {
    return this.assignments.revokeProfitabilityContributor(
      actorFrom(request),
      memberId,
      companyId,
      key,
    );
  }
}

@Controller('company-profitability-director-assignments')
@UseGuards(ActorContextAdapter)
export class CompanyProfitabilityDirectorAssignmentController {
  constructor(private readonly assignments: CompanyContextAssignmentService) {}
  @Post() grant(
    @Req() request: ActorContextRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.assignments.grantProfitabilityDirector(actorFrom(request), {
      ...command(body),
      idempotencyKey: key,
    });
  }
  @Delete(':workspaceMembershipId/:companyId') revoke(
    @Req() request: ActorContextRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Param('workspaceMembershipId') memberId: string,
    @Param('companyId') companyId: string,
  ) {
    return this.assignments.revokeProfitabilityDirector(
      actorFrom(request),
      memberId,
      companyId,
      key,
    );
  }
}
