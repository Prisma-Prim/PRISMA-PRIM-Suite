import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { ClientModule } from '../client/client.module.js';
import { CertificationModule } from '../certification/certification.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { DocumentFamilyAccess } from '../documents/document-family-access.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { ProjectModule } from '../project/project.module.js';
import { DossierSafeFailureInterceptor } from './safe-failure.interceptor.js';
import { DossierAnalysisService } from './dossier-analysis.service.js';
import { DossierHistoryService } from './history.service.js';
import { DossierInventoryService } from './inventory.service.js';
import { DossierRunService } from './run.service.js';
import { DossierSourceAccess } from './source-access.js';
import { DossierSourceService } from './source.service.js';
import { DossierSuggestionService } from './suggestion.service.js';

@Module({
  imports: [
    AccessModule,
    CertificationModule,
    ClientModule,
    DatabaseModule,
    DocumentsModule,
    ProjectModule,
  ],
  providers: [
    DossierSafeFailureInterceptor,
    DocumentFamilyAccess,
    DossierSourceAccess,
    DossierSourceService,
    DossierHistoryService,
    DossierInventoryService,
    DossierRunService,
    DossierSuggestionService,
    DossierAnalysisService,
  ],
  exports: [
    DossierSafeFailureInterceptor,
    DossierAnalysisService,
    DossierSourceService,
    DossierRunService,
    DossierSuggestionService,
  ],
})
export class DossierAnalysisModule {}
