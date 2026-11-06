import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ClientModule } from '../client/client.module.js';
import { ServerClockModule } from '../clock/server-clock.js';
import { DatabaseModule } from '../database/database.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { ProjectModule } from '../project/project.module.js';
import { WorkingEvidenceService } from './working-evidence.service.js';
@Module({
  imports: [
    AccessModule,
    AccountabilityModule,
    ClientModule,
    ServerClockModule,
    DatabaseModule,
    DocumentsModule,
    ProjectModule,
  ],
  providers: [WorkingEvidenceService],
  exports: [WorkingEvidenceService],
})
export class WorkingEvidenceModule {}
