import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { InvoiceRecordService } from './invoice-record.service.js';
import { InvoiceRecordStore } from './invoice-record.store.js';
@Module({
  imports: [
    AccessModule,
    DatabaseModule,
    DocumentsModule,
    AccountabilityModule,
  ],
  providers: [InvoiceRecordService, InvoiceRecordStore],
  exports: [InvoiceRecordService],
})
export class InvoiceRecordModule {}
