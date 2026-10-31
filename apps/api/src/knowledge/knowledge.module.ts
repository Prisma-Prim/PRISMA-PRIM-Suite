import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ServerClockModule } from '../clock/server-clock.js';
import { DatabaseModule } from '../database/database.module.js';
import { DocumentsModule } from '../documents/documents.module.js';
import { KnowledgeAuthorization } from './knowledge.authorization.js';
import { KnowledgeService } from './knowledge.service.js';

@Module({
  imports: [
    AccessModule,
    AccountabilityModule,
    ServerClockModule,
    DatabaseModule,
    DocumentsModule,
  ],
  providers: [KnowledgeAuthorization, KnowledgeService],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
