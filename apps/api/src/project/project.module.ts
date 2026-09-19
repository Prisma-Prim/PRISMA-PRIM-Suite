import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ClientModule } from '../client/client.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { ProjectService } from './project.service.js';
@Module({
  imports: [AccessModule, AccountabilityModule, ClientModule, DatabaseModule],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
