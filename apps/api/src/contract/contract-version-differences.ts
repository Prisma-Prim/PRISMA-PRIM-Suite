import type { contractVersions } from '../database/schema/index.js';
type Version = typeof contractVersions.$inferSelect;
export function contractVersionDifferences(
  previous: Version,
  current: Version,
) {
  const fields = [
    'recipientLegalName',
    'recipientTaxId',
    'recipientLegalAddress',
    'pricingSnapshotId',
    'scopeNote',
    'commercialConditions',
    'termStartsOn',
    'termEndsOn',
    'specialConditions',
    'preliminaryWorkScope',
    'preliminaryFinancialConditions',
    'preliminaryLimits',
    'changeSummary',
  ] as const;
  return fields.flatMap((field) =>
    previous[field] === current[field]
      ? []
      : [{ field, before: previous[field], after: current[field] }],
  );
}
