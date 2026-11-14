import type { ActorContext } from '../access-types';
import { grantOf, holds } from '../access/company-grants';
export function uuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
type Purpose = 'configure' | 'create' | 'copy';
function capture(
  company: ActorContext['activeCompany'],
  role: 'configuration' | 'user',
) {
  const grant = grantOf(
    company,
    role === 'configuration'
      ? 'company_mission_plan_configuration'
      : 'company_mission_plan_user',
  );
  if (!grant || !uuid(grant.assignmentId)) return null;
  return {
    role,
    assignmentId: grant.assignmentId.toLowerCase(),
    version: grant.permissionSetVersion,
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
  const config = capture(c, 'configuration'),
    user = capture(c, 'user');
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
  const project = grantOf(c, 'company_project_access'),
    task = grantOf(c, 'company_task_manager'),
    client = grantOf(c, 'company_director_client_access');
  const native =
    purpose === 'configure'
      ? null
      : {
          projectPermissions:
            purpose === 'copy'
              ? project?.permissions.filter((p) => p === 'project.read')
              : project?.permissions,
          projectAssignment: project?.assignmentId,
          projectVersion: project?.permissionSetVersion,
          taskPermissions:
            purpose === 'copy'
              ? task?.permissions.filter((p) => p === 'task.read')
              : task?.permissions,
          taskAssignment: task?.assignmentId,
          taskVersion: task?.permissionSetVersion,
          clientPermissions: client?.permissions.filter(
            (p) => p === 'client.read',
          ),
          clientAssignment: client?.assignmentId,
          clientVersion: client?.permissionSetVersion,
          clientManage: actor.workspacePermissions.includes('client.manage'),
        };
  if (
    native &&
    (!holds(c, 'company_project_access', 'project.read') ||
      !holds(c, 'company_task_manager', 'task.read') ||
      (!native.clientManage &&
        !holds(c, 'company_director_client_access', 'client.read')))
  )
    return null;
  return {
    ...base,
    canPublish: config !== null,
    canCreate:
      purpose === 'create' &&
      holds(c, 'company_project_access', 'project.create') &&
      holds(c, 'company_task_manager', 'task.manage'),
    key: JSON.stringify([base, grant, native]),
  };
}
export type PlanAuthority = NonNullable<
  ReturnType<typeof missionPlanAuthority>
>;
