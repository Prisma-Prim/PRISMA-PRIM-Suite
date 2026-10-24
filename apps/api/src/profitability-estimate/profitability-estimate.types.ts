import type { calculateProfitability } from './profitability-estimate.calculation.js';
import type {
  readProfitabilityDecision,
  readProfitabilitySubmission,
} from './profitability-estimate.validation.js';

// The runtime boundary owns the shape it proves; no parallel input schema.
export type ProfitabilitySubmission = ReturnType<
  typeof readProfitabilitySubmission
>;
export type ProfitabilityInputs = Omit<
  ProfitabilitySubmission,
  'expectedLatestVersionNumber'
>;
export type ProfitabilityDecisionCommand = ReturnType<
  typeof readProfitabilityDecision
>;
export type ProfitabilityResults = ReturnType<typeof calculateProfitability>;

export interface ProfitabilityDecisionRecord {
  readonly id: string;
  readonly code: ProfitabilityDecisionCommand['code'];
  readonly decidedByWorkspaceMembershipId: string;
  readonly decidedAt: string;
}

export interface ProfitabilityVersionRecord {
  readonly id: string;
  readonly estimateId: string;
  readonly workspaceId: string;
  readonly companyId: string;
  readonly opportunityId: string;
  readonly clientRequestId: string;
  readonly versionNumber: number;
  readonly predecessorVersionId: string | null;
  readonly inputs: ProfitabilityInputs;
  readonly results: ProfitabilityResults;
  readonly calculationRule: {
    readonly id: 'CONFIRMED_COST_PROFITABILITY';
    readonly version: 1;
    readonly monetaryScale: 2;
    readonly percentageScale: 2;
    readonly rounding: 'HALF_UP';
  };
  readonly createdByWorkspaceMembershipId: string;
  readonly createdAt: string;
  // A read projection of a separate append-only decision, never version state.
  readonly decision: ProfitabilityDecisionRecord | null;
}

export interface ProfitabilityVersionPage {
  readonly items: ProfitabilityVersionRecord[];
  readonly latestVersionNumber: number | null;
  readonly nextCursor?: string;
}

/** Exact approved commercial facts; economic costs/results stay in this owner. */
export interface ApprovedEstimateCommercialProjection {
  readonly estimateId: string;
  readonly estimateVersionId: string;
  readonly estimateVersionNumber: number;
  readonly approvalDecisionId: string;
  readonly approvedAt: string;
  readonly amount: string;
  readonly currency: string;
}
