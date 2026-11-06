import { createHash } from 'node:crypto';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { DatabaseContext } from '../database/database-context.js';
import {
  companyRoleAssignments,
  workspacePermissionGrants,
} from '../database/schema/index.js';
import type { ActorContext, ActiveCompanyContext } from './access.types.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
/** Only native Client-read sources participate. Workspace management is a real alternative. */
export async function receivedAddendumClientReadCapture(input: {
  database: DatabaseContext;
  actor: ActorContext;
  company: ActiveCompanyContext;
  lock: boolean;
}): Promise<string | undefined> {
  const { database, actor, company, lock } = input;
  let source: unknown;
  if (actor.workspacePermissions.includes('client.manage')) {
    const query = database.connection
      .select({ id: workspacePermissionGrants.id })
      .from(workspacePermissionGrants)
      .where(
        and(
          eq(workspacePermissionGrants.workspaceId, actor.workspaceId),
          eq(
            workspacePermissionGrants.workspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(workspacePermissionGrants.permission, 'client.manage'),
        ),
      )
      .orderBy(asc(workspacePermissionGrants.id));
    const rows = lock ? await query.for('share') : await query;
    if (rows.length)
      source = {
        kind: 'workspace-client-manager',
        ids: rows.map((row) => row.id),
      };
  }
  if (
    !source &&
    company.clientPermissions.includes('client.read') &&
    company.clientPermissionAssignmentId &&
    UUID.test(company.clientPermissionAssignmentId) &&
    (company.clientPermissionSetVersion === 'v1' ||
      company.clientPermissionSetVersion === 'v2')
  ) {
    const query = database.connection
      .select({
        id: companyRoleAssignments.id,
        version: companyRoleAssignments.permissionSetVersion,
      })
      .from(companyRoleAssignments)
      .where(
        and(
          eq(companyRoleAssignments.id, company.clientPermissionAssignmentId),
          eq(companyRoleAssignments.workspaceId, actor.workspaceId),
          eq(companyRoleAssignments.companyId, company.id),
          eq(
            companyRoleAssignments.workspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(companyRoleAssignments.bundle, 'company_director_client_access'),
          inArray(companyRoleAssignments.permissionSetVersion, ['v1', 'v2']),
          eq(
            companyRoleAssignments.permissionSetVersion,
            company.clientPermissionSetVersion,
          ),
          isNull(companyRoleAssignments.revokedAt),
        ),
      );
    const [row] = lock ? await query.for('share') : await query;
    if (row) source = { kind: 'company-client-reader', ...row };
  }
  if (!source) return undefined;
  return (
    'received-addendum-client-read.v1.' +
    createHash('sha256')
      .update(
        JSON.stringify([
          actor.internalUserId,
          actor.workspaceId,
          actor.workspaceMembershipId,
          company.id,
          source,
        ]),
      )
      .digest('hex')
  );
}

export function receivedAddendumAssignment(actor: ActorContext) {
  const company = actor.activeCompany;
  if (
    !actor.active ||
    !company ||
    !company.documentPermissions?.includes(
      'document.received_addendum.access',
    ) ||
    company.receivedAddendumAccessPermissionSetVersion !== 'v1' ||
    !company.receivedAddendumAccessAssignmentId ||
    !UUID.test(company.receivedAddendumAccessAssignmentId) ||
    !/^received-addendum-client-read\.v1\.[a-f0-9]{64}$/u.test(
      company.receivedAddendumClientReadCapture ?? '',
    )
  )
    return undefined;
  return and(
    eq(companyRoleAssignments.id, company.receivedAddendumAccessAssignmentId),
    eq(companyRoleAssignments.workspaceId, actor.workspaceId),
    eq(companyRoleAssignments.companyId, company.id),
    eq(
      companyRoleAssignments.workspaceMembershipId,
      actor.workspaceMembershipId,
    ),
    eq(companyRoleAssignments.bundle, 'company_received_addendum_access'),
    eq(companyRoleAssignments.permissionSetVersion, 'v1'),
    isNull(companyRoleAssignments.revokedAt),
  );
}
