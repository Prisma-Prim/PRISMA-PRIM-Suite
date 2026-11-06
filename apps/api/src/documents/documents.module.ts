import { ReceivedAddendumRelationsService } from './received-addendum-relations.service.js';
import { DocumentPaymentSource } from './document-payment-source.js';
import { PaymentEvidenceSourcesService } from './payment-evidence-sources.service.js';
import { DocumentInvoiceRecordSource } from './document-invoice-record-source.js';
import { ExternalInvoiceRelationsService } from './external-invoice-relations.service.js';
import { ProjectPdfBundleService } from './project-pdf-bundle.service.js';
import { DocumentSigningReferenceService } from './document-signing-reference.service.js';
import { DocumentContentService } from './document-content.service.js';
import { ReceivedContractRelationsService } from './received-contract-relations.service.js';
import { ContractDocumentReferenceModule } from '../contract/contract-document-reference.module.js';
import { DocumentTaskResultReferenceService } from './document-task-result-reference.service.js';
import { DocumentWorkingEvidenceReferenceService } from './document-working-evidence-reference.service.js';
import { DocumentPdfStorage } from './document-pdf-storage.js';
import { DocumentMalwareScanner } from './document-malware-scanner.js';
import { ProjectModule } from '../project/project.module.js';
import { DocumentProjectsService } from './document-projects.service.js';
import { AccessModule } from '../access/access.module.js';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { ClientModule } from '../client/client.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { DocumentsService } from './documents.service.js';
import { DocumentReadBoundary } from './document-read-boundary.js';
import { DocumentVersionsService } from './document-versions.service.js';
@Module({
  imports: [
    ContractDocumentReferenceModule,
    ProjectModule,
    AccessModule,
    DatabaseModule,
    ClientModule,
    AccountabilityModule,
  ],
  providers: [
    DocumentPaymentSource,
    PaymentEvidenceSourcesService,
    DocumentInvoiceRecordSource,
    ProjectPdfBundleService,
    ReceivedContractRelationsService,
    ReceivedAddendumRelationsService,
    ExternalInvoiceRelationsService,
    DocumentsService,
    DocumentProjectsService,
    DocumentReadBoundary,
    DocumentVersionsService,
    DocumentContentService,
    DocumentSigningReferenceService,
    DocumentTaskResultReferenceService,
    DocumentWorkingEvidenceReferenceService,
    DocumentPdfStorage,
    DocumentMalwareScanner,
  ],
  exports: [
    DocumentPaymentSource,
    DocumentInvoiceRecordSource,
    DocumentReadBoundary,
    ProjectPdfBundleService,
    DocumentsService,
    DocumentProjectsService,
    DocumentVersionsService,
    DocumentContentService,
    DocumentSigningReferenceService,
    DocumentTaskResultReferenceService,
    DocumentWorkingEvidenceReferenceService,
  ],
})
export class DocumentsModule {}
