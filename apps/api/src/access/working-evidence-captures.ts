import { createHash } from 'node:crypto';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import type { DatabaseContext } from '../database/database-context.js';
import {
  companies,
  companyRoleAssignments,
  internalUsers,
  workspaceMemberships,
  workspacePermissionGrants,
} from '../database/schema/index.js';
import type { ActorContext, ActiveCompanyContext } from './access.types.js';

/** Native alternatives are selected once; unrelated assignments never enter these captures. */
export async function readWorkingEvidenceCaptures(input: {
  database: DatabaseContext;
  actor: ActorContext;
  company: ActiveCompanyContext;
  lock: boolean;
  expected?: {
    contextCapture: string | undefined;
    clientReadCapture: string | undefined;
  };
}): Promise<{ contextCapture: string; clientReadCapture: string } | undefined> {
  const { actor, company, lock } = input;
  const connection = input.database.connection;
  const memberQuery = connection
    .select({ id: workspaceMemberships.id })
    .from(workspaceMemberships)
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
        eq(companies.workspaceId, workspaceMemberships.workspaceId),
        eq(companies.id, company.id),
        eq(companies.status, 'active'),
      ),
    )
    .where(
      and(
        eq(workspaceMemberships.workspaceId, actor.workspaceId),
        eq(workspaceMemberships.id, actor.workspaceMembershipId),
        eq(workspaceMemberships.status, 'active'),
      ),
    );
  const [member] = lock ? await memberQuery.for('share') : await memberQuery;
  if (!member || !actor.active) return undefined;
  const grants = await connection
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
    .orderBy(asc(workspacePermissionGrants.id));
  const assignments = await connection
    .select({
      id: companyRoleAssignments.id,
      bundle: companyRoleAssignments.bundle,
      version: companyRoleAssignments.permissionSetVersion,
    })
    .from(companyRoleAssignments)
    .where(
      and(
        eq(companyRoleAssignments.workspaceId, actor.workspaceId),
        eq(companyRoleAssignments.companyId, company.id),
        eq(
          companyRoleAssignments.workspaceMembershipId,
          actor.workspaceMembershipId,
        ),
        inArray(companyRoleAssignments.bundle, [
          'company_context_access',
          'company_project_access',
          'company_document_registrar',
          'company_director_client_access',
        ]),
        isNull(companyRoleAssignments.revokedAt),
      ),
    )
    .orderBy(asc(companyRoleAssignments.id));
  const supported = assignments.filter((row) =>
    row.bundle === 'company_context_access'
      ? row.version === null
      : row.bundle === 'company_document_registrar'
        ? ['v1', 'v2', 'v3'].some((version) => version === row.version)
        : row.version === 'v1' || row.version === 'v2',
  );
  const digest = (prefix: string, source: unknown) =>
    prefix +
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
      .digest('hex');
  const contextDigest = (source: unknown) =>
    digest('working-evidence-context.v1.', source);
  const clientDigest = (source: unknown) =>
    digest('working-evidence-client-read.v1.', source);
  const rank = (bundle: string) =>
    bundle === 'company_context_access'
      ? 0
      : bundle === 'company_project_access'
        ? 1
        : bundle === 'company_document_registrar'
          ? 2
          : 3;
  const contexts = supported
    .slice()
    .sort(
      (a, b) => rank(a.bundle) - rank(b.bundle) || a.id.localeCompare(b.id),
    );
  const companyManagers = actor.workspacePermissions.includes('company.manage')
    ? grants.filter((row) => row.permission === 'company.manage')
    : [];
  const clientManagers = actor.workspacePermissions.includes('client.manage')
    ? grants.filter((row) => row.permission === 'client.manage')
    : [];
  const companyManager = input.expected
    ? companyManagers.find(
        (row) =>
          contextDigest(['workspace', row.id]) ===
          input.expected?.contextCapture,
      )
    : companyManagers[0];
  const clientManager = input.expected
    ? clientManagers.find(
        (row) =>
          clientDigest(['workspace', row.id]) ===
          input.expected?.clientReadCapture,
      )
    : clientManagers[0];
  const contextAssignment = input.expected
    ? contexts.find(
        (row) => contextDigest(row) === input.expected?.contextCapture,
      )
    : contexts[0];
  const clientAssignment = company.clientPermissions.includes('client.read')
    ? supported.find(
        (row) =>
          row.bundle === 'company_director_client_access' &&
          row.id === company.clientPermissionAssignmentId &&
          row.version === company.clientPermissionSetVersion &&
          (!input.expected ||
            clientDigest(row) === input.expected.clientReadCapture),
      )
    : undefined;
  if (
    (!companyManager && !contextAssignment) ||
    (!clientManager && !clientAssignment)
  )
    return undefined;
  const lockGrant = async (selected: typeof companyManager) => {
    if (!selected) return true;
    const [row] = await connection
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
    return row !== undefined;
  };
  const lockAssignment = async (selected: typeof contextAssignment) => {
    if (!selected) return true;
    const [row] = await connection
      .select({ id: companyRoleAssignments.id })
      .from(companyRoleAssignments)
      .where(
        and(
          eq(companyRoleAssignments.id, selected.id),
          eq(companyRoleAssignments.workspaceId, actor.workspaceId),
          eq(companyRoleAssignments.companyId, company.id),
          eq(
            companyRoleAssignments.workspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(companyRoleAssignments.bundle, selected.bundle),
          selected.version === null
            ? isNull(companyRoleAssignments.permissionSetVersion)
            : eq(companyRoleAssignments.permissionSetVersion, selected.version),
          isNull(companyRoleAssignments.revokedAt),
        ),
      )
      .for('share');
    return row !== undefined;
  };
  if (lock) {
    if (!(await lockGrant(companyManager)) || !(await lockGrant(clientManager)))
      return undefined;
    const selectedAssignments = [
      companyManager ? undefined : contextAssignment,
      clientManager ? undefined : clientAssignment,
    ]
      .filter((row): row is NonNullable<typeof row> => row !== undefined)
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const selected of selectedAssignments)
      if (!(await lockAssignment(selected))) return undefined;
  }
  return {
    contextCapture: digest(
      'working-evidence-context.v1.',
      companyManager ? ['workspace', companyManager.id] : contextAssignment,
    ),
    clientReadCapture: digest(
      'working-evidence-client-read.v1.',
      clientManager ? ['workspace', clientManager.id] : clientAssignment,
    ),
  };
}
