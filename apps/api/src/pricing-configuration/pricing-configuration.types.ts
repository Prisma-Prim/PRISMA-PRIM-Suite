export interface PublishPricingRuleVersionCommand {
  readonly label: string;
  readonly effectiveFrom: Date;
  readonly effectiveTo: Date | null;
  // The head number the caller displayed, or null for a first publication.
  readonly expectedActiveVersionNumber: number | null;
}

// Derived at one request instant from stored timestamps; never stored.
export type PricingRuleVersionState = 'SCHEDULED' | 'CURRENT' | 'SUPERSEDED';

// Operational selection metadata, written once when a successor is published.
export interface PricingRuleVersionSupersession {
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
  readonly state: PricingRuleVersionState;
  readonly supersession: PricingRuleVersionSupersession | null;
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
