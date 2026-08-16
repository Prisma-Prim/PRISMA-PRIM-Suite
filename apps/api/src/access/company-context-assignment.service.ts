import { randomUUID } from 'node:crypto';
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
  companyContextAssignmentCommands,
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

type Operation = 'grant' | 'revoke';
type CommandRow = typeof companyContextAssignmentCommands.$inferSelect;

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
    return this.mutate(
      actor,
      'grant',
      command.workspaceMembershipId,
      command.companyId,
      command.idempotencyKey,
    );
  }

  async revoke(
    actor: ActorContext,
    workspaceMembershipIdValue: unknown,
    companyIdValue: unknown,
    idempotencyKey: string | undefined,
  ): Promise<CompanyContextAssignmentRecord> {
    return this.mutate(
      actor,
      'revoke',
      workspaceMembershipIdValue,
      companyIdValue,
      idempotencyKey,
    );
  }

  private async mutate(
    actor: ActorContext,
    operation: Operation,
    workspaceMembershipIdValue: unknown,
    companyIdValue: unknown,
    idempotencyKeyValue: string | undefined,
  ): Promise<CompanyContextAssignmentRecord> {
    requireWorkspacePermission(actor, 'company.assignment.manage');
    const workspaceMembershipId = requireUuid(workspaceMembershipIdValue);
    const companyId = requireUuid(companyIdValue);
    const idempotencyKey = requireIdempotencyKey(idempotencyKeyValue);
    return this.databaseContext.transaction(async () => {
      const replay = await this.findCommand(actor, idempotencyKey);
      if (replay) {
        assertSameCommand(replay, operation, workspaceMembershipId, companyId);
        return commandResult(replay);
      }
      const target = await this.requireActiveTargets(
        actor.workspaceId,
        workspaceMembershipId,
        companyId,
      );
      const transitionId = randomUUID();
      const [reserved] = await this.databaseContext.connection
        .insert(companyContextAssignmentCommands)
        .values({
          workspaceId: actor.workspaceId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          idempotencyKey,
          operation,
          targetWorkspaceMembershipId: workspaceMembershipId,
          companyId,
          resultActive: operation === 'grant',
          transitionId,
        })
        .onConflictDoNothing()
        .returning();
      if (!reserved) {
        const raced = await this.findCommand(actor, idempotencyKey);
        if (!raced)
          throw new Error('The idempotent command could not be resolved.');
        assertSameCommand(raced, operation, workspaceMembershipId, companyId);
        return commandResult(raced);
      }
      const assignment =
        operation === 'grant'
          ? await this.applyGrant(
              actor.workspaceId,
              workspaceMembershipId,
              companyId,
              transitionId,
            )
          : await this.applyRevoke(
              actor.workspaceId,
              workspaceMembershipId,
              companyId,
              transitionId,
            );
      await this.databaseContext.connection
        .update(companyContextAssignmentCommands)
        .set({ resultAssignmentId: assignment.id })
        .where(eq(companyContextAssignmentCommands.id, reserved.id));
      if (assignment.changed) {
        await this.accountability.record({
          actor,
          action:
            operation === 'grant'
              ? COMPANY_CONTEXT_ASSIGNMENT_GRANTED_ACTION
              : COMPANY_CONTEXT_ASSIGNMENT_REVOKED_ACTION,
          target: {
            type: 'company_role_assignment',
            assignmentId: assignment.id,
            companyId,
            workspaceMembershipId,
            internalUserId: target.internalUserId,
          },
          metadata: { bundle: 'Company Context Access' },
          transitionId,
        });
      }
      return {
        id: assignment.id,
        workspaceMembershipId,
        companyId,
        bundle: 'Company Context Access',
        active: operation === 'grant',
      };
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

  private async applyGrant(
    workspaceId: string,
    workspaceMembershipId: string,
    companyId: string,
    transitionId: string,
  ) {
    const [changed] = await this.databaseContext.connection
      .insert(companyRoleAssignments)
      .values({
        workspaceId,
        workspaceMembershipId,
        companyId,
        bundle: 'company_context_access',
        transitionId,
      })
      .onConflictDoUpdate({
        target: [
          companyRoleAssignments.workspaceId,
          companyRoleAssignments.companyId,
          companyRoleAssignments.workspaceMembershipId,
          companyRoleAssignments.bundle,
        ],
        set: { revokedAt: null, updatedAt: sql`now()`, transitionId },
        setWhere: isNotNull(companyRoleAssignments.revokedAt),
      })
      .returning();
    const assignment =
      changed ??
      (await this.findAssignment(
        workspaceId,
        workspaceMembershipId,
        companyId,
      ));
    if (!assignment)
      throw new Error('The canonical assignment could not be resolved.');
    return { ...assignment, changed: Boolean(changed) };
  }

  private async applyRevoke(
    workspaceId: string,
    workspaceMembershipId: string,
    companyId: string,
    transitionId: string,
  ) {
    const [changed] = await this.databaseContext.connection
      .update(companyRoleAssignments)
      .set({ revokedAt: sql`now()`, updatedAt: sql`now()`, transitionId })
      .where(
        and(
          eq(companyRoleAssignments.workspaceId, workspaceId),
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
        workspaceId,
        workspaceMembershipId,
        companyId,
      ));
    if (!assignment) throw new ForbiddenException();
    return { ...assignment, changed: Boolean(changed) };
  }

  private async findCommand(actor: ActorContext, idempotencyKey: string) {
    const [command] = await this.databaseContext.connection
      .select()
      .from(companyContextAssignmentCommands)
      .where(
        and(
          eq(companyContextAssignmentCommands.workspaceId, actor.workspaceId),
          eq(
            companyContextAssignmentCommands.actorWorkspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(companyContextAssignmentCommands.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return command;
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

function requireIdempotencyKey(value: string | undefined): string {
  if (!value?.trim())
    throw new BadRequestException('Idempotency-Key header is required.');
  return value.trim();
}

function assertSameCommand(
  command: CommandRow,
  operation: Operation,
  workspaceMembershipId: string,
  companyId: string,
): void {
  if (
    command.operation !== operation ||
    command.targetWorkspaceMembershipId !== workspaceMembershipId ||
    command.companyId !== companyId
  ) {
    throw new BadRequestException(
      'Idempotency-Key was already used for another command.',
    );
  }
  if (!command.resultAssignmentId)
    throw new Error('The idempotent command is incomplete.');
}

function commandResult(command: CommandRow): CompanyContextAssignmentRecord {
  if (!command.resultAssignmentId)
    throw new Error('The idempotent command is incomplete.');
  return {
    id: command.resultAssignmentId,
    workspaceMembershipId: command.targetWorkspaceMembershipId,
    companyId: command.companyId,
    bundle: 'Company Context Access',
    active: command.resultActive,
  };
}
