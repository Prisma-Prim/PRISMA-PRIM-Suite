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
    ProjectModule,
    AccessModule,
    DatabaseModule,
    ClientModule,
    AccountabilityModule,
  ],
  providers: [
    DocumentsService,
    DocumentProjectsService,
    DocumentReadBoundary,
    DocumentVersionsService,
  ],
  exports: [DocumentsService, DocumentProjectsService, DocumentVersionsService],
})
export class DocumentsModule {}
