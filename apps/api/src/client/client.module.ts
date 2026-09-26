import { ClientOperationalReferenceService } from './client-operational-reference.service.js';
import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { ClientDuplicateReviewService } from './client-duplicate-review.service.js';
import { ClientDossierService } from './client-dossier.service.js';
import { ClientLegalEntityService } from './client-legal-entity.service.js';
import { ClientService } from './client.service.js';
import { ClientIdentifierIndex } from './client-identifier-index.js';
import { ClientUnionService } from './client-union.service.js';

@Module({
  imports: [AccessModule, AccountabilityModule, DatabaseModule],
  providers: [
    ClientOperationalReferenceService,
    ClientIdentifierIndex,
    ClientUnionService,
    ClientDossierService,
    ClientLegalEntityService,
    ClientDuplicateReviewService,
    ClientService,
  ],
  exports: [
    ClientOperationalReferenceService,
    ClientDuplicateReviewService,
    ClientService,
    ClientUnionService,
  ],
})
export class ClientModule {}
