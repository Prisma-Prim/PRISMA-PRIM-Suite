import { OfferVersionDifferences } from './offer-version-differences.js';
import type { PricingSnapshotService } from '../pricing-configuration/pricing-snapshot.service.js';
import { and, eq } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import type { CommercialIntakeService } from '../commercial-intake/commercial-intake.service.js';
import type { ServerClock } from '../clock/server-clock.js';
import type { DatabaseContext } from '../database/database-context.js';
import {
  offers,
  offerVersions,
  offerDecisions,
  INTERNAL_ESTIMATE_OFFER_PROVENANCE,
} from '../database/schema/index.js';
import type { OfferRecipientCopy, OfferDecision } from './offer.types.js';
import type {
  EstimateOfferPriceSource,
  InternalOfferRecord,
  InternalOfferVersionRecord,
} from './offer-estimate-preparation.types.js';

type OfferRow = typeof offers.$inferSelect;
type VersionRow = typeof offerVersions.$inferSelect;

/** Price-only reads borrow the Offer owner's transaction and never read costs. */
export class EstimateOfferView {
  constructor(
    private readonly dependencies: {
      database: DatabaseContext;
      intake: CommercialIntakeService;
      clock: ServerClock;
      pricing: PricingSnapshotService;
    },
  ) {}

  async readPrepared(input: {
    actor: ActorContext;
    offer: OfferRow;
    version: VersionRow;
    revision: number;
  }): Promise<InternalOfferRecord> {
    const { clientReference, ...recorded } = await this.read(input);
    void clientReference;
    return {
      ...recorded,
      revision: input.revision,
      version: {
        ...recorded.version,
        supersededByVersionId: null,
        supersededAt: null,
        decisionState: 'PENDING',
        decision: null,
        validityElapsed: false,
      },
    };
  }

  async read({
    actor,
    offer,
    version,
  }: {
    actor: ActorContext;
    offer: OfferRow;
    version: VersionRow;
  }): Promise<InternalOfferRecord> {
    const priceSource = storedEstimatePrice(version);
    const clientReference =
      await this.dependencies.intake.readPricingClientProjection(
        actor,
        offer.originalClientAccountId,
      );
    const [decision] = await this.dependencies.database.connection
      .select()
      .from(offerDecisions)
      .where(
        and(
          eq(offerDecisions.workspaceId, offer.workspaceId),
          eq(offerDecisions.companyId, offer.companyId),
          eq(offerDecisions.offerVersionId, version.id),
        ),
      );
    const content = {
      id: version.id,
      versionNumber: version.versionNumber,
      predecessorVersionId: version.predecessorVersionId,
      supersededByVersionId: version.supersededByVersionId,
      supersededAt: version.supersededAt?.toISOString() ?? null,
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
      validityElapsed: this.dependencies.clock.now() >= version.validUntil,
      provenance: INTERNAL_ESTIMATE_OFFER_PROVENANCE,
      provisional: true,
      priceSource,
      transmissionState: 'NOT_TRANSMITTED',
      transmission: null,
      clientResponseState: 'NONE',
      clientResponse: null,
      latestQualityRun: null,
    } satisfies Omit<InternalOfferVersionRecord, 'decision' | 'decisionState'>;
    let resolvedVersion: InternalOfferVersionRecord;
    if (decision) {
      if (decision.state !== 'REJECTED' || decision.reason === null)
        throw new Error('The stored internal Offer decision is invalid.');
      const rejection = {
        id: decision.id,
        offerVersionId: decision.offerVersionId,
        offerRevision: decision.offerRevision,
        actorWorkspaceMembershipId: decision.actorWorkspaceMembershipId,
        decidedAt: decision.decidedAt.toISOString(),
        state: 'REJECTED',
        reason: decision.reason,
      } satisfies Extract<OfferDecision, { state: 'REJECTED' }>;
      resolvedVersion = {
        ...content,
        decisionState: 'REJECTED',
        decision: rejection,
      };
    } else
      resolvedVersion = {
        ...content,
        decisionState: 'PENDING',
        decision: null,
      };
    return {
      id: offer.id,
      companyId: offer.companyId,
      opportunityId: offer.opportunityId,
      clientRequestId: offer.clientRequestId,
      originalClientAccountId: offer.originalClientAccountId,
      illustrativeReference: offer.illustrativeReference,
      revision: offer.revision,
      provisional: true,
      createdByWorkspaceMembershipId: offer.createdByWorkspaceMembershipId,
      createdAt: offer.createdAt.toISOString(),
      ...(clientReference ? { clientReference } : {}),
      version: resolvedVersion,
    };
  }
}

export function storedEstimatePrice(row: VersionRow): EstimateOfferPriceSource {
  if (
    row.provenance !== INTERNAL_ESTIMATE_OFFER_PROVENANCE ||
    row.pricingSnapshotId !== null ||
    row.templateCode !== null ||
    row.templateVersion !== null ||
    row.estimateSourceId === null ||
    row.estimateSourceVersionId === null ||
    row.estimateSourceVersionNumber === null ||
    row.estimateSourceDecisionId === null ||
    row.estimateSourceDecisionCode !== 'APPROVE' ||
    row.estimateSourceApprovedAt === null ||
    row.estimateSourceAmount === null ||
    row.estimateSourceCurrency === null
  )
    throw new Error('The stored internal Offer price source is invalid.');
  return {
    kind: 'DIRECTOR_APPROVED_ESTIMATE',
    estimateId: row.estimateSourceId,
    estimateVersionId: row.estimateSourceVersionId,
    estimateVersionNumber: row.estimateSourceVersionNumber,
    approvalDecisionId: row.estimateSourceDecisionId,
    approvedAt: row.estimateSourceApprovedAt.toISOString(),
    amount: row.estimateSourceAmount,
    currency: row.estimateSourceCurrency,
    taxTreatment: 'UNSPECIFIED',
  };
}

function storedRecipient(row: VersionRow): OfferRecipientCopy {
  const facts = {
    legalName: row.recipientLegalName,
    taxId: row.recipientTaxId,
    legalAddress: row.recipientLegalAddress,
  };
  if (row.recipientKind === 'PRIMARY') return { ...facts, kind: 'PRIMARY' };
  if (
    row.recipientKind === 'ADDITIONAL' &&
    row.recipientAdditionalLegalEntityId !== null
  )
    return {
      ...facts,
      kind: 'ADDITIONAL',
      additionalLegalEntityId: row.recipientAdditionalLegalEntityId,
    };
  throw new Error('The stored internal Offer recipient is invalid.');
}
