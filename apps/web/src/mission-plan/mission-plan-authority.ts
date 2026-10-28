import type { ActorContext } from '../access-types';
export function uuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
type Purpose = 'configure' | 'create' | 'copy';
function capture(values: unknown, role: 'configuration' | 'user') {
  if (!Array.isArray(values)) return null;
  const rows: unknown[] = values;
  const matches = rows.filter(
    (value) =>
      typeof value === 'object' &&
      value !== null &&
      'bundle' in value &&
      value.bundle === `company_mission_plan_${role}`,
  );
  if (matches.length !== 1) return null;
  const value = matches[0];
  if (
    typeof value !== 'object' ||
    value === null ||
    !('assignmentId' in value) ||
    !uuid(value.assignmentId) ||
    !('permissionSetVersion' in value) ||
    value.permissionSetVersion !== 'v1' ||
    !('permissions' in value) ||
    !Array.isArray(value.permissions)
  )
    return null;
  const permissions: unknown[] = value.permissions;
  const expected = [
    'project.mission_plan.read',
    role === 'configuration'
      ? 'project.mission_plan.publish'
      : 'project.mission_plan.instantiate',
  ];
  if (
    permissions.length !== 2 ||
    !expected.every((p) => permissions.includes(p))
  )
    return null;
  return {
    role,
    assignmentId: value.assignmentId.toLowerCase(),
    version: 'v1',
  };
}
/** Each region consumes only its own capture; unrelated grants preserve its owner. */
export function missionPlanAuthority(actor: ActorContext, purpose: Purpose) {
  const c = actor.activeCompany;
  if (
    !c ||
    ![
      c.id,
      actor.workspaceId,
      actor.workspaceMembershipId,
      actor.internalUserId,
    ].every(uuid)
  )
    return null;
  const config = capture(c.missionPlanGrants, 'configuration'),
    user = capture(c.missionPlanGrants, 'user');
  const grant =
    purpose === 'create'
      ? user
      : purpose === 'configure'
        ? (config ?? user)
        : (user ?? config);
  if (!grant) return null;
  const base = {
    companyId: c.id,
    workspaceId: actor.workspaceId,
    membershipId: actor.workspaceMembershipId,
    internalUserId: actor.internalUserId,
  };
  const native =
    purpose === 'configure'
      ? null
      : {
          projectPermissions:
            purpose === 'copy'
              ? c.projectPermissions?.filter((p) => p === 'project.read')
              : c.projectPermissions,
          projectAssignment: c.projectPermissionAssignmentId,
          projectVersion: c.projectPermissionSetVersion,
          taskPermissions:
            purpose === 'copy'
              ? c.taskPermissions?.filter((p) => p === 'task.read')
              : c.taskPermissions,
          taskAssignment: c.taskPermissionAssignmentId,
          taskVersion: c.taskPermissionSetVersion,
          clientPermissions: c.clientPermissions?.filter(
            (p) => p === 'client.read',
          ),
          clientAssignment: c.clientPermissionAssignmentId,
          clientVersion: c.clientPermissionSetVersion,
          clientManage: actor.workspacePermissions.includes('client.manage'),
        };
  if (
    native &&
    (!c.projectPermissions?.includes('project.read') ||
      !c.taskPermissions?.includes('task.read') ||
      (!native.clientManage && !c.clientPermissions?.includes('client.read')))
  )
    return null;
  return {
    ...base,
    canPublish: config !== null,
    canCreate:
      purpose === 'create' &&
      Boolean(
        c.projectPermissions?.includes('project.create') &&
        c.taskPermissions?.includes('task.manage'),
      ),
    key: JSON.stringify([base, grant, native]),
  };
}
export type PlanAuthority = NonNullable<
  ReturnType<typeof missionPlanAuthority>
>;
