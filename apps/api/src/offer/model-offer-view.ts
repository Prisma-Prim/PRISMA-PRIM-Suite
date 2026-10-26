import type { ActorContext } from '../access/access.types.js';
import type { DatabaseContext } from '../database/database-context.js';
import { offers, offerVersions } from '../database/schema/index.js';
import type { PricingSnapshotService } from '../pricing-configuration/pricing-snapshot.service.js';
import { OfferVersionDifferences } from './offer-version-differences.js';
import { storedModelOfferSnapshot } from './model-offer-snapshot.js';
import { storedRecipient } from './offer-stored-content.js';
import type { ModelOfferRecord } from './offer-estimate-preparation.types.js';

/** Immutable model content only. The Offer owner supplies live workflow facts. */
export class ModelOfferView {
  constructor(
    private readonly dependencies: {
      database: DatabaseContext;
      pricing: PricingSnapshotService;
    },
  ) {}

  async readPrepared(input: {
    actor: ActorContext;
    offer: typeof offers.$inferSelect;
    version: typeof offerVersions.$inferSelect;
    revision: number;
  }): Promise<ModelOfferRecord> {
    const { actor, offer, version } = input;
    const frozen = storedModelOfferSnapshot(
      version,
      offer.illustrativeReference,
    );
    return {
      id: offer.id,
      companyId: offer.companyId,
      opportunityId: offer.opportunityId,
      clientRequestId: offer.clientRequestId,
      originalClientAccountId: offer.originalClientAccountId,
      illustrativeReference: offer.illustrativeReference,
      revision: input.revision,
      provisional: true,
      createdByWorkspaceMembershipId: offer.createdByWorkspaceMembershipId,
      createdAt: offer.createdAt.toISOString(),
      version: {
        ...frozen,
        id: version.id,
        versionNumber: version.versionNumber,
        predecessorVersionId: version.predecessorVersionId,
        supersededByVersionId: null,
        supersededAt: null,
        differences: await new OfferVersionDifferences(
          this.dependencies.database,
          this.dependencies.pricing,
        ).read({ actor, version }),
        recipient: storedRecipient(version),
        issuingCompanyLabel: version.issuingCompanyLabel,
        validityDays: version.validityDays,
        validUntil: version.validUntil.toISOString(),
        scopeNote: version.scopeNote,
        commercialConditions: version.commercialConditions,
        createdByWorkspaceMembershipId: version.createdByWorkspaceMembershipId,
        createdAt: version.createdAt.toISOString(),
        validityElapsed: false,
        provenance: 'COMPANY_MODEL_ESTIMATE',
        provisional: true,
        eligibility: 'NON_OFFICIAL_REHEARSAL',
        qualityRuleSet: 'OFFER_QUALITY_COMPANY_MODEL',
        qualityRuleSetVersion: 1,
        decisionState: 'PENDING',
        decision: null,
        latestQualityRun: null,
        transmissionState: 'NOT_TRANSMITTED',
        transmission: null,
        clientResponseState: 'NONE',
        clientResponse: null,
      },
    };
  }
}
