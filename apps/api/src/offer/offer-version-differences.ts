import { and, eq } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import type { DatabaseContext } from '../database/database-context.js';
import { offerVersions } from '../database/schema/index.js';
import type { PricingSnapshotService } from '../pricing-configuration/pricing-snapshot.service.js';
import type { PricingSnapshotRecord } from '../pricing-configuration/pricing-snapshot.types.js';
import type { OfferVersionDifference } from './offer.types.js';

type Version = typeof offerVersions.$inferSelect;
type Fields = Record<string, string | number | null>;

/** Comparisons read only immutable commercial content, never estimate costs. */
export class OfferVersionDifferences {
  constructor(
    private readonly database: DatabaseContext,
    private readonly pricing: PricingSnapshotService,
  ) {}

  async read({
    actor,
    version,
    snapshot,
  }: {
    actor: ActorContext;
    version: Version;
    snapshot?: PricingSnapshotRecord;
  }): Promise<OfferVersionDifference[]> {
    if (!version.predecessorVersionId) return [];
    const [previous] = await this.database.connection
      .select()
      .from(offerVersions)
      .where(
        and(
          eq(offerVersions.workspaceId, version.workspaceId),
          eq(offerVersions.companyId, version.companyId),
          eq(offerVersions.offerId, version.offerId),
          eq(offerVersions.id, version.predecessorVersionId),
        ),
      );
    if (!previous) throw new Error('The Offer predecessor is missing.');
    const mixed =
      previous.provenance !== 'ILLUSTRATIVE' ||
      version.provenance !== 'ILLUSTRATIVE';
    const before = await this.fields({ actor, version: previous, mixed });
    const after = await this.fields({ actor, version, snapshot, mixed });
    return Object.entries(after).map(([field, current]) => ({
      field,
      previous: before[field] ?? null,
      current,
      changed: before[field] !== current,
    }));
  }

  private async fields({
    actor,
    version,
    snapshot,
    mixed,
  }: {
    actor: ActorContext;
    version: Version;
    snapshot?: PricingSnapshotRecord;
    mixed: boolean;
  }): Promise<Fields> {
    const content = {
      recipientKind: version.recipientKind,
      recipientAdditionalLegalEntityId:
        version.recipientAdditionalLegalEntityId,
      recipientLegalName: version.recipientLegalName,
      recipientTaxId: version.recipientTaxId,
      recipientLegalAddress: version.recipientLegalAddress,
      validityDays: version.validityDays,
      validUntil: version.validUntil.toISOString(),
      scopeNote: version.scopeNote,
      commercialConditions: version.commercialConditions,
    };
    if (version.provenance === 'APPROVED_ESTIMATE_INTERNAL_DRAFT')
      return {
        ...content,
        pricingSnapshotId: null,
        currency: version.estimateSourceCurrency,
        total: null,
        priceSourceKind: 'DIRECTOR_APPROVED_ESTIMATE',
        estimateVersionId: version.estimateSourceVersionId,
        estimateVersionNumber: version.estimateSourceVersionNumber,
        approvalDecisionId: version.estimateSourceDecisionId,
        amount: version.estimateSourceAmount,
      };
    if (version.provenance !== 'ILLUSTRATIVE')
      throw new Error('Unsupported Offer price source.');
    const price =
      snapshot ??
      (await this.pricing.resolveOfferVersionSnapshot({
        actor,
        companyId: version.companyId,
        opportunityId: version.opportunityId,
        offerVersionId: version.id,
      }));
    // Preserve the original field order and exact legacy history vocabulary.
    return {
      recipientKind: content.recipientKind,
      recipientAdditionalLegalEntityId:
        content.recipientAdditionalLegalEntityId,
      recipientLegalName: content.recipientLegalName,
      recipientTaxId: content.recipientTaxId,
      recipientLegalAddress: content.recipientLegalAddress,
      pricingSnapshotId: price.id,
      currency: price.currency,
      total: price.total,
      validityDays: content.validityDays,
      validUntil: content.validUntil,
      scopeNote: content.scopeNote,
      commercialConditions: content.commercialConditions,
      ...(mixed
        ? {
            priceSourceKind: 'ILLUSTRATIVE_SNAPSHOT',
            estimateVersionId: null,
            estimateVersionNumber: null,
            approvalDecisionId: null,
            amount: null,
          }
        : {}),
    };
  }
}
