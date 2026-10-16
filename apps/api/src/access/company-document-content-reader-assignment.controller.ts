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

@Controller('company-document-content-reader-assignments')
@UseGuards(ActorContextAdapter)
export class CompanyDocumentContentReaderAssignmentController {
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
    return this.assignments.grantDocumentContentReader(request.actorContext, {
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
  ): Promise<CompanyContextAssignmentRecord> {
    if (!request.actorContext) throw new ForbiddenException();
    return this.assignments.revokeDocumentContentReader(
      request.actorContext,
      workspaceMembershipId,
      companyId,
      key,
    );
  }
}
