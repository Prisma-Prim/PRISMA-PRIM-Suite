import {
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
} from '../access/actor-context.adapter.js';
import type { ClientCorrectionHistoryPage } from '../accountability/accountability.types.js';
import { ClientService } from './client.service.js';
import type {
  ClientAccountView,
  ClientDossierFieldsInput,
  ClientDossierView,
} from './client.types.js';

@Controller('clients')
@UseGuards(ActorContextAdapter)
export class ClientController {
  constructor(private readonly clients: ClientService) {}

  @Get()
  list(@Req() request: ActorContextRequest): Promise<ClientAccountView[]> {
    return this.clients.query(request.actorContext!, {
      kind: 'active-company-list',
    });
  }

  @Get('search')
  search(
    @Req() request: ActorContextRequest,
    @Query('query') query: string | undefined,
  ): Promise<ClientAccountView[]> {
    return this.clients.query(request.actorContext!, {
      kind: 'workspace-search',
      query,
    });
  }

  @Post()
  register(
    @Req() request: ActorContextRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: ClientDossierFieldsInput,
  ): Promise<ClientAccountView> {
    return this.clients.execute(request.actorContext!, {
      kind: 'register',
      fields: body ?? {},
      idempotencyKey,
    });
  }

  @Put(':clientAccountId/active-company-relationship')
  attach(
    @Req() request: ActorContextRequest,
    @Param('clientAccountId', new ParseUUIDPipe()) clientAccountId: string,
  ): Promise<ClientAccountView> {
    return this.clients.execute(request.actorContext!, {
      kind: 'attach',
      clientAccountId,
    });
  }

  @Get(':clientAccountId')
  read(
    @Req() request: ActorContextRequest,
    @Param('clientAccountId', new ParseUUIDPipe()) clientAccountId: string,
  ): Promise<ClientDossierView> {
    return this.clients.query(request.actorContext!, {
      kind: 'dossier',
      clientAccountId,
    });
  }

  @Get(':clientAccountId/correction-history')
  readCorrectionHistory(
    @Req() request: ActorContextRequest,
    @Param('clientAccountId', new ParseUUIDPipe()) clientAccountId: string,
    @Query('cursor') cursor: unknown,
  ): Promise<ClientCorrectionHistoryPage> {
    return this.clients.readCorrectionHistory(request.actorContext!, {
      clientAccountId,
      cursor,
    });
  }

  @Patch(':clientAccountId')
  correct(
    @Req() request: ActorContextRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Param('clientAccountId', new ParseUUIDPipe()) clientAccountId: string,
    @Body()
    body: ClientDossierFieldsInput & { expectedVersion?: unknown },
  ): Promise<ClientDossierView> {
    const { expectedVersion, ...changes } = body ?? {};
    return this.clients.execute(request.actorContext!, {
      kind: 'correct',
      clientAccountId,
      expectedVersion,
      changes,
      idempotencyKey,
    });
  }
}
