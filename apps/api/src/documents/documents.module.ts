import { DocumentContentService } from './document-content.service.js';
import { ReceivedContractRelationsService } from './received-contract-relations.service.js';
import { ContractDocumentReferenceModule } from '../contract/contract-document-reference.module.js';
import { DocumentTaskResultReferenceService } from './document-task-result-reference.service.js';
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
    ReceivedContractRelationsService,
    DocumentsService,
    DocumentProjectsService,
    DocumentReadBoundary,
    DocumentVersionsService,
    DocumentContentService,
    DocumentTaskResultReferenceService,
    DocumentPdfStorage,
    DocumentMalwareScanner,
  ],
  exports: [
    DocumentsService,
    DocumentProjectsService,
    DocumentVersionsService,
    DocumentContentService,
    DocumentTaskResultReferenceService,
  ],
})
export class DocumentsModule {}
