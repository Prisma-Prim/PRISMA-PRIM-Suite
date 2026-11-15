/**
 * Files that still read legacy per-bundle fields of the active Company
 * context, with their read count (#1333). The list may only shrink:
 * legacy-company-grant-reads.test.ts fails on a new read and on a stale count.
 * Migrate a file by reading its grants through grantOf or holds of
 * ./company-grants, then lower or remove its entry.
 */
export const LEGACY_COMPANY_GRANT_READS: Readonly<Record<string, number>> = {
  'apps/web/src/App.opportunity-follow-up.test.tsx': 1,
  'apps/web/src/App.tsx': 15,
  'apps/web/src/access/current-actor.test.ts': 1,
  'apps/web/src/access/opportunity-follow-up-authority.test.ts': 1,
  'apps/web/src/client/ClientDuplicateReviewPanel.feedback-localization.test.tsx': 5,
  'apps/web/src/client/ClientWorkspace.tsx': 3,
  'apps/web/src/client/client-duplicate-review-localization.fixture.tsx': 1,
  'apps/web/src/operational-home/multi-company-summary-contract.ts': 2,
};
