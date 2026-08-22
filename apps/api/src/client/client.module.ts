import { Module } from '@nestjs/common';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { ClientService } from './client.service.js';

@Module({
  imports: [AccountabilityModule, DatabaseModule],
  providers: [ClientService],
  exports: [ClientService],
})
export class ClientModule {}
