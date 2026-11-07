import { ForbiddenException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { DatabaseContext } from '../database/database-context.js';
import {
  companyRoleAssignments,
  workspacePermissionGrants,
} from '../database/schema/index.js';
import type { ActorContext } from './access.types.js';
import { COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE } from './company-permissions.js';

interface ClientReadAuthorityCheck {
  readonly connection: DatabaseContext['connection'];
  readonly actor: ActorContext;
  readonly companyId: string;
  /** Share-lock the satisfying grant until the caller's transaction ends. */
  readonly lock: boolean;
  /** Also require the captured Company Client-read permission set version. */
  readonly exactCapture: boolean;
}

/**
 * Live Client read authority in one Company: the actor's Workspace
 * `client.manage` grant, otherwise its captured Company Director Client
 * Access assignment. Throws Forbidden when neither is live.
 */
export async function requireLiveClientReadAuthority(
  check: ClientReadAuthorityCheck,
): Promise<void> {
  const { connection, actor, lock } = check;
  if (actor.workspacePermissions.includes('client.manage')) {
    const query = connection
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
      );
    const managerGrants = lock ? await query.for('share') : await query;
    if (managerGrants.length > 0) return;
  }

  await requireLiveCompanyClientReadAuthority(check);
}

/** Live captured Company Director Client Access alone; Workspace management is no alternative. */
export async function requireLiveCompanyClientReadAuthority({
  connection,
  actor,
  companyId,
  lock,
  exactCapture,
}: ClientReadAuthorityCheck): Promise<void> {
  const capturedVersion = actor.activeCompany?.clientPermissionSetVersion;
  if (exactCapture && capturedVersion !== 'v1' && capturedVersion !== 'v2')
    throw new ForbiddenException();
  const assignmentId = actor.activeCompany?.clientPermissionAssignmentId;
  if (
    assignmentId &&
    actor.activeCompany?.clientPermissions.includes('client.read')
  ) {
    const query = connection
      .select({ id: companyRoleAssignments.id })
      .from(companyRoleAssignments)
      .where(
        and(
          eq(companyRoleAssignments.id, assignmentId),
          eq(companyRoleAssignments.workspaceId, actor.workspaceId),
          eq(
            companyRoleAssignments.workspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(companyRoleAssignments.companyId, companyId),
          eq(
            companyRoleAssignments.bundle,
            COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE,
          ),
          inArray(companyRoleAssignments.permissionSetVersion, ['v1', 'v2']),
          exactCapture && capturedVersion
            ? eq(companyRoleAssignments.permissionSetVersion, capturedVersion)
            : undefined,
          sql`${companyRoleAssignments.revokedAt} IS NULL`,
        ),
      );
    const assignments = lock ? await query.for('share') : await query;
    if (assignments.length > 0) return;
  }

  throw new ForbiddenException();
}
