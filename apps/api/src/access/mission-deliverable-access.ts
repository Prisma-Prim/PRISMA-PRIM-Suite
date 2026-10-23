import { and, eq, isNull, type SQL } from 'drizzle-orm';
import { companyRoleAssignments } from '../database/schema/index.js';
import type { ActorContext } from './access.types.js';
import { COMPANY_MISSION_DELIVERABLE_ACCESS_BUNDLE } from './company-permissions.js';

/** One live captured-grant predicate for fenced commands and row-level projections. */
export function missionDeliverableAssignment(
  actor: ActorContext,
): SQL | undefined {
  const company = actor.activeCompany;
  if (
    !actor.active ||
    !company?.documentPermissions?.includes(
      'document.mission_deliverable.access',
    )
  )
    return undefined;
  return and(
    eq(companyRoleAssignments.workspaceId, actor.workspaceId),
    eq(companyRoleAssignments.companyId, company.id),
    eq(
      companyRoleAssignments.workspaceMembershipId,
      actor.workspaceMembershipId,
    ),
    eq(
      companyRoleAssignments.bundle,
      COMPANY_MISSION_DELIVERABLE_ACCESS_BUNDLE,
    ),
    eq(companyRoleAssignments.permissionSetVersion, 'v1'),
    isNull(companyRoleAssignments.revokedAt),
  );
}
