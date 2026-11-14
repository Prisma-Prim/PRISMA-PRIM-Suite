import type { ActorContext } from '../access-types';
import { holds } from '../access/company-grants';

/** The opt-in family never substitutes for ordinary Document or content rights. */
export function hasMissionDeliverableAccess(
  company: ActorContext['activeCompany'],
): boolean {
  return holds(
    company,
    'company_mission_deliverable_access',
    'document.mission_deliverable.access',
  );
}
