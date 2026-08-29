import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { ClientDuplicateReviewService } from './client-duplicate-review.service.js';
import { ClientDossierService } from './client-dossier.service.js';
import { ClientService } from './client.service.js';

@Module({
  imports: [AccessModule, AccountabilityModule, DatabaseModule],
  providers: [
    ClientDossierService,
    ClientDuplicateReviewService,
    ClientService,
  ],
  exports: [ClientDuplicateReviewService, ClientService],
})
export class ClientModule {}
