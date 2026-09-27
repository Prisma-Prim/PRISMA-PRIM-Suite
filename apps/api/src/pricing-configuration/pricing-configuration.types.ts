import type { TariffCurrency } from '../database/schema/index.js';

export interface PublishPricingRuleVersionCommand {
  readonly label: string;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  // The head number the caller displayed, or null for a first publication.
  readonly expectedActiveVersionNumber: number | null;
}

// Every value is user-entered and illustrative. The amount and rate keep the
// exact strings the grammar accepted; the currency comes from a closed set.
export interface PublishTariffVersionCommand {
  readonly unit: string;
  readonly unitAmount: string;
  readonly currency: TariffCurrency;
  readonly taxRatePercent: string;
  readonly taxLabel: string;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  // The offering's head number the caller displayed, or null for a first
  // publication of that offering.
  readonly expectedActiveVersionNumber: number | null;
}

// Derived from stored timestamps at one read instant, sampled under the
// scope protection; never stored.
export type EffectiveDatedVersionState = 'SCHEDULED' | 'CURRENT' | 'SUPERSEDED';

// Operational selection metadata, written once when a successor is published.
export interface VersionSupersession {
  readonly supersededByVersionId: string;
  readonly supersededAt: string;
  readonly supersededFrom: string;
}

// Every value is illustrative. The rule shape, rounding and tax application
// are server-fixed and recorded so a later shape is a new version.
export interface PricingRuleVersionRecord {
  readonly id: string;
  readonly versionNumber: number;
  readonly label: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly ruleShape: 'UNIT_PRICE_TIMES_QUANTITY';
  readonly roundingMode: 'HALF_UP';
  readonly roundingScale: 2;
  readonly taxApplication: 'PER_LINE';
  readonly provenance: 'ILLUSTRATIVE';
  readonly provisional: true;
  readonly state: EffectiveDatedVersionState;
  readonly supersession: VersionSupersession | null;
  readonly createdByWorkspaceMembershipId: string;
  readonly createdAt: string;
}

export type PricingRulePublicationOutcome = 'PUBLISHED' | 'UNCHANGED';

export interface PublishPricingRuleVersionResult {
  readonly outcome: PricingRulePublicationOutcome;
  readonly version: PricingRuleVersionRecord;
}

// The priceable version and the optimistic-concurrency head answer different
// questions, so both are explicit even when they differ.
export interface PricingRuleScope {
  readonly current: PricingRuleVersionRecord | null;
  readonly headVersionNumber: number | null;
  readonly provisional: true;
}

export interface PricingRuleVersionPage {
  readonly items: PricingRuleVersionRecord[];
  readonly nextCursor?: string;
  readonly provisional: true;
}

// Every value is illustrative and has no fiscal or legal effect. The amount
// and rate are decimal strings at their column scale, numerically equal to
// what was submitted; nothing converts, combines or totals them.
export interface TariffVersionRecord {
  readonly id: string;
  readonly offeringId: string;
  readonly versionNumber: number;
  readonly unit: string;
  readonly unitAmount: string;
  readonly currency: TariffCurrency;
  readonly taxRatePercent: string;
  readonly taxLabel: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly provenance: 'ILLUSTRATIVE';
  readonly provisional: true;
  readonly state: EffectiveDatedVersionState;
  readonly supersession: VersionSupersession | null;
  readonly createdByWorkspaceMembershipId: string;
  readonly createdAt: string;
}

export interface PublishTariffVersionResult {
  readonly outcome: 'PUBLISHED' | 'UNCHANGED';
  readonly version: TariffVersionRecord;
}

// One offering's priceable version and its optimistic-concurrency head.
export interface TariffScope {
  readonly offeringId: string;
  readonly current: TariffVersionRecord | null;
  readonly headVersionNumber: number | null;
  readonly provisional: true;
}

export interface TariffVersionPage {
  readonly items: TariffVersionRecord[];
  readonly nextCursor?: string;
  readonly provisional: true;
}

export interface CreatePricingSnapshotCommand {
  readonly pricingRuleVersionNumber: number;
  readonly lines: readonly {
    readonly offeringId: string;
    readonly tariffVersionNumber: number;
    readonly quantity: string;
    readonly adjustment?: {
      readonly type: 'FIXED_NET_DISCOUNT';
      readonly netReduction: string;
      readonly reason: string;
    };
  }[];
}
