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

export type OfferTransmissionState =
  | {
      readonly transmissionState: 'NOT_TRANSMITTED';
      readonly clientResponseState: 'NONE';
      readonly transmission: null;
    }
  | {
      readonly transmissionState: 'TRANSMITTED';
      readonly clientResponseState: 'PENDING';
      readonly transmission: OfferTransmission;
    };

export type OfferVersionRecord = {
  readonly id: string;
  readonly versionNumber: 1;
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
