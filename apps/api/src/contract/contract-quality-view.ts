import {
  contractQualityRuns,
  contractVersions,
  contracts,
} from '../database/schema/index.js';
import {
  readContractQualityResults,
  contractQualityCodes,
  type ContractQualityRun,
} from './contract-quality.js';
type VersionRow = typeof contractVersions.$inferSelect;
export function qualityRunView(
  row: typeof contractQualityRuns.$inferSelect,
  version: VersionRow,
  contract: typeof contracts.$inferSelect,
): ContractQualityRun {
  if (
    row.ruleSet !== 'CONTRACT_QUALITY_ILLUSTRATIVE' ||
    (row.ruleSetVersion !== 1 && row.ruleSetVersion !== 2) ||
    row.contractVersionId !== version.id
  )
    throw new Error('Unsupported stored Contract Quality Check rule set.');
  return {
    id: row.id,
    contractVersionId: row.contractVersionId,
    ruleSet: row.ruleSet,
    ruleSetVersion: row.ruleSetVersion,
    actorWorkspaceMembershipId: row.actorWorkspaceMembershipId,
    evaluatedAt: row.evaluatedAt.toISOString(),
    results: readContractQualityResults(
      row.results,
      contractQualityCodes(
        version.termEndsOn,
        contract.origin === 'DIRECT'
          ? { kind: 'DIRECT' }
          : version.templateCode === 'ADDENDUM_ILLUSTRATIVE'
            ? { pricingSnapshotId: version.pricingSnapshotId }
            : null,
      ),
    ),
  };
}
