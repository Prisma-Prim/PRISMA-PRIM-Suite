import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ActorContextAdapter,
  type ActorContextRequest,
  requireActorContext,
} from '../access/actor-context.adapter.js';
import { InvoiceRecordService } from './invoice-record.service.js';
@Controller('invoice-records')
@UseGuards(ActorContextAdapter)
export class InvoiceRecordController {
  constructor(private readonly invoices: InvoiceRecordService) {}
  @Get() @Header('Cache-Control', 'private, no-store') inventory(
    @Req() r: ActorContextRequest,
    @Query() q: unknown,
  ) {
    return this.invoices.inventory(requireActorContext(r), q);
  }
  @Get('sources') @Header('Cache-Control', 'private, no-store') sources(
    @Req() r: ActorContextRequest,
    @Query() q: unknown,
  ) {
    return this.invoices.sources(requireActorContext(r), q);
  }
  @Post() @Header('Cache-Control', 'private, no-store') create(
    @Req() r: ActorContextRequest,
    @Body() b: unknown,
    @Headers('idempotency-key') k: string | undefined,
  ) {
    return this.invoices.create(requireActorContext(r), b, k);
  }
  @Get(':id') @Header('Cache-Control', 'private, no-store') read(
    @Req() r: ActorContextRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() q: unknown,
  ) {
    return this.invoices.read(requireActorContext(r), id.toLowerCase(), q);
  }
  @Get(':id/history') @Header('Cache-Control', 'private, no-store') history(
    @Req() r: ActorContextRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() q: unknown,
  ) {
    return this.invoices.history(requireActorContext(r), id.toLowerCase(), q);
  }
  @Post(':id/commands') @Header('Cache-Control', 'private, no-store') change(
    @Req() r: ActorContextRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() b: unknown,
    @Headers('idempotency-key') k: string | undefined,
  ) {
    return this.invoices.change(requireActorContext(r), id.toLowerCase(), b, k);
  }
  @Get(':id/source')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async source(
    @Req() r: ActorContextRequest,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() q: unknown,
  ) {
    const pdf = await this.invoices.download(
      requireActorContext(r),
      id.toLowerCase(),
      q,
    );
    return new StreamableFile(pdf.bytes, {
      type: 'application/pdf',
      length: pdf.size,
      disposition: `attachment; filename="external-invoice.pdf"; filename*=UTF-8''${encodeURIComponent(pdf.fileName).replace(/['()*]/gu, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`,
    });
  }
}
