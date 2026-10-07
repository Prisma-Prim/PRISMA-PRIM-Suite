import type { ActorContext } from '../access-types';
import type { EstimateInputs, EstimateVersion } from './profitability-contract';

// Clearly synthetic fixtures; no controlled source or Client data.
export const profitabilityActor: ActorContext = {
  internalUserId: 'user-1',
  workspaceMembershipId: 'member-1',
  workspaceId: 'workspace-1',
  workspaceName: 'Synthetic Workspace',
  displayName: 'Synthetic Contributor',
  email: 'contributor@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    id: 'company-1',
    displayName: 'Synthetic Company',
    commercialIntakePermissions: ['commercial.opportunity.read'],
    profitabilityContributorPermissions: [
      'commercial.profitability_estimate.read',
      'commercial.profitability_estimate.create',
    ],
    profitabilityContributorPermissionAssignmentId: 'contributor-assignment',
    profitabilityContributorPermissionSetVersion: 'v1',
  },
};
export const syntheticInputs: EstimateInputs = {
  currency: 'EUR',
  executorType: 'PATENT_CONSULTANT',
  executorCost: '60.00',
  fiscalCost: '10.00',
  allocatedOverhead: '10.00',
  directCosts: [
    {
      key: 'travel',
      category: 'TRAVEL',
      label: 'Synthetic travel',
      amount: '20.00',
      currency: 'EUR',
    },
  ],
  targetProfitability: '20',
  proposedPrice: '125.00',
  pricingIntent: { kind: 'ORDINARY' },
  costConfirmation: true,
};
export function syntheticVersion(number = 1): EstimateVersion {
  return {
    id: `version-${number}`,
    estimateId: 'estimate-1',
    workspaceId: 'workspace-1',
    companyId: 'company-1',
    opportunityId: 'opportunity-1',
    clientRequestId: 'request-1',
    versionNumber: number,
    predecessorVersionId: number === 1 ? null : `version-${number - 1}`,
    inputs: syntheticInputs,
    results: {
      totalCost: '100.00',
      profit: '25.00',
      profitabilityPercent: '20.00',
      targetDifferencePercentagePoints: '0.00',
    },
    calculationRule: {
      id: 'CONFIRMED_COST_PROFITABILITY',
      version: 1,
      monetaryScale: 2,
      percentageScale: 2,
      rounding: 'HALF_UP',
    },
    createdByWorkspaceMembershipId: 'member-1',
    createdAt: '2026-10-01T08:00:00.000Z',
    decision: null,
  };
}
