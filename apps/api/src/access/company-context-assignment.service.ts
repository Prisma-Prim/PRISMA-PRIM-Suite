import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { AccountabilityService } from '../accountability/accountability.service.js';
import {
  COMPANY_CONTEXT_ASSIGNMENT_GRANTED_ACTION,
  COMPANY_CONTEXT_ASSIGNMENT_REVOKED_ACTION,
  COMPANY_DIRECTOR_CLIENT_ASSIGNMENT_GRANTED_ACTION,
  COMPANY_DIRECTOR_CLIENT_ASSIGNMENT_REVOKED_ACTION,
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
import {
  COMPANY_CONTEXT_ACCESS_BUNDLE,
  COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL,
  COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE,
  COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL,
} from './company-permissions.js';
import type {
  CompanyAccessAdministrationState,
  CompanyAssignmentBundleLabel,
  CompanyContextAssignmentRecord,
  GrantCompanyContextAssignmentCommand,
} from './company-context-assignment.types.js';

type Operation = 'grant' | 'revoke';
type CommandRow = typeof companyContextAssignmentCommands.$inferSelect;
type Bundle = typeof companyRoleAssignments.$inferSelect.bundle;
type BundleDefinition = {
  value: Bundle;
  label:
    | typeof COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL
    | typeof COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL;
};

const CONTEXT_BUNDLE: BundleDefinition = {
  value: COMPANY_CONTEXT_ACCESS_BUNDLE,
  label: COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL,
};
const DIRECTOR_CLIENT_BUNDLE: BundleDefinition = {
  value: COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE,
  label: COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL,
};
const ADMINISTRABLE_BUNDLES = [
  COMPANY_CONTEXT_ACCESS_BUNDLE,
  COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE,
] as const;

@Injectable()
export class CompanyContextAssignmentService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly accountability: AccountabilityService,
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
              isNull(companyRoleAssignments.revokedAt),
              inArray(companyRoleAssignments.bundle, ADMINISTRABLE_BUNDLES),
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
          assignments: assignments.map((assignment) => ({
            ...assignment,
            bundle: assignmentBundleLabel(assignment.bundle),
            active: true,
          })),
        };
      },
      {
        isolationLevel: 'repeatable read',
        accessMode: 'read only',
      },
    );
  }

  async grant(
    actor: ActorContext,
    command: GrantCompanyContextAssignmentCommand,
  ): Promise<CompanyContextAssignmentRecord> {
    return this.mutate(
      actor,
      CONTEXT_BUNDLE,
      'grant',
      command.workspaceMembershipId,
      command.companyId,
      command.idempotencyKey,
    );
  }

  async grantDirectorClientAccess(
    actor: ActorContext,
    command: GrantCompanyContextAssignmentCommand,
  ): Promise<CompanyContextAssignmentRecord> {
    return this.mutate(
      actor,
      DIRECTOR_CLIENT_BUNDLE,
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
      CONTEXT_BUNDLE,
      'revoke',
      workspaceMembershipIdValue,
      companyIdValue,
      idempotencyKey,
    );
  }

  async revokeDirectorClientAccess(
    actor: ActorContext,
    workspaceMembershipIdValue: unknown,
    companyIdValue: unknown,
    idempotencyKey: string | undefined,
  ): Promise<CompanyContextAssignmentRecord> {
    return this.mutate(
      actor,
      DIRECTOR_CLIENT_BUNDLE,
      'revoke',
      workspaceMembershipIdValue,
      companyIdValue,
      idempotencyKey,
    );
  }

  private async mutate(
    actor: ActorContext,
    bundle: BundleDefinition,
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
        assertSameCommand(
          replay,
          bundle.value,
          operation,
          workspaceMembershipId,
          companyId,
        );
        return commandResult(replay, bundle.label);
      }
      const target = await this.requireActiveTargets(
        actor.workspaceId,
        workspaceMembershipId,
        companyId,
      );
      const [reserved] = await this.databaseContext.connection
        .insert(companyContextAssignmentCommands)
        .values({
          workspaceId: actor.workspaceId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          bundle: bundle.value,
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
        assertSameCommand(
          raced,
          bundle.value,
          operation,
          workspaceMembershipId,
          companyId,
        );
        return commandResult(raced, bundle.label);
      }
      const assignment =
        operation === 'grant'
          ? await this.applyGrant(
              actor.workspaceId,
              workspaceMembershipId,
              companyId,
              bundle.value,
            )
          : await this.applyRevoke(
              actor.workspaceId,
              workspaceMembershipId,
              companyId,
              bundle.value,
            );
      await this.databaseContext.connection
        .update(companyContextAssignmentCommands)
        .set({ resultAssignmentId: assignment.id })
        .where(eq(companyContextAssignmentCommands.id, reserved.id));
      if (assignment.changed) {
        await this.accountability.record({
          actor,
          action:
            bundle.value === COMPANY_CONTEXT_ACCESS_BUNDLE
              ? operation === 'grant'
                ? COMPANY_CONTEXT_ASSIGNMENT_GRANTED_ACTION
                : COMPANY_CONTEXT_ASSIGNMENT_REVOKED_ACTION
              : operation === 'grant'
                ? COMPANY_DIRECTOR_CLIENT_ASSIGNMENT_GRANTED_ACTION
                : COMPANY_DIRECTOR_CLIENT_ASSIGNMENT_REVOKED_ACTION,
          target: {
            type: 'company_role_assignment',
            assignmentId: assignment.id,
            companyId,
            workspaceMembershipId,
            internalUserId: target.internalUserId,
          },
          metadata: { bundle: bundle.label },
          transitionId: reserved.id,
        });
      }
      return {
        id: assignment.id,
        workspaceMembershipId,
        companyId,
        bundle: bundle.label,
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
      .for('update')
      .limit(1);
    if (!target) throw new ForbiddenException();
    return target;
  }

  private async applyGrant(
    workspaceId: string,
    workspaceMembershipId: string,
    companyId: string,
    bundle: Bundle,
  ) {
    const [changed] = await this.databaseContext.connection
      .insert(companyRoleAssignments)
      .values({
        workspaceId,
        workspaceMembershipId,
        companyId,
        bundle,
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
        workspaceId,
        workspaceMembershipId,
        companyId,
        bundle,
      ));
    if (!assignment)
      throw new Error('The canonical assignment could not be resolved.');
    return { ...assignment, changed: Boolean(changed) };
  }

  private async applyRevoke(
    workspaceId: string,
    workspaceMembershipId: string,
    companyId: string,
    bundle: Bundle,
  ) {
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
      changed ??
      (await this.findAssignment(
        workspaceId,
        workspaceMembershipId,
        companyId,
        bundle,
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
    bundle: Bundle,
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
          eq(companyRoleAssignments.bundle, bundle),
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
  return value.toLowerCase();
}

function requireIdempotencyKey(value: string | undefined): string {
  if (!value?.trim())
    throw new BadRequestException('Idempotency-Key header is required.');
  return value.trim();
}

function assignmentBundleLabel(bundle: Bundle): CompanyAssignmentBundleLabel {
  switch (bundle) {
    case COMPANY_CONTEXT_ACCESS_BUNDLE:
      return COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL;
    case COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE:
      return COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL;
  }
}

function assertSameCommand(
  command: CommandRow,
  bundle: Bundle,
  operation: Operation,
  workspaceMembershipId: string,
  companyId: string,
): void {
  if (
    command.bundle !== bundle ||
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

function commandResult(
  command: CommandRow,
  bundleLabel:
    | typeof COMPANY_CONTEXT_ACCESS_BUNDLE_LABEL
    | typeof COMPANY_DIRECTOR_CLIENT_ACCESS_BUNDLE_LABEL,
): CompanyContextAssignmentRecord {
  if (!command.resultAssignmentId)
    throw new Error('The idempotent command is incomplete.');
  return {
    id: command.resultAssignmentId,
    workspaceMembershipId: command.targetWorkspaceMembershipId,
    companyId: command.companyId,
    bundle: bundleLabel,
    active: command.operation === 'grant',
  };
}
