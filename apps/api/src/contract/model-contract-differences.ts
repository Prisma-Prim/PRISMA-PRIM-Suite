import type { contractVersions } from '../database/schema/index.js';
import type { storedModelContractSnapshot } from './model-contract-snapshot.js';

type Version = typeof contractVersions.$inferSelect;
type Snapshot = ReturnType<typeof storedModelContractSnapshot>;
function comparable(version: Version, snapshot: Snapshot) {
  return {
    sourceOfferVersionId: snapshot.offerSource.offerVersionId,
    modelVersionId: snapshot.modelSource.versionId,
    modelApprovalDecisionId: snapshot.modelSource.approvalDecisionId,
    recipientLegalName: version.recipientLegalName,
    recipientTaxId: version.recipientTaxId,
    recipientLegalAddress: version.recipientLegalAddress,
    documentDate: snapshot.caseDetails.documentDate,
    clientDetails: snapshot.caseDetails.clientDetails,
    termStartsOn: version.termStartsOn,
    termEndsOn: version.termEndsOn,
    specialConditions: version.specialConditions,
    sourceConcordanceBasis: snapshot.caseDetails.sourceConcordanceBasis,
    scopeNote: version.scopeNote,
    commercialConditions: version.commercialConditions,
    netAmount: snapshot.financials.netAmount,
    taxAmount: snapshot.financials.taxAmount,
    grossAmount: snapshot.financials.grossAmount,
    taxLabel: snapshot.financials.taxLabel,
    currency: snapshot.financials.currency,
  };
}
export function modelContractDifferences(
  beforeVersion: Version,
  beforeSnapshot: Snapshot,
  afterVersion: Version,
  afterSnapshot: Snapshot,
) {
  const before = comparable(beforeVersion, beforeSnapshot),
    after = comparable(afterVersion, afterSnapshot);
  const differences: {
    field: string;
    before: string | null;
    after: string | null;
  }[] = [];
  for (const [field, value] of Object.entries(after)) {
    if (!isField(field, before))
      throw new Error('Invalid Contract difference field.');
    if (before[field] !== value)
      differences.push({ field, before: before[field], after: value });
  }
  return differences;
}
function isField(
  value: string,
  record: ReturnType<typeof comparable>,
): value is keyof typeof record {
  return Object.hasOwn(record, value);
}
