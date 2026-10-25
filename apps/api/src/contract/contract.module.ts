import { ModelContractService } from './model-contract.service.js';
import { ContractModelModule } from '../contract-model/contract-model.module.js';
import { ContractVersionReader } from './contract-version-reader.js';
import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { AccountabilityModule } from '../accountability/accountability.module.js';
import { ClientModule } from '../client/client.module.js';
import { ServerClockModule } from '../clock/server-clock.js';
import { CommercialIntakeModule } from '../commercial-intake/commercial-intake.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { OfferModule } from '../offer/offer.module.js';
import { PricingConfigurationModule } from '../pricing-configuration/pricing-configuration.module.js';
import { ContractService } from './contract.service.js';
import { ContractProjectsService } from './contract-projects.service.js';
import { ProjectModule } from '../project/project.module.js';
import { ContractProjectLinkStore } from './contract-project-link.store.js';
import { ContractProjectCreationService } from './contract-project-creation.service.js';
@Module({
  imports: [
    AccessModule,
    ContractModelModule,
    ProjectModule,
    AccountabilityModule,
    ClientModule,
    CommercialIntakeModule,
    DatabaseModule,
    OfferModule,
    PricingConfigurationModule,
    ServerClockModule,
  ],
  providers: [
    ContractVersionReader,
    ModelContractService,
    ContractService,
    ContractProjectsService,
    ContractProjectLinkStore,
    ContractProjectCreationService,
  ],
  exports: [
    ModelContractService,
    ContractService,
    ContractProjectsService,
    ContractProjectCreationService,
  ],
})
export class ContractModule {}
