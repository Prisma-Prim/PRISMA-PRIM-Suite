import {
  COMPANY_MISSION_PLAN_CONFIGURATION_BUNDLE,
  COMPANY_MISSION_PLAN_USER_BUNDLE,
  companyRolePermissionsFor,
  type CompanyRolePermission,
} from './company-permissions.js';

type PlanBundle =
  | typeof COMPANY_MISSION_PLAN_CONFIGURATION_BUNDLE
  | typeof COMPANY_MISSION_PLAN_USER_BUNDLE;
type CapturedGrant<Bundle extends PlanBundle> = {
  readonly bundle: Bundle;
  readonly permissionSetVersion: 'v1';
  readonly assignmentId: string;
  readonly permissions: readonly CompanyRolePermission<Bundle>[];
};
export type MissionPlanActorGrant =
  | CapturedGrant<typeof COMPANY_MISSION_PLAN_CONFIGURATION_BUNDLE>
  | CapturedGrant<typeof COMPANY_MISSION_PLAN_USER_BUNDLE>;

export interface MissionPlanActorProjection {
  missionPlanGrants?: MissionPlanActorGrant[];
}

/** Snapshot only: the command still obtains live authority under Access locks. */
export function captureMissionPlanGrant(row: {
  bundle: string | null | undefined;
  assignmentId: string | undefined;
  permissionSetVersion: unknown;
}): MissionPlanActorGrant | undefined {
  if (!row.assignmentId || row.permissionSetVersion !== 'v1') return undefined;
  switch (row.bundle) {
    case COMPANY_MISSION_PLAN_CONFIGURATION_BUNDLE:
    case COMPANY_MISSION_PLAN_USER_BUNDLE:
      // Separate returns preserve the permission type of each closed grant.
      if (row.bundle === COMPANY_MISSION_PLAN_CONFIGURATION_BUNDLE)
        return {
          bundle: row.bundle,
          assignmentId: row.assignmentId,
          permissionSetVersion: row.permissionSetVersion,
          permissions: companyRolePermissionsFor(
            row.bundle,
            row.permissionSetVersion,
          ),
        };
      return {
        bundle: row.bundle,
        assignmentId: row.assignmentId,
        permissionSetVersion: row.permissionSetVersion,
        permissions: companyRolePermissionsFor(
          row.bundle,
          row.permissionSetVersion,
        ),
      };
    default:
      return undefined;
  }
}
