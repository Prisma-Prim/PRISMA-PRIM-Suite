import { createHash } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { ActorContext } from './access.types.js';
import type { DatabaseContext } from '../database/database-context.js';
import {
  companies,
  companyRoleAssignments,
  internalUsers,
  workspaceMemberships,
  workspacePermissionGrants,
} from '../database/schema/index.js';
import {
  COMPANY_CONTEXT_ACCESS_BUNDLE,
  COMPANY_CONTEXT_USE_BUNDLES,
  COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE,
  COMPANY_DOCUMENT_REGISTRAR_BUNDLE,
  COMPANY_PROJECT_ACCESS_BUNDLE,
} from './company-permissions.js';

/** Payment-local observations of one consumed context and minimal-reference alternative. */
export async function readPaymentEvidenceCaptures(input: {
  database: DatabaseContext;
  actor: ActorContext;
  companyId: string;
  lock: boolean;
}) {
  const { actor, companyId, lock } = input;
  const database = input.database.connection;
  const assignments = database
    .select({
      id: companyRoleAssignments.id,
      bundle: companyRoleAssignments.bundle,
      version: companyRoleAssignments.permissionSetVersion,
    })
    .from(companyRoleAssignments)
    .innerJoin(
      workspaceMemberships,
      and(
        eq(
          workspaceMemberships.id,
          companyRoleAssignments.workspaceMembershipId,
        ),
        eq(workspaceMemberships.workspaceId, actor.workspaceId),
        eq(workspaceMemberships.status, 'active'),
      ),
    )
    .innerJoin(
      internalUsers,
      and(
        eq(internalUsers.id, workspaceMemberships.internalUserId),
        eq(internalUsers.id, actor.internalUserId),
        eq(internalUsers.status, 'active'),
      ),
    )
    .innerJoin(
      companies,
      and(
        eq(companies.id, companyRoleAssignments.companyId),
        eq(companies.workspaceId, actor.workspaceId),
        eq(companies.status, 'active'),
      ),
    )
    .where(
      and(
        eq(companyRoleAssignments.workspaceId, actor.workspaceId),
        eq(
          companyRoleAssignments.workspaceMembershipId,
          actor.workspaceMembershipId,
        ),
        eq(companyRoleAssignments.companyId, companyId),
        inArray(companyRoleAssignments.bundle, [
          ...COMPANY_CONTEXT_USE_BUNDLES,
          COMPANY_PROJECT_ACCESS_BUNDLE,
        ]),
        isNull(companyRoleAssignments.revokedAt),
      ),
    )
    .orderBy(companyRoleAssignments.id);
  const rows = await assignments;
  const permissions = database
    .select({
      id: workspacePermissionGrants.id,
      permission: workspacePermissionGrants.permission,
    })
    .from(workspacePermissionGrants)
    .where(
      and(
        eq(workspacePermissionGrants.workspaceId, actor.workspaceId),
        eq(
          workspacePermissionGrants.workspaceMembershipId,
          actor.workspaceMembershipId,
        ),
        inArray(workspacePermissionGrants.permission, [
          'company.manage',
          'client.manage',
        ]),
      ),
    )
    .orderBy(workspacePermissionGrants.id);
  const grants = await permissions;
  const manager = actor.workspacePermissions.includes('company.manage')
    ? grants.find((row) => row.permission === 'company.manage')
    : undefined;
  const referenceManager = actor.workspacePermissions.includes('client.manage')
    ? grants.find((row) => row.permission === 'client.manage')
    : undefined;
  const rank = (bundle: string) =>
    bundle === COMPANY_CONTEXT_ACCESS_BUNDLE
      ? 0
      : bundle === COMPANY_PROJECT_ACCESS_BUNDLE
        ? 1
        : 2;
  const supportedContext = rows.filter((row) =>
    row.bundle === COMPANY_CONTEXT_ACCESS_BUNDLE
      ? row.version === null
      : row.bundle === COMPANY_DOCUMENT_REGISTRAR_BUNDLE
        ? ['v1', 'v2', 'v3'].some((version) => version === row.version)
        : ['v1', 'v2'].some((version) => version === row.version),
  );
  const context = supportedContext
    .slice()
    .sort(
      (a, b) =>
        rank(a.bundle) - rank(b.bundle) ||
        a.bundle.localeCompare(b.bundle) ||
        a.id.localeCompare(b.id),
    )[0];
  const reference = rows.find(
    (row) =>
      row.bundle === COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE &&
      (row.version === 'v1' || row.version === 'v2'),
  );
  if (lock) {
    const lockPermission = async (selected: (typeof grants)[number]) => {
      const [live] = await database
        .select({ id: workspacePermissionGrants.id })
        .from(workspacePermissionGrants)
        .where(
          and(
            eq(workspacePermissionGrants.id, selected.id),
            eq(workspacePermissionGrants.workspaceId, actor.workspaceId),
            eq(
              workspacePermissionGrants.workspaceMembershipId,
              actor.workspaceMembershipId,
            ),
            eq(workspacePermissionGrants.permission, selected.permission),
          ),
        )
        .for('share');
      return Boolean(live);
    };
    const lockAssignment = async (selected: (typeof rows)[number]) => {
      const [live] = await database
        .select({ id: companyRoleAssignments.id })
        .from(companyRoleAssignments)
        .where(
          and(
            eq(companyRoleAssignments.id, selected.id),
            eq(companyRoleAssignments.workspaceId, actor.workspaceId),
            eq(companyRoleAssignments.companyId, companyId),
            eq(
              companyRoleAssignments.workspaceMembershipId,
              actor.workspaceMembershipId,
            ),
            eq(companyRoleAssignments.bundle, selected.bundle),
            selected.version === null
              ? isNull(companyRoleAssignments.permissionSetVersion)
              : eq(
                  companyRoleAssignments.permissionSetVersion,
                  selected.version,
                ),
            isNull(companyRoleAssignments.revokedAt),
          ),
        )
        .for('share');
      return Boolean(live);
    };
    if (
      manager
        ? !(await lockPermission(manager))
        : !context || !(await lockAssignment(context))
    )
      return {};
    if (
      referenceManager
        ? !(await lockPermission(referenceManager))
        : !reference || !(await lockAssignment(reference))
    )
      return {};
  }
  const identity = (row: (typeof rows)[number]) => [
    row.bundle,
    row.id,
    row.version,
  ];
  const scope = [
    actor.internalUserId,
    actor.workspaceId,
    actor.workspaceMembershipId,
    companyId,
  ];
  const digest = (kind: string, consumed: unknown) =>
    kind +
    '.v1.' +
    createHash('sha256')
      .update(JSON.stringify([...scope, consumed]))
      .digest('hex');
  const contextIdentity = manager
    ? ['company.manage', manager.id, null]
    : context
      ? identity(context)
      : undefined;
  const referenceIdentity = referenceManager
    ? ['client.manage', referenceManager.id, null]
    : reference
      ? identity(reference)
      : undefined;
  return {
    contextCapture: contextIdentity
      ? digest('payment-evidence-context', contextIdentity)
      : undefined,
    referenceReadCapture: referenceIdentity
      ? digest('payment-evidence-reference-read', referenceIdentity)
      : undefined,
  };
}
