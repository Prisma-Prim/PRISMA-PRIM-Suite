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
    'termStartsOn',
    'termEndsOn',
    'specialConditions',
    'changeSummary',
  ] as const;
  return fields.flatMap((field) =>
    previous[field] === current[field]
      ? []
      : [{ field, before: previous[field], after: current[field] }],
  );
}
