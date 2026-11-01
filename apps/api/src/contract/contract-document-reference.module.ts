import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { ClientModule } from '../client/client.module.js';
import { CommercialIntakeModule } from '../commercial-intake/commercial-intake.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { ContractDocumentReferenceService } from './contract-document-reference.service.js';
import { ContractExternalInvoiceReferenceService } from './contract-external-invoice-reference.service.js';

@Module({
  imports: [AccessModule, ClientModule, CommercialIntakeModule, DatabaseModule],
  providers: [
    ContractDocumentReferenceService,
    ContractExternalInvoiceReferenceService,
  ],
  exports: [
    ContractDocumentReferenceService,
    ContractExternalInvoiceReferenceService,
  ],
})
export class ContractDocumentReferenceModule {}
