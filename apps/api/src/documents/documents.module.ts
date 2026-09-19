import { AccessModule } from '../access/access.module.js';
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { ClientModule } from '../client/client.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { DocumentsService } from './documents.service.js';
@Module({
  imports: [AccessModule, DatabaseModule, ClientModule, AccountabilityModule],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
