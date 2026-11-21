import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ServerClockModule } from '../clock/server-clock.js';
import { DatabaseModule } from '../database/database.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { ProjectModule } from '../project/project.module.js';
import { CertificationProcedureService } from './certification-procedure.service.js';
import { CertificationService } from './certification.service.js';
import { CertificationAuditService } from './certification-audit.service.js';
import { CertificationDecisionService } from './certification-decision.service.js';
import { CertificationDossierService } from './certification-dossier.service.js';
import { CertificationCaseReadModel } from './certification-case-read-model.js';
import { CertificationCaseTransactions } from './certification-case-transactions.js';

@Module({
  imports: [
    AccessModule,
    AccountabilityModule,
    DatabaseModule,
    DocumentsModule,
    ProjectModule,
    ServerClockModule,
  ],
  providers: [
    CertificationService,
    CertificationProcedureService,
    CertificationAuditService,
    CertificationDecisionService,
    CertificationDossierService,
    CertificationCaseReadModel,
    CertificationCaseTransactions,
  ],
  exports: [
    CertificationService,
    CertificationProcedureService,
    CertificationAuditService,
    CertificationDecisionService,
    CertificationDossierService,
  ],
})
export class CertificationModule {}
