import type { ActorContext } from '../access-types';

type Grant = {
  role: 'EDITOR' | 'APPROVER';
  assignmentId: string;
  version: 'v1';
};
const editorPermissions = [
  'commercial.offer.model.read',
  'commercial.offer.model.version.create',
];
const approverPermissions = [
  'commercial.offer.model.read',
  'commercial.offer.model.decide',
  'commercial.offer.model.withdraw',
];

/** The legacy Actor transport does not prove this new projection: admit it here. */
export function offerModelAuthority(actor: ActorContext) {
  const company = actor.activeCompany;
  if (
    !company ||
    !id(company.id) ||
    !id(actor.workspaceId) ||
    !id(actor.workspaceMembershipId) ||
    !id(actor.internalUserId)
  )
    return null;
  const values = company.offerModelGrants;
  if (!Array.isArray(values) || values.length < 1 || values.length > 2)
    return null;
  const grants: Grant[] = [];
  const items: unknown[] = values;
  for (const value of items) {
    const grant = readGrant(value);
    if (!grant || grants.some((existing) => existing.role === grant.role))
      return null;
    grants.push(grant);
  }
  grants.sort((a, b) => a.role.localeCompare(b.role));
  return {
    companyId: company.id.toLowerCase(),
    workspaceId: actor.workspaceId.toLowerCase(),
    membershipId: actor.workspaceMembershipId.toLowerCase(),
    internalUserId: actor.internalUserId.toLowerCase(),
    canEdit: grants.some((grant) => grant.role === 'EDITOR'),
    canDecide: grants.some((grant) => grant.role === 'APPROVER'),
    key: JSON.stringify([
      actor.internalUserId,
      actor.workspaceMembershipId,
      actor.workspaceId,
      company.id,
      grants,
    ]),
  };
}

function readGrant(value: unknown): Grant | null {
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
  switch (row.bundle) {
    case 'company_offer_model_editor':
      if (
        permissions.length !== editorPermissions.length ||
        !editorPermissions.every((permission) =>
          permissions.includes(permission),
        )
      )
        return null;
      return {
        role: 'EDITOR',
        assignmentId: row.assignmentId.toLowerCase(),
        version: 'v1',
      };
    case 'company_offer_model_approver':
      if (
        permissions.length !== approverPermissions.length ||
        !approverPermissions.every((permission) =>
          permissions.includes(permission),
        )
      )
        return null;
      return {
        role: 'APPROVER',
        assignmentId: row.assignmentId.toLowerCase(),
        version: 'v1',
      };
    default:
      return null;
  }
}
function id(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
