import type { ActiveCompanyContext } from '../access/access.types.js';

/**
 * The commercial targets another module may need to authorize. Commercial
 * Intake exposes only this read predicate; it gains no behaviour from it.
 */
export type CommercialTargetKind = 'client_request' | 'opportunity';

export function canReadCommercialTarget(
  company: ActiveCompanyContext | undefined,
  target: CommercialTargetKind,
): boolean {
  const permissions = company?.commercialIntakePermissions ?? [];
  return permissions.includes(
    target === 'client_request'
      ? 'commercial.request.read'
      : 'commercial.opportunity.read',
  );
}
