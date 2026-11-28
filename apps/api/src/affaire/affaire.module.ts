import { Module } from '@nestjs/common';
import { AccessModule } from '../access/access.module.js';
import { CertificationModule } from '../certification/certification.module.js';
import { ClientModule } from '../client/client.module.js';
import { CommercialIntakeModule } from '../commercial-intake/commercial-intake.module.js';
import { ContractModule } from '../contract/contract.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { OfferModule } from '../offer/offer.module.js';
import { OpportunityFollowUpModule } from '../opportunity-follow-up/opportunity-follow-up.module.js';
import { PricingConfigurationModule } from '../pricing-configuration/pricing-configuration.module.js';
import { ProfitabilityEstimateModule } from '../profitability-estimate/profitability-estimate.module.js';
import { ProjectModule } from '../project/project.module.js';
import { AffairePresenceStore } from './affaire-presence.store.js';
import { AffaireService } from './affaire.service.js';

/** Composes the stage owners' reads; no owner depends on it. */
@Module({
  imports: [
    AccessModule,
    CertificationModule,
    ClientModule,
    CommercialIntakeModule,
    ContractModule,
    DatabaseModule,
    OfferModule,
    OpportunityFollowUpModule,
    PricingConfigurationModule,
    ProfitabilityEstimateModule,
    ProjectModule,
  ],
  providers: [AffairePresenceStore, AffaireService],
  exports: [AffaireService],
})
export class AffaireModule {}
