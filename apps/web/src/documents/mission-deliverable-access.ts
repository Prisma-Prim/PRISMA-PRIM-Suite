import type { ActorContext } from '../access-types';

/** The opt-in family never substitutes for ordinary Document or content rights. */
export function hasMissionDeliverableAccess(
  company: ActorContext['activeCompany'],
): boolean {
  return (
    company?.missionDeliverableAccessPermissionSetVersion === 'v1' &&
    typeof company.missionDeliverableAccessAssignmentId === 'string' &&
    company.missionDeliverableAccessAssignmentId.length > 0 &&
    company.documentPermissions?.includes(
      'document.mission_deliverable.access',
    ) === true
  );
}
