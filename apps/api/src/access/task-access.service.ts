import { COMPANY_TASK_MANAGER_BUNDLE } from './company-permissions.js';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { DatabaseContext } from '../database/database-context.js';
import {
  workspaceMemberships,
  companyRoleAssignments,
} from '../database/schema/index.js';
import type { ActorContext, CompanyId } from './access.types.js';
import {
  parseCompanyId,
  parseWorkspaceMembershipId,
} from './access-identifiers.js';
import {
  readMemberAuthority,
  type MemberAuthoritySelection,
} from './member-authority.js';

/** Access owns candidate evaluation. A candidate is never impersonated as an actor. */
@Injectable()
export class TaskAccessService {
  constructor(private readonly database: DatabaseContext) {}
  async requireActor(
    actor: ActorContext,
    manage = false,
    lock = false,
  ): Promise<CompanyId> {
    const companyId = actor.activeCompany?.id;
    if (!companyId) throw new ForbiddenException();
    const selectedCompanyId = parseCompanyId(companyId);
    const authority = await this.memberAuthority({
      workspaceId: actor.workspaceId,
      companyId: selectedCompanyId,
      membershipId: parseWorkspaceMembershipId(actor.workspaceMembershipId),
      lock,
    });
    if (
      !authority ||
      authority.internalUserId !== actor.internalUserId ||
      !authority.read ||
      (manage && !authority.manage)
    )
      throw new ForbiddenException();
    return selectedCompanyId;
  }
  /** Captured native Task read inside a caller-owned readonly snapshot. */
  async requireActorWithinReadTransaction(
    actor: ActorContext,
  ): Promise<string> {
    const company = actor.activeCompany;
    if (
      !actor.active ||
      !company?.taskPermissions?.includes('task.read') ||
      company.taskPermissionSetVersion !== 'v1' ||
      !company.taskPermissionAssignmentId
    )
      throw new ForbiddenException();
    const companyId = await this.requireActor(actor);
    const [assignment] = await this.database.connection
      .select({ id: companyRoleAssignments.id })
      .from(companyRoleAssignments)
      .where(
        and(
          eq(companyRoleAssignments.id, company.taskPermissionAssignmentId),
          eq(companyRoleAssignments.workspaceId, actor.workspaceId),
          eq(companyRoleAssignments.companyId, companyId),
          eq(
            companyRoleAssignments.workspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(companyRoleAssignments.bundle, COMPANY_TASK_MANAGER_BUNDLE),
          eq(companyRoleAssignments.permissionSetVersion, 'v1'),
          isNull(companyRoleAssignments.revokedAt),
        ),
      );
    if (!assignment) throw new ForbiddenException();
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
        membershipId: parseWorkspaceMembershipId(member.id),
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
      companyId: parseCompanyId(companyId),
      membershipId: parseWorkspaceMembershipId(membershipId),
      lock: true,
    });
    if (!authority?.read)
      throw new BadRequestException('The responsible member is unavailable.');
    return {
      workspaceMembershipId: membershipId,
      displayLabel: authority.displayLabel,
    };
  }
  private async memberAuthority(input: MemberAuthoritySelection) {
    const authority = await readMemberAuthority(
      this.database.connection,
      input,
    );
    if (!authority) return undefined;
    return {
      internalUserId: authority.internalUserId,
      displayLabel: authority.displayLabel,
      read: authority.projectReader && authority.taskRead,
      manage: authority.taskManage,
    };
  }
}
