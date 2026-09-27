import type { CommercialClientProjection } from '../commercial-intake/commercial-intake.types.js';
import type { TariffCurrency } from '../database/schema/index.js';

export interface PricingSnapshotLineRecord {
  readonly position: number;
  readonly serviceDefinitionId: string;
  readonly serviceCode: string;
  readonly serviceName: string;
  readonly offeringId: string;
  readonly commercialLabel: string | null;
  readonly tariffVersionId: string;
  readonly tariffVersionNumber: number;
  readonly unit: string;
  readonly unitAmount: string;
  readonly currency: TariffCurrency;
  readonly taxRatePercent: string;
  readonly taxLabel: string;
  readonly quantity: string;
  readonly ruleShape: 'UNIT_PRICE_TIMES_QUANTITY';
  readonly rawLineAmount: string;
  readonly lineNet: string;
  readonly rawLineTax: string;
  readonly lineTax: string;
}

export interface PricingSnapshotRecord {
  readonly id: string;
  readonly opportunityId: string;
  readonly clientRequestId: string;
  readonly clientReference?: CommercialClientProjection;
  readonly pricingRuleVersion: {
    readonly id: string;
    readonly versionNumber: number;
    readonly ruleShape: 'UNIT_PRICE_TIMES_QUANTITY';
    readonly roundingMode: 'HALF_UP';
    readonly roundingScale: 2;
    readonly taxApplication: 'PER_LINE';
  };
  readonly currency: TariffCurrency;
  readonly lines: PricingSnapshotLineRecord[];
  readonly subtotal: string;
  readonly taxTotal: string;
  readonly total: string;
  readonly calculatedByWorkspaceMembershipId: string;
  readonly calculatedAt: string;
  readonly committedAt: string;
  readonly version: 1;
  readonly provenance: 'ILLUSTRATIVE';
  readonly provisional: true;
}

export interface PricingSnapshotPage {
  readonly items: PricingSnapshotRecord[];
  readonly nextCursor?: string;
}
