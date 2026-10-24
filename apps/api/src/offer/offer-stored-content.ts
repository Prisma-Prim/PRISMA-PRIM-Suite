import {
  INTERNAL_ESTIMATE_OFFER_PROVENANCE,
  type offerVersions,
} from '../database/schema/index.js';
import type { OfferRecipientCopy } from './offer.types.js';
import type { EstimateOfferPriceSource } from './offer-estimate-preparation.types.js';
type VersionRow = typeof offerVersions.$inferSelect;

/** Shared frozen commercial fields; no live Client or economic read is borrowed. */
export function storedEstimatePrice(row: VersionRow): EstimateOfferPriceSource {
  if (row.provenance !== INTERNAL_ESTIMATE_OFFER_PROVENANCE)
    throw new Error('Invalid internal Offer source.');
  return { ...storedApprovedEstimatePrice(row), taxTreatment: 'UNSPECIFIED' };
}

export function storedApprovedEstimatePrice(
  row: VersionRow,
): Omit<EstimateOfferPriceSource, 'taxTreatment'> {
  if (
    (row.provenance !== INTERNAL_ESTIMATE_OFFER_PROVENANCE &&
      row.provenance !== 'COMPANY_MODEL_ESTIMATE') ||
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
    throw new Error('The stored approved estimate price source is invalid.');
  return {
    kind: 'DIRECTOR_APPROVED_ESTIMATE',
    estimateId: row.estimateSourceId,
    estimateVersionId: row.estimateSourceVersionId,
    estimateVersionNumber: row.estimateSourceVersionNumber,
    approvalDecisionId: row.estimateSourceDecisionId,
    approvedAt: row.estimateSourceApprovedAt.toISOString(),
    amount: row.estimateSourceAmount,
    currency: row.estimateSourceCurrency,
  };
}

export function storedRecipient(row: VersionRow): OfferRecipientCopy {
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
  throw new Error('The stored Offer recipient is invalid.');
}
