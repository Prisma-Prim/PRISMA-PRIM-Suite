import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { and, eq, isNotNull, isNull, sql } from 'drizzle-orm';
import { AccountabilityService } from '../accountability/accountability.service.js';
import {
  COMPANY_CONTEXT_ASSIGNMENT_GRANTED_ACTION,
  COMPANY_CONTEXT_ASSIGNMENT_REVOKED_ACTION,
} from '../accountability/accountability.types.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  companies,
  companyRoleAssignments,
  internalUsers,
  workspaceMemberships,
} from '../database/schema/index.js';
import { requireWorkspacePermission } from './access-policy.js';
import type { ActorContext } from './access.types.js';
import type {
  CompanyContextAssignmentRecord,
  GrantCompanyContextAssignmentCommand,
} from './company-context-assignment.types.js';

@Injectable()
export class CompanyContextAssignmentService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly accountability: AccountabilityService,
  ) {}

  async grant(
    actor: ActorContext,
    command: GrantCompanyContextAssignmentCommand,
  ): Promise<CompanyContextAssignmentRecord> {
    requireWorkspacePermission(actor, 'company.assignment.manage');
    const workspaceMembershipId = requireUuid(command.workspaceMembershipId);
    const companyId = requireUuid(command.companyId);

    return this.databaseContext.transaction(async () => {
      const target = await this.requireActiveTargets(
        actor.workspaceId,
        workspaceMembershipId,
        companyId,
      );
      const [changed] = await this.databaseContext.connection
        .insert(companyRoleAssignments)
        .values({
          workspaceId: actor.workspaceId,
          workspaceMembershipId,
          companyId,
          bundle: 'company_context_access',
        })
        .onConflictDoUpdate({
          target: [
            companyRoleAssignments.workspaceId,
            companyRoleAssignments.companyId,
            companyRoleAssignments.workspaceMembershipId,
            companyRoleAssignments.bundle,
          ],
          set: { revokedAt: null, updatedAt: sql`now()` },
          setWhere: isNotNull(companyRoleAssignments.revokedAt),
        })
        .returning();
      const assignment =
        changed ??
        (await this.findAssignment(
          actor.workspaceId,
          workspaceMembershipId,
          companyId,
        ));
      if (!assignment)
        throw new Error('The canonical assignment could not be resolved.');
      if (changed) {
        await this.accountability.record({
          actor,
          action: COMPANY_CONTEXT_ASSIGNMENT_GRANTED_ACTION,
          target: {
            type: 'company_role_assignment',
            assignmentId: assignment.id,
            companyId,
            workspaceMembershipId,
            internalUserId: target.internalUserId,
          },
          metadata: { bundle: 'Company Context Access' },
          transitionId: assignment.updatedAt.toISOString(),
        });
      }
      return toRecord(assignment);
    });
  }

  async revoke(
    actor: ActorContext,
    workspaceMembershipIdValue: unknown,
    companyIdValue: unknown,
  ): Promise<CompanyContextAssignmentRecord> {
    requireWorkspacePermission(actor, 'company.assignment.manage');
    const workspaceMembershipId = requireUuid(workspaceMembershipIdValue);
    const companyId = requireUuid(companyIdValue);
    return this.databaseContext.transaction(async () => {
      const target = await this.findTargetMembership(
        actor.workspaceId,
        workspaceMembershipId,
      );
      if (!target) throw new ForbiddenException();
      const [changed] = await this.databaseContext.connection
        .update(companyRoleAssignments)
        .set({ revokedAt: sql`now()`, updatedAt: sql`now()` })
        .where(
          and(
            eq(companyRoleAssignments.workspaceId, actor.workspaceId),
            eq(
              companyRoleAssignments.workspaceMembershipId,
              workspaceMembershipId,
            ),
            eq(companyRoleAssignments.companyId, companyId),
            eq(companyRoleAssignments.bundle, 'company_context_access'),
            isNull(companyRoleAssignments.revokedAt),
          ),
        )
        .returning();
      const assignment =
        changed ??
        (await this.findAssignment(
          actor.workspaceId,
          workspaceMembershipId,
          companyId,
        ));
      if (!assignment) throw new ForbiddenException();
      if (changed) {
        await this.accountability.record({
          actor,
          action: COMPANY_CONTEXT_ASSIGNMENT_REVOKED_ACTION,
          target: {
            type: 'company_role_assignment',
            assignmentId: assignment.id,
            companyId,
            workspaceMembershipId,
            internalUserId: target.internalUserId,
          },
          metadata: { bundle: 'Company Context Access' },
          transitionId: assignment.updatedAt.toISOString(),
        });
      }
      return toRecord(assignment);
    });
  }

  private async requireActiveTargets(
    workspaceId: string,
    workspaceMembershipId: string,
    companyId: string,
  ): Promise<{ internalUserId: string }> {
    const [target] = await this.databaseContext.connection
      .select({ internalUserId: workspaceMemberships.internalUserId })
      .from(workspaceMemberships)
      .innerJoin(
        internalUsers,
        eq(internalUsers.id, workspaceMemberships.internalUserId),
      )
      .innerJoin(
        companies,
        eq(companies.workspaceId, workspaceMemberships.workspaceId),
      )
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspaceId),
          eq(workspaceMemberships.id, workspaceMembershipId),
          eq(workspaceMemberships.status, 'active'),
          eq(internalUsers.status, 'active'),
          eq(companies.id, companyId),
          eq(companies.status, 'active'),
        ),
      )
      .limit(1);
    if (!target) throw new ForbiddenException();
    return target;
  }

  private async findAssignment(
    workspaceId: string,
    workspaceMembershipId: string,
    companyId: string,
  ) {
    const [assignment] = await this.databaseContext.connection
      .select()
      .from(companyRoleAssignments)
      .where(
        and(
          eq(companyRoleAssignments.workspaceId, workspaceId),
          eq(
            companyRoleAssignments.workspaceMembershipId,
            workspaceMembershipId,
          ),
          eq(companyRoleAssignments.companyId, companyId),
          eq(companyRoleAssignments.bundle, 'company_context_access'),
        ),
      )
      .limit(1);
    return assignment;
  }

  private async findTargetMembership(
    workspaceId: string,
    workspaceMembershipId: string,
  ): Promise<{ internalUserId: string } | undefined> {
    const [membership] = await this.databaseContext.connection
      .select({ internalUserId: workspaceMemberships.internalUserId })
      .from(workspaceMemberships)
      .where(
        and(
          eq(workspaceMemberships.workspaceId, workspaceId),
          eq(workspaceMemberships.id, workspaceMembershipId),
        ),
      )
      .limit(1);
    return membership;
  }
}

function requireUuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  ) {
    throw new BadRequestException('A valid UUID is required.');
  }
  return value;
}

function toRecord(
  assignment: typeof companyRoleAssignments.$inferSelect,
): CompanyContextAssignmentRecord {
  return {
    id: assignment.id,
    workspaceMembershipId: assignment.workspaceMembershipId,
    companyId: assignment.companyId,
    bundle: 'Company Context Access',
    active: assignment.revokedAt === null,
  };
}
