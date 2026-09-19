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

@Controller('company-document-registrar-assignments')
@UseGuards(ActorContextAdapter)
export class CompanyDocumentRegistrarAssignmentController {
  constructor(private readonly assignments: CompanyContextAssignmentService) {}

  @Post()
  grant(
    @Req() request: ActorContextRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() value: unknown,
  ): Promise<CompanyContextAssignmentRecord> {
    const body: Record<string, unknown> =
      value && typeof value === 'object'
        ? Object.fromEntries(Object.entries(value))
        : {};
    return this.assignments.grantDocumentRegistrar(requireActor(request), {
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
    return this.assignments.revokeDocumentRegistrar(
      requireActor(request),
      workspaceMembershipId,
      companyId,
      idempotencyKey,
    );
  }
}

function requireActor(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
