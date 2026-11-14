import type { ActorContext } from '../access-types';
import type { CompanyModelGrants as Grants } from './company-model-kind';

type Grant = {
  role: 'EDITOR' | 'APPROVER';
  assignmentId: string;
  version: 'v1';
};

/** The legacy Actor transport does not prove this new projection: admit it here. */
export function companyModelAuthority(actor: ActorContext, grants: Grants) {
  const company = actor.activeCompany;
  if (
    !company ||
    !id(company.id) ||
    !id(actor.workspaceId) ||
    !id(actor.workspaceMembershipId) ||
    !id(actor.internalUserId)
  )
    return null;
  const values = company[grants.field];
  if (!Array.isArray(values) || values.length < 1 || values.length > 2)
    return null;
  const admitted: Grant[] = [];
  const items: unknown[] = values;
  for (const value of items) {
    const grant = readGrant(value, grants);
    if (!grant || admitted.some((existing) => existing.role === grant.role))
      return null;
    admitted.push(grant);
  }
  admitted.sort((a, b) => a.role.localeCompare(b.role));
  return {
    companyId: company.id.toLowerCase(),
    workspaceId: actor.workspaceId.toLowerCase(),
    membershipId: actor.workspaceMembershipId.toLowerCase(),
    internalUserId: actor.internalUserId.toLowerCase(),
    canEdit: admitted.some((grant) => grant.role === 'EDITOR'),
    canDecide: admitted.some((grant) => grant.role === 'APPROVER'),
    key: JSON.stringify([
      actor.internalUserId,
      actor.workspaceMembershipId,
      actor.workspaceId,
      company.id,
      admitted,
    ]),
  };
}
export type CompanyModelAuthority = NonNullable<
  ReturnType<typeof companyModelAuthority>
>;

function readGrant(value: unknown, grants: Grants): Grant | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return null;
  const row = Object.fromEntries(Object.entries(value));
  if (
    !id(row.assignmentId) ||
    row.permissionSetVersion !== 'v1' ||
    !Array.isArray(row.permissions)
  )
    return null;
  const permissions: unknown[] = row.permissions;
  const role =
    row.bundle === grants.editor.bundle
      ? 'EDITOR'
      : row.bundle === grants.approver.bundle
        ? 'APPROVER'
        : null;
  if (!role) return null;
  const expected =
    role === 'EDITOR' ? grants.editor.permissions : grants.approver.permissions;
  if (
    permissions.length !== expected.length ||
    !expected.every((permission) => permissions.includes(permission))
  )
    return null;
  return { role, assignmentId: row.assignmentId.toLowerCase(), version: 'v1' };
}
function id(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
