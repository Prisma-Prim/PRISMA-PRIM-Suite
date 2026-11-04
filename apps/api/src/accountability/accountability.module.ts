import { InvoiceRecordAccountability } from './invoice-record-accountability.js';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AccountabilityService } from './accountability.service.js';

@Module({
  imports: [DatabaseModule],
  providers: [AccountabilityService, InvoiceRecordAccountability],
  exports: [AccountabilityService, InvoiceRecordAccountability],
})
export class AccountabilityModule {}
