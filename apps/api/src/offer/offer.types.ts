import type { CommercialClientProjection } from '../commercial-intake/commercial-intake.types.js';
import type { PricingSnapshotRecord } from '../pricing-configuration/pricing-snapshot.types.js';
import type { OfferRepresentation } from './offer-representation.js';
import type { OfferQualityRun } from './offer-quality.js';
import type { OfferQualityCode } from './offer-quality.js';

export type OfferDecision = {
  readonly id: string;
  readonly offerVersionId: string;
  readonly offerRevision: number;
  readonly actorWorkspaceMembershipId: string;
  readonly decidedAt: string;
} & (
  | {
      readonly state: 'APPROVED';
      readonly qualityRun: OfferQualityRun;
      readonly acknowledgedWarningCodes: readonly OfferQualityCode[];
      readonly representationSha256: string;
    }
  | { readonly state: 'REJECTED'; readonly reason: string }
);

export type OfferDecisionState =
  | { readonly decisionState: 'PENDING'; readonly decision: null }
  | {
      readonly decisionState: 'APPROVED';
      readonly decision: Extract<OfferDecision, { state: 'APPROVED' }>;
    }
  | {
      readonly decisionState: 'REJECTED';
      readonly decision: Extract<OfferDecision, { state: 'REJECTED' }>;
    };
export function offerDecisionState(
  decision: OfferDecision | null,
): OfferDecisionState {
  if (!decision) return { decisionState: 'PENDING', decision: null };
  switch (decision.state) {
    case 'APPROVED':
      return { decisionState: 'APPROVED', decision };
    case 'REJECTED':
      return { decisionState: 'REJECTED', decision };
    default: {
      const exhaustive: never = decision;
      return exhaustive;
    }
  }
}

export type OfferRecipientSelection =
  | { readonly kind: 'PRIMARY' }
  | { readonly kind: 'ADDITIONAL'; readonly legalEntityId: string };

export interface CreateOfferCommand {
  readonly pricingSnapshotId: string;
  readonly recipient: OfferRecipientSelection;
  readonly validityDays: number;
  readonly scopeNote: string | null;
  readonly commercialConditions: string | null;
}

export type OfferRecipientCopy = {
  readonly legalName: string;
  readonly taxId: string | null;
  readonly legalAddress: string | null;
} & (
  | { readonly kind: 'PRIMARY' }
  | { readonly kind: 'ADDITIONAL'; readonly additionalLegalEntityId: string }
);

export interface OfferTransmission {
  readonly id: string;
  readonly offerVersionId: string;
  readonly offerRevision: number;
  readonly actorWorkspaceMembershipId: string;
  readonly transmittedAt: string;
  readonly channel: 'SIMULATED';
  readonly note: string | null;
  readonly qualityRun: OfferQualityRun;
  readonly acknowledgedWarningCodes: readonly OfferQualityCode[];
  readonly representationSha256: string;
}

export type OfferClientResponseState =
  | { readonly clientResponseState: 'PENDING'; readonly clientResponse: null }
  | {
      [Outcome in OfferClientResponse['outcome']]: {
        readonly clientResponseState: Outcome;
        readonly clientResponse: Extract<
          OfferClientResponse,
          { outcome: Outcome }
        >;
      };
    }[OfferClientResponse['outcome']];
export type OfferTransmissionState =
  | {
      readonly transmissionState: 'NOT_TRANSMITTED';
      readonly clientResponseState: 'NONE';
      readonly transmission: null;
      readonly clientResponse: null;
    }
  | ({
      readonly transmissionState: 'TRANSMITTED';
      readonly transmission: OfferTransmission;
    } & OfferClientResponseState);

export function offerClientResponseState(
  response: OfferClientResponse | null,
): OfferClientResponseState {
  if (!response)
    return { clientResponseState: 'PENDING', clientResponse: null };
  switch (response.outcome) {
    case 'ACCEPTED':
      return { clientResponseState: 'ACCEPTED', clientResponse: response };
    case 'REJECTED':
      return { clientResponseState: 'REJECTED', clientResponse: response };
    case 'EXPIRED':
      return { clientResponseState: 'EXPIRED', clientResponse: response };
    default: {
      const exhaustive: never = response;
      return exhaustive;
    }
  }
}

export type OfferClientResponse = {
  readonly id: string;
  readonly offerVersionId: string;
  readonly offerRevision: number;
  readonly actorWorkspaceMembershipId: string;
  readonly decidedAt: string;
  readonly evidenceKind: 'SIMULATED';
} & (
  | { readonly outcome: 'ACCEPTED'; readonly receivedAt: string }
  | {
      readonly outcome: 'REJECTED';
      readonly receivedAt: string;
      readonly reason: string;
    }
  | { readonly outcome: 'EXPIRED' }
);

export type OfferVersionRecord = {
  readonly id: string;
  /** Rule set bound at creation with the representation's Template Version. */
  readonly qualityRuleSet: 'OFFER_QUALITY_ILLUSTRATIVE';
  readonly qualityRuleSetVersion: OfferQualityRun['ruleSetVersion'];
  readonly versionNumber: number;
  readonly predecessorVersionId: string | null;
  readonly supersededByVersionId: string | null;
  readonly supersededAt: string | null;
  readonly differences: readonly OfferVersionDifference[];
  readonly pricingSnapshotId: string;
  readonly pricingSnapshot: PricingSnapshotRecord;
  readonly recipient: OfferRecipientCopy;
  readonly issuingCompanyLabel: string;
  readonly validityDays: number;
  readonly validUntil: string;
  readonly scopeNote: string | null;
  readonly commercialConditions: string | null;
  readonly decisionState: 'PENDING' | 'APPROVED' | 'REJECTED';
  readonly decision: OfferDecision | null;
  readonly provenance: 'ILLUSTRATIVE';
  readonly provisional: true;
  readonly createdByWorkspaceMembershipId: string;
  readonly createdAt: string;
  readonly representation: OfferRepresentation;
  readonly latestQualityRun: OfferQualityRun | null;
  readonly validityElapsed: boolean;
} & OfferTransmissionState;

export interface OfferRecord {
  readonly id: string;
  readonly companyId: string;
  readonly opportunityId: string;
  readonly clientRequestId: string;
  readonly originalClientAccountId: string;
  readonly illustrativeReference: number;
  readonly revision: number;
  readonly provisional: true;
  readonly createdByWorkspaceMembershipId: string;
  readonly createdAt: string;
  readonly clientReference?: CommercialClientProjection;
  readonly version: OfferVersionRecord;
}

export interface OfferVersionDifference {
  readonly field: string;
  readonly previous: string | number | null;
  readonly current: string | number | null;
  readonly changed: boolean;
}
