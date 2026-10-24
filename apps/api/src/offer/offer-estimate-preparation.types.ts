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

export type VersionContent = Pick<
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
export type ModelOfferVersionRecord = VersionContent & {
  readonly provenance: 'COMPANY_MODEL_ESTIMATE';
  readonly provisional: true;
  readonly eligibility: 'NON_OFFICIAL_REHEARSAL';
  readonly modelSource: import('./model-offer-representation.js').ApprovedOfferModelSource;
  readonly financialDeclaration: ReturnType<
    typeof import('./model-offer-financials.js').modelOfferFinancials
  >;
  readonly priceSource: Omit<EstimateOfferPriceSource, 'taxTreatment'>;
  readonly representation: import('./model-offer-representation.js').ModelOfferRepresentation;
  readonly qualityRuleSet: 'OFFER_QUALITY_COMPANY_MODEL';
  readonly qualityRuleSetVersion: 1;
  readonly latestQualityRun:
    import('./offer-quality.js').OfferQualityRun | null;
} & import('./offer.types.js').OfferDecisionState &
  import('./offer.types.js').OfferTransmissionState;
export type ModelOfferRecord = Omit<OfferRecord, 'version'> & {
  readonly version: ModelOfferVersionRecord;
};
export type OfferReadRecord =
  OfferRecord | InternalOfferRecord | ModelOfferRecord;
