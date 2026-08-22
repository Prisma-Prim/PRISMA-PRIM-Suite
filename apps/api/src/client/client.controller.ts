import {
  Body,
  Controller,
  Get,
  Headers,
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
import { ClientService } from './client.service.js';
import type { ClientAccountView } from './client.types.js';

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
    @Body() body: { displayName?: unknown },
  ): Promise<ClientAccountView> {
    return this.clients.execute(request.actorContext!, {
      kind: 'register',
      displayName: body?.displayName,
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
}
