import type { PricingSnapshotLineRecord } from '../pricing-configuration/pricing-snapshot.types.js';

/**
 * The server-fixed pairing of the illustrative Template Version and the
 * Quality Check rule set version of one Offer Version (PRD sections 18.5 and
 * 18.7). An adjusted Snapshot binds v2 and v2; any other Snapshot v1 and v1.
 */
export type OfferBinding =
  | { readonly templateVersion: 1; readonly ruleSetVersion: 1 }
  | { readonly templateVersion: 2; readonly ruleSetVersion: 2 };

const UNADJUSTED: OfferBinding = { templateVersion: 1, ruleSetVersion: 1 };
const ADJUSTED: OfferBinding = { templateVersion: 2, ruleSetVersion: 2 };

/** Fixed at creation from the referenced immutable Snapshot; never an input. */
export function offerBindingForSnapshot(snapshot: {
  readonly lines: ReadonlyArray<Pick<PricingSnapshotLineRecord, 'adjustment'>>;
}): OfferBinding {
  return snapshot.lines.some((line) => line.adjustment !== null)
    ? ADJUSTED
    : UNADJUSTED;
}

/** Persisted binding columns fail closed for any unknown Template Version. */
export function storedOfferBinding(row: {
  readonly templateCode: unknown;
  readonly templateVersion: unknown;
}): OfferBinding {
  if (row.templateCode === 'OFFER_ILLUSTRATIVE') {
    if (row.templateVersion === 1) return UNADJUSTED;
    if (row.templateVersion === 2) return ADJUSTED;
  }
  throw new Error('The stored Offer Template Version is unsupported.');
}
