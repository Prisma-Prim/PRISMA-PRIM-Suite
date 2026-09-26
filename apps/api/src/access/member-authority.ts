import { and, eq, isNull } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import {
  companies,
  companyRoleAssignments,
  internalUsers,
  workspaceMemberships,
  workspacePermissionGrants,
} from '../database/schema/index.js';
import {
  COMMERCIAL_INTAKE_READ_PERMISSIONS,
  COMPANY_COMMERCIAL_INTAKE_BUNDLE,
  COMPANY_CONTEXT_ACCESS_BUNDLE,
  COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE,
  COMPANY_DOCUMENT_REGISTRAR_BUNDLE,
  COMPANY_PROJECT_ACCESS_BUNDLE,
  COMPANY_TASK_MANAGER_BUNDLE,
  commercialIntakePermissionsFor,
  companyDirectorClientPermissionsFor,
  projectPermissionsFor,
  taskPermissionsFor,
} from './company-permissions.js';

export interface MemberAuthority {
  internalUserId: string;
  displayLabel: string;
  /** Effective Company context, Project read and Client read in the Company. */
  projectReader: boolean;
  /** Effective Company context and live Commercial Intake read in the Company. */
  commercialIntakeReader: boolean;
  taskRead: boolean;
  taskManage: boolean;
}

/**
 * Access-internal evaluation of one candidate membership's live grants in one
 * Company. A candidate is never impersonated as an actor. A locked read
 * share-locks the membership, its Internal User, the Company, its grants and
 * its assignments so a concurrent suspension or revocation serializes.
 */
export async function readMemberAuthority(
  connection: NodePgDatabase,
  input: {
    workspaceId: string;
    companyId: string;
    membershipId: string;
    lock: boolean;
  },
): Promise<MemberAuthority | undefined> {
  const query = connection
    .select({
      internalUserId: internalUsers.id,
      displayName: internalUsers.displayName,
    })
    .from(workspaceMemberships)
    .innerJoin(
      internalUsers,
      and(
        eq(internalUsers.id, workspaceMemberships.internalUserId),
        eq(internalUsers.status, 'active'),
      ),
    )
    .innerJoin(
      companies,
      and(
        eq(companies.workspaceId, workspaceMemberships.workspaceId),
        eq(companies.id, input.companyId),
        eq(companies.status, 'active'),
      ),
    )
    .where(
      and(
        eq(workspaceMemberships.workspaceId, input.workspaceId),
        eq(workspaceMemberships.id, input.membershipId),
        eq(workspaceMemberships.status, 'active'),
      ),
    );
  const [member] = input.lock ? await query.for('share') : await query;
  if (!member) return undefined;
  const grantsQuery = connection
    .select({ permission: workspacePermissionGrants.permission })
    .from(workspacePermissionGrants)
    .where(
      and(
        eq(workspacePermissionGrants.workspaceId, input.workspaceId),
        eq(workspacePermissionGrants.workspaceMembershipId, input.membershipId),
      ),
    );
  const grants = input.lock
    ? await grantsQuery.for('share')
    : await grantsQuery;
  const assignmentsQuery = connection
    .select({
      bundle: companyRoleAssignments.bundle,
      version: companyRoleAssignments.permissionSetVersion,
    })
    .from(companyRoleAssignments)
    .where(
      and(
        eq(companyRoleAssignments.workspaceId, input.workspaceId),
        eq(companyRoleAssignments.companyId, input.companyId),
        eq(companyRoleAssignments.workspaceMembershipId, input.membershipId),
        isNull(companyRoleAssignments.revokedAt),
      ),
    );
  const assignments = input.lock
    ? await assignmentsQuery.for('share')
    : await assignmentsQuery;
  let context = grants.some((row) => row.permission === 'company.manage');
  let client = grants.some((row) => row.permission === 'client.manage');
  let project = false,
    intakeRead = false,
    taskRead = false,
    taskManage = false;
  for (const assignment of assignments) {
    switch (assignment.bundle) {
      case COMPANY_CONTEXT_ACCESS_BUNDLE:
        if (assignment.version === null) context = true;
        break;
      case COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE:
        if (
          companyDirectorClientPermissionsFor(assignment.version).includes(
            'client.read',
          )
        ) {
          client = true;
          context = true;
        }
        break;
      case COMPANY_DOCUMENT_REGISTRAR_BUNDLE:
        if (assignment.version === 'v1') context = true;
        break;
      // Captured v1 and v2 both read Projects; null or unknown fail closed.
      case COMPANY_PROJECT_ACCESS_BUNDLE:
        if (
          projectPermissionsFor(assignment.version).includes('project.read')
        ) {
          project = true;
          context = true;
        }
        break;
      // Any captured version carrying both reads; Intake confers no context.
      case COMPANY_COMMERCIAL_INTAKE_BUNDLE: {
        const permissions = commercialIntakePermissionsFor(assignment.version);
        intakeRead = COMMERCIAL_INTAKE_READ_PERMISSIONS.every((permission) =>
          permissions.includes(permission),
        );
        break;
      }
      case COMPANY_TASK_MANAGER_BUNDLE: {
        const permissions = taskPermissionsFor(assignment.version);
        taskRead = permissions.includes('task.read');
        taskManage = permissions.includes('task.manage');
        break;
      }
      case 'company_document_project_organizer':
        break;
    }
  }
  return {
    internalUserId: member.internalUserId,
    displayLabel: memberDisplayLabel(member.displayName, input.membershipId),
    projectReader: context && client && project,
    commercialIntakeReader: context && intakeRead,
    taskRead,
    taskManage,
  };
}

/**
 * The label Access shows for one membership: its current display name and a
 * stable non-email suffix that distinguishes equal names without a directory
 * lookup.
 */
export function memberDisplayLabel(
  displayName: string,
  workspaceMembershipId: string,
): string {
  const reference = BigInt(`0x${workspaceMembershipId.replaceAll('-', '')}`)
    .toString(36)
    .toUpperCase();
  return `${displayName} · ${reference}`;
}
