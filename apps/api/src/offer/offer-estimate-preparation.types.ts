import type { ApprovedEstimateCommercialProjection } from '../profitability-estimate/profitability-estimate.types.js';
import type {
  OfferDecision,
  OfferRecord,
  OfferVersionRecord,
} from './offer.types.js';

export interface EstimateOfferPriceSource extends ApprovedEstimateCommercialProjection {
  readonly kind: 'DIRECTOR_APPROVED_ESTIMATE';
  readonly taxTreatment: 'UNSPECIFIED';
}

type VersionContent = Pick<
  OfferVersionRecord,
  | 'id'
  | 'versionNumber'
  | 'predecessorVersionId'
  | 'supersededByVersionId'
  | 'supersededAt'
  | 'differences'
  | 'recipient'
  | 'issuingCompanyLabel'
  | 'validityDays'
  | 'validUntil'
  | 'scopeNote'
  | 'commercialConditions'
  | 'createdByWorkspaceMembershipId'
  | 'createdAt'
  | 'validityElapsed'
>;

export type InternalOfferVersionRecord = VersionContent & {
  readonly provenance: 'APPROVED_ESTIMATE_INTERNAL_DRAFT';
  readonly provisional: true;
  readonly priceSource: EstimateOfferPriceSource;
  readonly transmissionState: 'NOT_TRANSMITTED';
  readonly transmission: null;
  readonly clientResponseState: 'NONE';
  readonly clientResponse: null;
  readonly latestQualityRun: null;
} & (
    | { readonly decisionState: 'PENDING'; readonly decision: null }
    | {
        readonly decisionState: 'REJECTED';
        readonly decision: Extract<OfferDecision, { state: 'REJECTED' }>;
      }
  );

export type InternalOfferRecord = Omit<OfferRecord, 'version'> & {
  readonly version: InternalOfferVersionRecord;
};

/** Preserve the original Snapshot record shape while closing the new variant. */
export type OfferReadRecord = OfferRecord | InternalOfferRecord;
