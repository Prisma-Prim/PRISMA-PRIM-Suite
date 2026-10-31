import { KnowledgeActorGuard } from './knowledge-identity.js';
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { CompanyContextAssignmentService } from '../access/company-context-assignment.service.js';
import { object } from './knowledge.validation.js';
import { KnowledgeService } from './knowledge.service.js';

@Controller('knowledge')
@UseGuards(ActorContextAdapter)
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}
  @Post('sources')
  create(
    @Req() request: ActorContextRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.knowledge.create({ actor: actor(request), body, key });
  }
  @Post('sources/:sourceId/admission')
  @HttpCode(200)
  admit(
    @Req() request: ActorContextRequest,
    @Param('sourceId') sourceId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.knowledge.change({
      actor: actor(request),
      sourceId,
      body,
      key,
      action: 'admit',
    });
  }
  @Post('sources/:sourceId/revocation')
  @HttpCode(200)
  revoke(
    @Req() request: ActorContextRequest,
    @Param('sourceId') sourceId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.knowledge.change({
      actor: actor(request),
      sourceId,
      body,
      key,
      action: 'revoke',
    });
  }
  @Get('sources/:sourceId/administration')
  inspect(
    @Req() request: ActorContextRequest,
    @Param('sourceId') sourceId: string,
  ) {
    return this.knowledge.inspect(actor(request), sourceId);
  }
}

@Controller('knowledge')
@UseGuards(KnowledgeActorGuard)
export class KnowledgeReadController {
  constructor(private readonly knowledge: KnowledgeService) {}
  @Get('sources')
  list(@Req() request: ActorContextRequest, @Query() query: unknown) {
    return this.knowledge.list(actor(request), query);
  }
  @Get('search')
  search(@Req() request: ActorContextRequest, @Query() query: unknown) {
    return this.knowledge.search(actor(request), query);
  }
  @Get('sources/:sourceId/passages/:locator')
  passage(
    @Req() request: ActorContextRequest,
    @Param('sourceId') sourceId: string,
    @Param('locator') locator: string,
    @Query() query: unknown,
  ) {
    return this.knowledge.getPassage(actor(request), sourceId, locator, query);
  }
}

@Controller('knowledge/assignments')
@UseGuards(ActorContextAdapter)
export class KnowledgeAssignmentController {
  constructor(private readonly assignments: CompanyContextAssignmentService) {}
  @Post('administrators')
  grantAdmin(
    @Req() request: ActorContextRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const input = object(body, ['workspaceMembershipId', 'companyId']);
    return this.assignments.grantKnowledgeSourceAdministrator(actor(request), {
      ...input,
      workspaceMembershipId: input.workspaceMembershipId,
      companyId: input.companyId,
      idempotencyKey,
    });
  }
  @Post('readers')
  grantReader(
    @Req() request: ActorContextRequest,
    @Body() body: unknown,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ) {
    const input = object(body, ['workspaceMembershipId', 'companyId']);
    return this.assignments.grantKnowledgeEvidenceReader(actor(request), {
      ...input,
      workspaceMembershipId: input.workspaceMembershipId,
      companyId: input.companyId,
      idempotencyKey,
    });
  }
  @Delete('administrators/:membershipId/:companyId')
  revokeAdmin(
    @Req() request: ActorContextRequest,
    @Param('membershipId') membershipId: string,
    @Param('companyId') companyId: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.assignments.revokeKnowledgeSourceAdministrator(
      actor(request),
      membershipId,
      companyId,
      key,
    );
  }
  @Delete('readers/:membershipId/:companyId')
  revokeReader(
    @Req() request: ActorContextRequest,
    @Param('membershipId') membershipId: string,
    @Param('companyId') companyId: string,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.assignments.revokeKnowledgeEvidenceReader(
      actor(request),
      membershipId,
      companyId,
      key,
    );
  }
}
function actor(request: ActorContextRequest) {
  if (!request.actorContext) throw new ForbiddenException();
  return request.actorContext;
}
