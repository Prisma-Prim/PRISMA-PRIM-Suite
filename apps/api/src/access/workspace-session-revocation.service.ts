import { randomUUID } from 'node:crypto';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  internalUsers,
  workspaces,
  workspaceMemberships,
  workspaceMembershipSuspensionCommands,
  workspacePermissionGrants,
} from '../database/schema/index.js';
import { requireUuid } from './access-command-validation.js';
import { requireWorkspacePermission } from './access-policy.js';
import type { ActorContext } from './access.types.js';
import {
  IDENTITY_SESSION_REVOKER,
  type IdentitySessionRevoker,
  type SessionRevocationOutcome,
} from './identity-session-revoker.js';

const commands = workspaceMembershipSuspensionCommands;
type CommandRow = typeof commands.$inferSelect;

@Injectable()
export class WorkspaceSessionRevocationService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly accountability: AccountabilityService,
    @Inject(IDENTITY_SESSION_REVOKER)
    private readonly provider: IdentitySessionRevoker,
  ) {}

  async list(actor: ActorContext, after?: string) {
    requireWorkspacePermission(actor, 'company.assignment.manage');
    const cursor = after === undefined ? undefined : requireUuid(after);
    return this.database.transaction(async () => {
      await this.lockWorkspace(actor.workspaceId);
      await this.requireLiveAdministrator(actor);
      const rows = await this.database.connection
        .select({
          id: commands.id,
          workspaceMembershipId: commands.targetWorkspaceMembershipId,
          displayName: internalUsers.displayName,
          status: commands.sessionRevocationStatus,
          attemptedAt: commands.sessionRevocationAttemptedAt,
        })
        .from(commands)
        .innerJoin(
          workspaceMemberships,
          and(
            eq(workspaceMemberships.id, commands.targetWorkspaceMembershipId),
            eq(workspaceMemberships.workspaceId, commands.workspaceId),
            eq(workspaceMemberships.status, 'inactive'),
          ),
        )
        .innerJoin(
          internalUsers,
          eq(internalUsers.id, workspaceMemberships.internalUserId),
        )
        .where(
          and(
            eq(commands.workspaceId, actor.workspaceId),
            cursor ? gt(commands.id, cursor) : undefined,
          ),
        )
        .orderBy(asc(commands.id))
        .limit(51);
      const page = rows.slice(0, 50);
      return {
        records: page.map((row) => ({
          workspaceMembershipId: row.workspaceMembershipId,
          displayName: row.displayName,
          status: visibleStatus(row.status, row.attemptedAt),
        })),
        nextCursor: rows.length > 50 ? (page.at(-1)?.id ?? null) : null,
      };
    });
  }

  async retry(actor: ActorContext, membershipId: unknown): Promise<void> {
    requireWorkspacePermission(actor, 'company.assignment.manage');
    await this.run(actor, requireUuid(membershipId), false);
  }

  /** Called only after the originating suspension transaction has committed. */
  async afterSuspension(
    actor: ActorContext,
    membershipId: string,
  ): Promise<void> {
    // A provider or outcome-persistence failure cannot change the already
    // committed suspension response. The durable pending/lease state is retriable.
    try {
      await this.run(actor, membershipId, true);
    } catch {
      /* Report through durable status, never provider payloads. */
    }
  }

  private async run(
    actor: ActorContext,
    membershipId: string,
    committedSuspension: boolean,
  ): Promise<void> {
    const claim = await this.database.transaction(async () => {
      await this.lockWorkspace(actor.workspaceId);
      if (!committedSuspension) await this.requireLiveAdministrator(actor);
      const [row] = await this.database.connection
        .select({ command: commands, user: internalUsers })
        .from(commands)
        .innerJoin(
          workspaceMemberships,
          and(
            eq(workspaceMemberships.workspaceId, commands.workspaceId),
            eq(workspaceMemberships.id, commands.targetWorkspaceMembershipId),
            eq(workspaceMemberships.status, 'inactive'),
          ),
        )
        .innerJoin(
          internalUsers,
          eq(internalUsers.id, workspaceMemberships.internalUserId),
        )
        .where(
          and(
            eq(commands.workspaceId, actor.workspaceId),
            eq(commands.targetWorkspaceMembershipId, membershipId),
            committedSuspension
              ? eq(
                  commands.actorWorkspaceMembershipId,
                  actor.workspaceMembershipId,
                )
              : undefined,
          ),
        )
        .orderBy(asc(commands.createdAt), asc(commands.id))
        .limit(1);
      if (!row) throw new ForbiddenException();
      if (row.command.sessionRevocationStatus === 'complete') return null;
      // A 30-second lease also bounds manual retry frequency after failures.
      if (
        row.command.sessionRevocationAttemptedAt &&
        Date.now() - row.command.sessionRevocationAttemptedAt.getTime() < 30_000
      )
        return null;
      const attemptId = randomUUID();
      await this.database.connection
        .update(commands)
        .set({
          sessionRevocationStatus: 'running',
          sessionRevocationAttemptId: attemptId,
          sessionRevocationAttemptedAt: sql`now()`,
        })
        .where(eq(commands.id, row.command.id));
      return {
        commandId: row.command.id,
        attemptId,
        internalUserId: row.user.id,
        identity: {
          provider: row.user.externalProvider,
          subject: row.user.externalSubject,
        },
      };
    });
    if (!claim) return;
    let outcome: SessionRevocationOutcome;
    try {
      outcome = await this.provider.revoke(claim.identity);
    } catch {
      outcome = { status: 'retry_required' };
    }
    await this.database.transaction(async () => {
      // Claims and outcomes take locks in the same order. This prevents a
      // retry from replacing a completed attempt or deadlocking its audit insert.
      await this.lockWorkspace(actor.workspaceId);
      const [updated] = await this.database.connection
        .update(commands)
        .set({ sessionRevocationStatus: outcome.status })
        .where(
          and(
            eq(commands.workspaceId, actor.workspaceId),
            eq(commands.id, claim.commandId),
            eq(commands.sessionRevocationStatus, 'running'),
            eq(commands.sessionRevocationAttemptId, claim.attemptId),
          ),
        )
        .returning({ id: commands.id });
      if (!updated) return;
      await this.accountability.record({
        actor,
        action:
          outcome.status === 'complete'
            ? 'workspace_sessions.revoked'
            : 'workspace_sessions.revocation_retry_required',
        target: {
          type: 'workspace_membership',
          workspaceMembershipId: membershipId,
          internalUserId: claim.internalUserId,
        },
        metadata: {},
        transitionId:
          outcome.status === 'complete' ? claim.commandId : claim.attemptId,
      });
    });
  }

  private async lockWorkspace(workspaceId: string) {
    const [workspace] = await this.database.connection
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .for('update');
    if (!workspace) throw new ForbiddenException();
  }

  private async requireLiveAdministrator(actor: ActorContext) {
    const [member] = await this.database.connection
      .select({ id: workspaceMemberships.id })
      .from(workspaceMemberships)
      .innerJoin(
        internalUsers,
        and(
          eq(internalUsers.id, workspaceMemberships.internalUserId),
          eq(internalUsers.status, 'active'),
        ),
      )
      .innerJoin(
        workspacePermissionGrants,
        and(
          eq(
            workspacePermissionGrants.workspaceId,
            workspaceMemberships.workspaceId,
          ),
          eq(
            workspacePermissionGrants.workspaceMembershipId,
            workspaceMemberships.id,
          ),
          eq(workspacePermissionGrants.permission, 'company.assignment.manage'),
        ),
      )
      .where(
        and(
          eq(workspaceMemberships.workspaceId, actor.workspaceId),
          eq(workspaceMemberships.id, actor.workspaceMembershipId),
          eq(workspaceMemberships.internalUserId, actor.internalUserId),
          eq(workspaceMemberships.status, 'active'),
        ),
      )
      .limit(1);
    if (!member) throw new ForbiddenException();
  }
}

function visibleStatus(
  status: CommandRow['sessionRevocationStatus'],
  attemptedAt: Date | null,
): CommandRow['sessionRevocationStatus'] {
  return status === 'running' &&
    attemptedAt &&
    Date.now() - attemptedAt.getTime() >= 30_000
    ? 'retry_required'
    : status;
}
