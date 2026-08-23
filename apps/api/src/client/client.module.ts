import { Module } from '@nestjs/common';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { ClientDossierService } from './client-dossier.service.js';
import { ClientService } from './client.service.js';

@Module({
  imports: [AccountabilityModule, DatabaseModule],
  providers: [ClientDossierService, ClientService],
  exports: [ClientService],
})
export class ClientModule {}
