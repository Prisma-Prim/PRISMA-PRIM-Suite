import type { ActiveCompanyContext } from '../access/access.types.js';

/**
 * The commercial targets another module may need to authorize. Commercial
 * Intake exposes only this read predicate; it gains no behaviour from it.
 * A Company's Sales Stage list is read with Commercial Intake read
 * (Commercial Workflow PRD section 24.3).
 */
export type CommercialTargetKind =
  'client_request' | 'opportunity' | 'sales_stage';

const REQUIRED_READS = {
  client_request: ['commercial.request.read'],
  opportunity: ['commercial.opportunity.read'],
  sales_stage: ['commercial.request.read', 'commercial.opportunity.read'],
} as const satisfies Record<CommercialTargetKind, readonly string[]>;

export function canReadCommercialTarget(
  company: ActiveCompanyContext | undefined,
  target: CommercialTargetKind,
): boolean {
  const permissions = company?.commercialIntakePermissions ?? [];
  return REQUIRED_READS[target].every((permission) =>
    permissions.includes(permission),
  );
}
