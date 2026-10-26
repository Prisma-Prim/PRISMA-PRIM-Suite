import { storedModelOfferSnapshot } from './model-offer-snapshot.js';
import { offers } from '../database/schema/index.js';
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
    const includeModel =
      previous.provenance === 'COMPANY_MODEL_ESTIMATE' ||
      version.provenance === 'COMPANY_MODEL_ESTIMATE';
    const before = await this.fields({
      actor,
      version: previous,
      mixed,
      includeModel,
    });
    const after = await this.fields({
      actor,
      version,
      snapshot,
      mixed,
      includeModel,
    });
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
    includeModel,
  }: {
    actor: ActorContext;
    version: Version;
    snapshot?: PricingSnapshotRecord;
    mixed: boolean;
    includeModel: boolean;
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
    const modelFields: Fields = includeModel
      ? {
          modelVersionId: null,
          modelVersionNumber: null,
          modelApprovalDecisionId: null,
          taxAmount: null,
          taxLabel: null,
          declarationBasis: null,
          grossAmount: null,
        }
      : {};
    if (version.provenance === 'COMPANY_MODEL_ESTIMATE') {
      const [offer] = await this.database.connection
        .select({ reference: offers.illustrativeReference })
        .from(offers)
        .where(
          and(
            eq(offers.workspaceId, version.workspaceId),
            eq(offers.companyId, version.companyId),
            eq(offers.id, version.offerId),
          ),
        );
      if (!offer) throw new Error('Missing Offer identity.');
      const frozen = storedModelOfferSnapshot(version, offer.reference);
      return {
        ...content,
        pricingSnapshotId: null,
        currency: frozen.priceSource.currency,
        total: frozen.financialDeclaration.grossAmount,
        priceSourceKind: 'DIRECTOR_APPROVED_ESTIMATE',
        estimateVersionId: frozen.priceSource.estimateVersionId,
        estimateVersionNumber: frozen.priceSource.estimateVersionNumber,
        approvalDecisionId: frozen.priceSource.approvalDecisionId,
        amount: frozen.priceSource.amount,
        modelVersionId: frozen.modelSource.versionId,
        modelVersionNumber: frozen.modelSource.versionNumber,
        modelApprovalDecisionId: frozen.modelSource.approvalDecisionId,
        taxAmount: frozen.financialDeclaration.taxAmount,
        taxLabel: frozen.financialDeclaration.taxLabel,
        declarationBasis: frozen.financialDeclaration.basis,
        grossAmount: frozen.financialDeclaration.grossAmount,
      };
    }
    if (version.provenance === 'APPROVED_ESTIMATE_INTERNAL_DRAFT')
      return {
        ...content,
        ...modelFields,
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
            ...modelFields,
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
