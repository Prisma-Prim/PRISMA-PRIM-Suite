import { createHash } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import type { DatabaseContext } from '../database/database-context.js';
import {
  companies,
  companyRoleAssignments,
  internalUsers,
  workspaceMemberships,
  workspacePermissionGrants,
} from '../database/schema/index.js';
import type { ActorContext } from './access.types.js';
import {
  type CompanyRoleBundle,
  COMMERCIAL_INTAKE_READ_PERMISSIONS,
  COMPANY_COMMERCIAL_INTAKE_BUNDLE,
  COMPANY_CONTEXT_ACCESS_BUNDLE,
  COMPANY_CONTEXT_USE_BUNDLES,
  COMPANY_OFFER_APPROVER_BUNDLE,
  COMPANY_OFFER_PREPARER_BUNDLE,
  COMPANY_PROJECT_ACCESS_BUNDLE,
  commercialIntakePermissionsFor,
  offerApproverPermissionsFor,
  offerPreparerPermissionsFor,
} from './company-permissions.js';

const contextBundles: CompanyRoleBundle[] = [
  ...COMPANY_CONTEXT_USE_BUNDLES,
  COMPANY_PROJECT_ACCESS_BUNDLE,
];

/** Access-internal selection shared by projection and protected observation.
 * Only one native Intake, Offer reader and independent context are consumed.
 * The opaque digest is observation evidence; every use still reads live rows.
 */
export async function readOfferMessageReadCapture(input: {
  database: DatabaseContext;
  actor: ActorContext;
  companyId: string;
  lock: boolean;
}) {
  const { actor, companyId, lock } = input;
  if (!actor.active) return undefined;
  const database = input.database.connection;
  const scope = and(
    eq(companyRoleAssignments.workspaceId, actor.workspaceId),
    eq(
      companyRoleAssignments.workspaceMembershipId,
      actor.workspaceMembershipId,
    ),
    eq(companyRoleAssignments.companyId, companyId),
    isNull(companyRoleAssignments.revokedAt),
    eq(workspaceMemberships.status, 'active'),
    eq(internalUsers.id, actor.internalUserId),
    eq(internalUsers.status, 'active'),
    eq(companies.status, 'active'),
  );
  const query = () =>
    database
      .select({
        id: companyRoleAssignments.id,
        bundle: companyRoleAssignments.bundle,
        version: companyRoleAssignments.permissionSetVersion,
        displayName: internalUsers.displayName,
      })
      .from(companyRoleAssignments)
      .innerJoin(
        workspaceMemberships,
        and(
          eq(
            workspaceMemberships.id,
            companyRoleAssignments.workspaceMembershipId,
          ),
          eq(
            workspaceMemberships.workspaceId,
            companyRoleAssignments.workspaceId,
          ),
        ),
      )
      .innerJoin(
        internalUsers,
        eq(internalUsers.id, workspaceMemberships.internalUserId),
      )
      .innerJoin(
        companies,
        and(
          eq(companies.id, companyRoleAssignments.companyId),
          eq(companies.workspaceId, companyRoleAssignments.workspaceId),
        ),
      );
  const rows = await query()
    .where(
      and(
        scope,
        inArray(companyRoleAssignments.bundle, [
          ...contextBundles,
          COMPANY_COMMERCIAL_INTAKE_BUNDLE,
          COMPANY_OFFER_PREPARER_BUNDLE,
          COMPANY_OFFER_APPROVER_BUNDLE,
        ]),
      ),
    )
    .orderBy(companyRoleAssignments.id);
  const intake = rows.find(
    (row) =>
      row.bundle === COMPANY_COMMERCIAL_INTAKE_BUNDLE &&
      COMMERCIAL_INTAKE_READ_PERMISSIONS.every((permission) =>
        commercialIntakePermissionsFor(row.version).includes(permission),
      ),
  );
  const offer =
    rows.find(
      (row) =>
        row.bundle === COMPANY_OFFER_PREPARER_BUNDLE &&
        offerPreparerPermissionsFor(row.version).includes(
          'commercial.offer.read',
        ),
    ) ??
    rows.find(
      (row) =>
        row.bundle === COMPANY_OFFER_APPROVER_BUNDLE &&
        offerApproverPermissionsFor(row.version).includes(
          'commercial.offer.read',
        ),
    );
  if (!intake || !offer) return undefined;

  const managerQuery = database
    .select({ id: workspacePermissionGrants.id })
    .from(workspacePermissionGrants)
    .where(
      and(
        eq(workspacePermissionGrants.workspaceId, actor.workspaceId),
        eq(
          workspacePermissionGrants.workspaceMembershipId,
          actor.workspaceMembershipId,
        ),
        eq(workspacePermissionGrants.permission, 'company.manage'),
      ),
    )
    .orderBy(workspacePermissionGrants.id);
  const manager = actor.workspacePermissions.includes('company.manage')
    ? (await managerQuery)[0]
    : undefined;
  const context = rows
    .filter((row) => contextBundles.some((bundle) => bundle === row.bundle))
    .sort((left, right) => {
      const rank = (bundle: string) =>
        bundle === COMPANY_CONTEXT_ACCESS_BUNDLE
          ? 0
          : bundle === COMPANY_PROJECT_ACCESS_BUNDLE
            ? 1
            : 2;
      return (
        rank(left.bundle) - rank(right.bundle) ||
        (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
      );
    })[0];
  if (!manager && !context) return undefined;

  // Native Offer access has already acquired Offer/member/Company → context.
  // Keep that order, then consume Intake before any exact source is observed.
  if (lock) {
    async function lockAssignment(selected: (typeof rows)[number]) {
      const [live] = await query()
        .where(
          and(
            scope,
            eq(companyRoleAssignments.id, selected.id),
            eq(companyRoleAssignments.bundle, selected.bundle),
            selected.version === null
              ? isNull(companyRoleAssignments.permissionSetVersion)
              : eq(
                  companyRoleAssignments.permissionSetVersion,
                  selected.version,
                ),
          ),
        )
        .for('share');
      return Boolean(live);
    }
    if (!(await lockAssignment(offer))) return undefined;
    if (manager) {
      const [live] = await database
        .select({ id: workspacePermissionGrants.id })
        .from(workspacePermissionGrants)
        .where(
          and(
            eq(workspacePermissionGrants.id, manager.id),
            eq(workspacePermissionGrants.workspaceId, actor.workspaceId),
            eq(
              workspacePermissionGrants.workspaceMembershipId,
              actor.workspaceMembershipId,
            ),
            eq(workspacePermissionGrants.permission, 'company.manage'),
          ),
        )
        .for('share');
      if (!live) return undefined;
    } else if (context && !(await lockAssignment(context))) return undefined;
    if (!(await lockAssignment(intake))) return undefined;
  }
  const identity = (row: (typeof rows)[number]) => [
    row.bundle,
    row.id,
    row.version,
  ];
  const readCapture =
    'offer-message-read.v1.' +
    createHash('sha256')
      .update(
        JSON.stringify([
          actor.internalUserId,
          actor.workspaceId,
          actor.workspaceMembershipId,
          companyId,
          identity(intake),
          identity(offer),
          manager
            ? ['company.manage', manager.id, null]
            : context && identity(context),
        ]),
      )
      .digest('hex');
  return {
    companyId,
    readCapture,
    actor: {
      workspaceMembershipId: actor.workspaceMembershipId,
      displayName: offer.displayName,
    },
  };
}
