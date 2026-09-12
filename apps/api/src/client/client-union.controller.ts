import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import { ClientUnionService } from './client-union.service.js';
import type {
  ClientUnionComparison,
  ClientUnionOperationDetail,
} from './client-union.types.js';

@Controller('client-union-comparisons')
@UseGuards(ActorContextAdapter)
export class ClientUnionComparisonController {
  constructor(private readonly unions: ClientUnionService) {}

  @Post()
  compare(
    @Req() request: ActorContextRequest,
    @Body() body: { clientAccountIds?: unknown } | undefined,
  ): Promise<ClientUnionComparison> {
    return this.unions.compare(request.actorContext!, body?.clientAccountIds);
  }
}

@Controller('client-unions')
@UseGuards(ActorContextAdapter)
export class ClientUnionController {
  constructor(private readonly unions: ClientUnionService) {}

  @Post()
  confirm(
    @Req() request: ActorContextRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body()
    body:
      | {
          comparisonReference?: unknown;
          canonicalClientAccountId?: unknown;
          fieldSelections?: unknown;
          contactConsolidations?: unknown;
          reason?: unknown;
          confirmedCompanyIds?: unknown;
        }
      | undefined,
  ): Promise<ClientUnionOperationDetail> {
    return this.unions.confirm(request.actorContext!, {
      comparisonReference: body?.comparisonReference,
      canonicalClientAccountId: body?.canonicalClientAccountId,
      fieldSelections: body?.fieldSelections,
      contactConsolidations: body?.contactConsolidations,
      reason: body?.reason,
      confirmedCompanyIds: body?.confirmedCompanyIds,
      idempotencyKey,
    });
  }

  @Post(':unionOperationId/reversal')
  reverse(
    @Req() request: ActorContextRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('unionOperationId', new ParseUUIDPipe())
    unionOperationId: string,
    @Body() body: { reason?: unknown } | undefined,
  ): Promise<ClientUnionOperationDetail> {
    return this.unions.reverse(request.actorContext!, {
      unionOperationId,
      reason: body?.reason,
      idempotencyKey,
    });
  }

  @Get(':unionOperationId')
  read(
    @Req() request: ActorContextRequest,
    @Param('unionOperationId', new ParseUUIDPipe())
    unionOperationId: string,
  ): Promise<ClientUnionOperationDetail> {
    return this.unions.readOperation(request.actorContext!, unionOperationId);
  }
}
