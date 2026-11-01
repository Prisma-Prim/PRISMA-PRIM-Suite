import {
  BadRequestException,
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

@Controller('company-external-invoice-access-assignments')
@UseGuards(ActorContextAdapter)
export class CompanyExternalInvoiceAccessAssignmentController {
  constructor(private readonly assignments: CompanyContextAssignmentService) {}
  @Post()
  grant(
    @Req() request: ActorContextRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Body() value: unknown,
  ) {
    const body =
      value && typeof value === 'object' && !Array.isArray(value)
        ? Object.fromEntries(Object.entries(value))
        : {};
    if (
      Object.keys(body).length !== 2 ||
      Object.keys(body).some(
        (key) => key !== 'workspaceMembershipId' && key !== 'companyId',
      )
    )
      throw new BadRequestException(
        'Expected exactly the Company and membership.',
      );
    return this.assignments.grantExternalInvoiceAccess(actor(request), {
      workspaceMembershipId: body.workspaceMembershipId,
      companyId: body.companyId,
      idempotencyKey: key,
    });
  }
  @Delete(':workspaceMembershipId/:companyId')
  revoke(
    @Req() request: ActorContextRequest,
    @Headers('idempotency-key') key: string | undefined,
    @Param('workspaceMembershipId') workspaceMembershipId: string,
    @Param('companyId') companyId: string,
  ) {
    return this.assignments.revokeExternalInvoiceAccess(actor(request), {
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
