import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  companies,
  companyContextAssignmentCommands,
  companyRoleAssignments,
  internalUsers,
  workspaceMemberships,
} from '../database/schema/index.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from './access-command-validation.js';
import { requireWorkspacePermission } from './access-policy.js';
import type { ActorContext } from './access.types.js';
import {
  parseCompanyId,
  parseWorkspaceMembershipId,
} from './access-identifiers.js';
import {
  COMPANY_ROLE_BUNDLES,
  companyRoleAssignmentAction,
  companyRoleGrantVersion,
} from './company-permissions.js';
import { assignmentRecord } from './company-context-assignment-record.js';
import type {
  CompanyAccessAdministrationState,
  CompanyContextAssignmentRecord,
  CompanyAssignmentTarget,
  CompanyRoleAssignmentCommand,
} from './company-context-assignment.types.js';

type Operation = 'grant' | 'revoke';
type CommandRow = typeof companyContextAssignmentCommands.$inferSelect;
type Bundle = typeof companyRoleAssignments.$inferSelect.bundle;

export const INCLUDE_REVOKED_ASSIGNMENTS_IN_ADMINISTRATION = Symbol(
  'INCLUDE_REVOKED_ASSIGNMENTS_IN_ADMINISTRATION',
);

@Injectable()
export class CompanyContextAssignmentService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly accountability: AccountabilityService,
    @Inject(INCLUDE_REVOKED_ASSIGNMENTS_IN_ADMINISTRATION)
    private readonly includeRevokedAssignmentsInAdministration: boolean,
  ) {}

  async readAdministrationState(
    actor: ActorContext,
  ): Promise<CompanyAccessAdministrationState> {
    requireWorkspacePermission(actor, 'company.assignment.manage');
    return this.databaseContext.transaction(
      async () => {
        const database = this.databaseContext.connection;
        const members = await database
          .select({
            workspaceMembershipId: workspaceMemberships.id,
            displayName: internalUsers.displayName,
            email: internalUsers.email,
          })
          .from(workspaceMemberships)
          .innerJoin(
            internalUsers,
            and(
              eq(internalUsers.id, workspaceMemberships.internalUserId),
              eq(internalUsers.status, 'active'),
            ),
          )
          .where(
            and(
              eq(workspaceMemberships.workspaceId, actor.workspaceId),
              eq(workspaceMemberships.status, 'active'),
            ),
          )
          .orderBy(
            asc(internalUsers.displayName),
            asc(internalUsers.email),
            asc(workspaceMemberships.id),
          );

        const activeCompanies = await database
          .select({ id: companies.id, displayName: companies.displayName })
          .from(companies)
          .where(
            and(
              eq(companies.workspaceId, actor.workspaceId),
              eq(companies.status, 'active'),
            ),
          )
          .orderBy(asc(companies.displayName), asc(companies.id));

        const assignments = await database
          .select({
            id: companyRoleAssignments.id,
            workspaceMembershipId: companyRoleAssignments.workspaceMembershipId,
            companyId: companyRoleAssignments.companyId,
            bundle: companyRoleAssignments.bundle,
            permissionSetVersion: companyRoleAssignments.permissionSetVersion,
            revokedAt: companyRoleAssignments.revokedAt,
          })
          .from(companyRoleAssignments)
          .innerJoin(
            workspaceMemberships,
            and(
              eq(
                workspaceMemberships.workspaceId,
                companyRoleAssignments.workspaceId,
              ),
              eq(
                workspaceMemberships.id,
                companyRoleAssignments.workspaceMembershipId,
              ),
              eq(workspaceMemberships.status, 'active'),
            ),
          )
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
              eq(companies.workspaceId, companyRoleAssignments.workspaceId),
              eq(companies.id, companyRoleAssignments.companyId),
              eq(companies.status, 'active'),
            ),
          )
          .where(
            and(
              eq(companyRoleAssignments.workspaceId, actor.workspaceId),
              this.includeRevokedAssignmentsInAdministration
                ? undefined
                : isNull(companyRoleAssignments.revokedAt),
            ),
          )
          .orderBy(
            asc(companyRoleAssignments.workspaceMembershipId),
            asc(companyRoleAssignments.companyId),
            asc(companyRoleAssignments.bundle),
          );

        return {
          members,
          companies: activeCompanies,
          assignments: assignments.map((assignment) =>
            assignmentRecord(assignment, assignment.revokedAt === null),
          ),
        };
      },
      {
        isolationLevel: 'repeatable read',
        accessMode: 'read only',
      },
    );
  }

  async executeAssignment(
    actor: ActorContext,
    command: CompanyRoleAssignmentCommand,
  ): Promise<CompanyContextAssignmentRecord> {
    return this.databaseContext.transaction(async () => {
      const {
        bundle,
        operation,
        workspaceMembershipId: workspaceMembershipIdValue,
        companyId: companyIdValue,
        idempotencyKey: idempotencyKeyValue,
      } = command;

      requireWorkspacePermission(actor, 'company.assignment.manage');
      const workspaceMembershipId = parseWorkspaceMembershipId(
        requireUuid(workspaceMembershipIdValue),
      );
      const companyId = parseCompanyId(requireUuid(companyIdValue));
      const assignmentTarget: CompanyAssignmentTarget = {
        workspaceId: actor.workspaceId,
        workspaceMembershipId,
        companyId,
      };
      const idempotencyKey = requireIdempotencyKey(idempotencyKeyValue);

      const replay = await this.findCommand(actor, idempotencyKey);
      if (replay) {
        assertSameCommand(replay, bundle, operation, assignmentTarget);
        return this.commandResult(replay, bundle);
      }
      // Preserve administration's per-target serialization independently of
      // the shared eligibility locks consumed by business commands. In
      // particular, a revoke cannot remove a conflicting grant between its
      // INSERT and the active-assignment resolution below.
      const targetLock = JSON.stringify([
        'company.assignment.target',
        actor.workspaceId,
        workspaceMembershipId,
        companyId,
      ]);
      await this.databaseContext.connection.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${targetLock}, 0))`,
      );
      const target = await this.requireActiveTargets(assignmentTarget);
      const [reserved] = await this.databaseContext.connection
        .insert(companyContextAssignmentCommands)
        .values({
          workspaceId: actor.workspaceId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          bundle: bundle,
          idempotencyKey,
          operation,
          targetWorkspaceMembershipId: workspaceMembershipId,
          companyId,
        })
        .onConflictDoNothing()
        .returning();
      if (!reserved) {
        const raced = await this.findCommand(actor, idempotencyKey);
        if (!raced)
          throw new Error('The idempotent command could not be resolved.');
        assertSameCommand(raced, bundle, operation, assignmentTarget);
        return this.commandResult(raced, bundle);
      }
      const assignment =
        operation === 'grant'
          ? await this.applyGrant(assignmentTarget, bundle)
          : await this.applyRevoke(assignmentTarget, bundle);
      await this.databaseContext.connection
        .update(companyContextAssignmentCommands)
        .set({ resultAssignmentId: assignment.id })
        .where(eq(companyContextAssignmentCommands.id, reserved.id));
      if (assignment.changed) {
        await this.accountability.record({
          actor,
          action: companyRoleAssignmentAction(bundle, operation),
          target: {
            type: 'company_role_assignment',
            assignmentId: assignment.id,
            companyId,
            workspaceMembershipId,
            internalUserId: target.internalUserId,
          },
          metadata: { bundle: COMPANY_ROLE_BUNDLES[bundle].label },
          transitionId: reserved.id,
        });
      }
      return assignmentRecord(assignment, operation === 'grant');
    });
  }

  private async requireActiveTargets({
    workspaceId,
    workspaceMembershipId,
    companyId,
  }: CompanyAssignmentTarget): Promise<{ internalUserId: string }> {
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
      // These rows are eligibility, not mutation targets. Shared locks still
      // block suspension/deactivation without deadlocking an authorized
      // command that already holds its assignment and then locks membership.
      // The administration target lock above serializes grants and revokes.
      .for('share')
      .limit(1);
    if (!target) throw new ForbiddenException();
    return target;
  }

  private async applyGrant(target: CompanyAssignmentTarget, bundle: Bundle) {
    const { workspaceId, workspaceMembershipId, companyId } = target;
    const active = await this.findActiveAssignment(target, bundle);
    if (active) return { ...active, changed: false };

    const [changed] = await this.databaseContext.connection
      .insert(companyRoleAssignments)
      .values({
        workspaceId,
        workspaceMembershipId,
        companyId,
        bundle: bundle,
        permissionSetVersion: companyRoleGrantVersion(bundle),
      })
      .onConflictDoNothing({
        target: [
          companyRoleAssignments.workspaceId,
          companyRoleAssignments.companyId,
          companyRoleAssignments.workspaceMembershipId,
          companyRoleAssignments.bundle,
        ],
        where: isNull(companyRoleAssignments.revokedAt),
      })
      .returning();
    if (changed) return { ...changed, changed: true };
    const raced = await this.findActiveAssignment(target, bundle);
    if (!raced) throw new Error('The fresh assignment could not be resolved.');
    return { ...raced, changed: false };
  }

  private async applyRevoke(target: CompanyAssignmentTarget, bundle: Bundle) {
    const { workspaceId, workspaceMembershipId, companyId } = target;
    const [changed] = await this.databaseContext.connection
      .update(companyRoleAssignments)
      .set({ revokedAt: sql`now()`, updatedAt: sql`now()` })
      .where(
        and(
          eq(companyRoleAssignments.workspaceId, workspaceId),
          eq(
            companyRoleAssignments.workspaceMembershipId,
            workspaceMembershipId,
          ),
          eq(companyRoleAssignments.companyId, companyId),
          eq(companyRoleAssignments.bundle, bundle),
          isNull(companyRoleAssignments.revokedAt),
        ),
      )
      .returning();
    const assignment =
      changed ?? (await this.findLatestAssignment(target, bundle));
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

  private async findActiveAssignment(
    target: CompanyAssignmentTarget,
    bundle: Bundle,
  ) {
    const { workspaceId, workspaceMembershipId, companyId } = target;
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
          eq(companyRoleAssignments.bundle, bundle),
          isNull(companyRoleAssignments.revokedAt),
        ),
      )
      .limit(1);
    return assignment;
  }

  private async findLatestAssignment(
    target: CompanyAssignmentTarget,
    bundle: Bundle,
  ) {
    const { workspaceId, workspaceMembershipId, companyId } = target;
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
          eq(companyRoleAssignments.bundle, bundle),
        ),
      )
      .orderBy(
        desc(companyRoleAssignments.createdAt),
        desc(companyRoleAssignments.id),
      )
      .limit(1);
    return assignment;
  }

  private async commandResult(
    command: CommandRow,
    bundle: Bundle,
  ): Promise<CompanyContextAssignmentRecord> {
    if (!command.resultAssignmentId)
      throw new Error('The idempotent command is incomplete.');
    const [assignment] = await this.databaseContext.connection
      .select()
      .from(companyRoleAssignments)
      .where(
        and(
          eq(companyRoleAssignments.workspaceId, command.workspaceId),
          eq(companyRoleAssignments.id, command.resultAssignmentId),
          eq(companyRoleAssignments.bundle, bundle),
        ),
      )
      .limit(1);
    if (!assignment)
      throw new Error('The idempotent assignment result is unavailable.');
    return assignmentRecord(assignment, command.operation === 'grant');
  }
}

function assertSameCommand(
  command: CommandRow,
  bundle: Bundle,
  operation: Operation,
  target: CompanyAssignmentTarget,
): void {
  if (
    command.bundle !== bundle ||
    command.operation !== operation ||
    command.targetWorkspaceMembershipId !== target.workspaceMembershipId ||
    command.companyId !== target.companyId
  ) {
    throw new BadRequestException(
      'Idempotency-Key was already used for another command.',
    );
  }
  if (!command.resultAssignmentId)
    throw new Error('The idempotent command is incomplete.');
}
