import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { DatabaseContext } from '../database/database-context.js';
import {
  companies,
  companyRoleAssignments,
  internalUsers,
  workspaceMemberships,
  workspacePermissionGrants,
} from '../database/schema/index.js';
import type { ActorContext } from './access.types.js';
import {
  COMPANY_CONTEXT_ACCESS_BUNDLE,
  COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE,
  COMPANY_DOCUMENT_REGISTRAR_BUNDLE,
  COMPANY_PROJECT_ACCESS_BUNDLE,
  COMPANY_TASK_MANAGER_BUNDLE,
  companyDirectorClientPermissionsFor,
  taskPermissionsFor,
} from './company-permissions.js';

/** Access owns candidate evaluation. A candidate is never impersonated as an actor. */
@Injectable()
export class TaskAccessService {
  constructor(private readonly database: DatabaseContext) {}
  async requireActor(
    actor: ActorContext,
    manage = false,
    lock = false,
  ): Promise<string> {
    const companyId = actor.activeCompany?.id;
    if (!companyId) throw new ForbiddenException();
    const authority = await this.memberAuthority({
      workspaceId: actor.workspaceId,
      companyId,
      membershipId: actor.workspaceMembershipId,
      lock,
    });
    if (
      !authority ||
      authority.internalUserId !== actor.internalUserId ||
      !authority.read ||
      (manage && !authority.manage)
    )
      throw new ForbiddenException();
    return companyId;
  }
  /** The caller first authorizes the exact Project and original Client relationship. */
  async eligibleMembers(actor: ActorContext) {
    const companyId = await this.requireActor(actor, true);
    const memberships = await this.database.connection
      .select({ id: workspaceMemberships.id })
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.workspaceId, actor.workspaceId),
          eq(workspaceMemberships.status, 'active'),
        ),
      )
      .orderBy(asc(workspaceMemberships.id));
    const members = [];
    for (const member of memberships) {
      const authority = await this.memberAuthority({
        workspaceId: actor.workspaceId,
        companyId,
        membershipId: member.id,
        lock: false,
      });
      if (authority?.read)
        members.push({
          workspaceMembershipId: member.id,
          displayLabel: authority.displayLabel,
        });
    }
    return members.sort((a, b) => a.displayLabel.localeCompare(b.displayLabel));
  }
  async requireEligibleMember(actor: ActorContext, membershipId: string) {
    const companyId = actor.activeCompany?.id;
    if (!companyId) throw new ForbiddenException();
    const authority = await this.memberAuthority({
      workspaceId: actor.workspaceId,
      companyId,
      membershipId,
      lock: true,
    });
    if (!authority?.read)
      throw new BadRequestException('The responsible member is unavailable.');
    return {
      workspaceMembershipId: membershipId,
      displayLabel: authority.displayLabel,
    };
  }
  private async memberAuthority(input: {
    workspaceId: string;
    companyId: string;
    membershipId: string;
    lock: boolean;
  }) {
    const query = this.database.connection
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
    const grantsQuery = this.database.connection
      .select({ permission: workspacePermissionGrants.permission })
      .from(workspacePermissionGrants)
      .where(
        and(
          eq(workspacePermissionGrants.workspaceId, input.workspaceId),
          eq(
            workspacePermissionGrants.workspaceMembershipId,
            input.membershipId,
          ),
        ),
      );
    const grants = input.lock
      ? await grantsQuery.for('share')
      : await grantsQuery;
    const assignmentsQuery = this.database.connection
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
      read = false,
      manage = false;
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
        case COMPANY_PROJECT_ACCESS_BUNDLE:
          if (assignment.version === 'v1') {
            project = true;
            context = true;
          }
          break;
        case COMPANY_TASK_MANAGER_BUNDLE: {
          const permissions = taskPermissionsFor(assignment.version);
          read = permissions.includes('task.read');
          manage = permissions.includes('task.manage');
          break;
        }
        case 'company_document_project_organizer':
          break;
      }
    }
    // Stable non-email suffix distinguishes equal names without a directory lookup.
    const reference = BigInt(`0x${input.membershipId.replaceAll('-', '')}`)
      .toString(36)
      .toUpperCase();
    return {
      internalUserId: member.internalUserId,
      displayLabel: `${member.displayName} · ${reference}`,
      read: context && client && project && read,
      manage,
    };
  }
}
