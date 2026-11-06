import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { PaymentService } from './payment.service.js';
import { PaymentStore } from './payment.store.js';
@Module({
  imports: [
    AccessModule,
    DatabaseModule,
    DocumentsModule,
    AccountabilityModule,
  ],
  providers: [PaymentService, PaymentStore],
  exports: [PaymentService],
})
export class PaymentModule {}
