export const EXECUTOR_TYPES = [
  'PATENT_CONSULTANT',
  'CIVIL_CONTRACT',
  'DIRECTOR_OR_EMPLOYEE',
  'EXTERNAL_SUBCONTRACTOR',
] as const;
export const DIRECT_COST_CATEGORIES = [
  'PATENT_COST',
  'TRAVEL',
  'SUBCONTRACTOR',
  'TRANSLATION_MATERIAL_CONSUMABLE',
  'OTHER_PROJECT_DIRECT',
] as const;
export const DECISION_CODES = ['APPROVE', 'MODIFY', 'REJECT'] as const;
export type ProfitabilityDecisionCode = (typeof DECISION_CODES)[number];

export interface ProfitabilityLineInput {
  readonly key: string;
  readonly category: (typeof DIRECT_COST_CATEGORIES)[number];
  readonly label: string;
  readonly currency: string;
  readonly amount: string;
}
export interface SubmitProfitabilityCommand {
  readonly expectedLatestVersion: number | null;
  readonly currency: string;
  readonly executorType: (typeof EXECUTOR_TYPES)[number];
  readonly executorCost: string;
  readonly fiscalCost: string;
  readonly allocatedOverhead: string;
  readonly directCosts: readonly ProfitabilityLineInput[];
  readonly targetProfitability: string;
  readonly proposedPrice: string;
  readonly pricingIntent: 'ORDINARY' | 'STRATEGIC';
  readonly strategicReason: string | null;
  readonly costComplete: true;
  readonly noKnownDuplicate: true;
}
export interface DecideProfitabilityCommand {
  readonly versionNumber: number;
  readonly expectedDecision: null;
  readonly code: ProfitabilityDecisionCode;
}

export interface ProfitabilityVersionRecord {
  readonly estimateId: string;
  readonly versionId: string;
  readonly versionNumber: number;
  readonly predecessorVersionId: string | null;
  readonly opportunityId: string;
  readonly clientRequestId: string;
  readonly currency: string;
  readonly executorType: string;
  readonly executorCost: string;
  readonly fiscalCost: string;
  readonly allocatedOverhead: string;
  readonly directCosts: readonly ProfitabilityLineInput[];
  readonly targetProfitability: string;
  readonly proposedPrice: string;
  readonly pricingIntent: string;
  readonly strategicReason: string | null;
  readonly costComplete: true;
  readonly noKnownDuplicate: true;
  readonly totalCost: string;
  readonly profit: string;
  readonly estimatedProfitability: string;
  readonly targetDifference: string;
  readonly calculationRule: {
    readonly id: 'CONFIRMED_COST_PROFITABILITY';
    readonly version: 1;
    readonly roundingMode: 'HALF_UP';
    readonly scale: 2;
  };
  readonly createdBy: {
    readonly workspaceMembershipId: string;
    readonly displayName: string;
  };
  readonly createdAt: string;
  readonly decision: null | {
    readonly id: string;
    readonly code: ProfitabilityDecisionCode;
    readonly decidedBy: {
      readonly workspaceMembershipId: string;
      readonly displayName: string;
    };
    readonly decidedAt: string;
  };
}
