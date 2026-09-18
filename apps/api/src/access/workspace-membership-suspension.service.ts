import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { WORKSPACE_MEMBERSHIP_SUSPENDED_ACTION } from '../accountability/accountability.types.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  internalUsers,
  workspaces,
  workspaceMemberships,
  workspaceMembershipSuspensionCommands,
  workspacePermissionGrants,
} from '../database/schema/index.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from './access-command-validation.js';
import { requireWorkspacePermission } from './access-policy.js';
import type { ActorContext } from './access.types.js';
import type {
  SuspendWorkspaceMembershipCommand,
  WorkspaceMembershipSuspensionRecord,
} from './workspace-membership-suspension.types.js';

import { WorkspaceSessionRevocationService } from './workspace-session-revocation.service.js';

type CommandRow = typeof workspaceMembershipSuspensionCommands.$inferSelect;

@Injectable()
export class WorkspaceMembershipSuspensionService {
  constructor(
    private readonly databaseContext: DatabaseContext,
    private readonly accountability: AccountabilityService,
    private readonly revocations: WorkspaceSessionRevocationService,
  ) {}

  async suspend(
    actor: ActorContext,
    command: SuspendWorkspaceMembershipCommand,
  ): Promise<WorkspaceMembershipSuspensionRecord> {
    requireWorkspacePermission(actor, 'company.assignment.manage');
    const workspaceMembershipId = requireUuid(command.workspaceMembershipId);
    const idempotencyKey = requireIdempotencyKey(command.idempotencyKey);

    const result = await this.databaseContext.transaction(async () => {
      await this.lockWorkspace(actor.workspaceId);
      await this.requireLiveAccessAdministrationAuthorityHolder(actor);

      const replay = await this.findCommand(actor, idempotencyKey);
      if (replay) {
        assertSameSuspension(replay, workspaceMembershipId);
        return { record: commandResult(replay), newlyCommitted: false };
      }

      const target = await this.requireActiveTarget(
        actor.workspaceId,
        workspaceMembershipId,
      );
      await this.requireAnotherAccessAdministrationAuthorityHolderIfTargetHoldsAuthority(
        actor.workspaceId,
        workspaceMembershipId,
      );

      const [reserved] = await this.databaseContext.connection
        .insert(workspaceMembershipSuspensionCommands)
        .values({
          workspaceId: actor.workspaceId,
          actorWorkspaceMembershipId: actor.workspaceMembershipId,
          idempotencyKey,
          targetWorkspaceMembershipId: workspaceMembershipId,
        })
        .onConflictDoNothing()
        .returning();
      if (!reserved) {
        const raced = await this.findCommand(actor, idempotencyKey);
        if (!raced)
          throw new Error('The idempotent suspension could not be resolved.');
        assertSameSuspension(raced, workspaceMembershipId);
        return { record: commandResult(raced), newlyCommitted: false };
      }

      const [suspended] = await this.databaseContext.connection
        .update(workspaceMemberships)
        .set({ status: 'inactive', updatedAt: sql`now()` })
        .where(
          and(
            eq(workspaceMemberships.workspaceId, actor.workspaceId),
            eq(workspaceMemberships.id, workspaceMembershipId),
            eq(workspaceMemberships.status, 'active'),
          ),
        )
        .returning({ id: workspaceMemberships.id });
      if (!suspended)
        throw new Error('The active Workspace Membership was not suspended.');

      await this.accountability.record({
        actor,
        action: WORKSPACE_MEMBERSHIP_SUSPENDED_ACTION,
        target: {
          type: 'workspace_membership',
          workspaceMembershipId,
          internalUserId: target.internalUserId,
        },
        metadata: {},
        transitionId: reserved.id,
      });

      return { record: commandResult(reserved), newlyCommitted: true };
    });
    if (result.newlyCommitted) {
      await this.revocations.afterSuspension(
        actor,
        result.record.workspaceMembershipId,
      );
    }
    return result.record;
  }

  private async lockWorkspace(workspaceId: string): Promise<void> {
    const [workspace] = await this.databaseContext.connection
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, workspaceId))
      .for('update')
      .limit(1);
    if (!workspace) throw new ForbiddenException();
  }

  private async requireLiveAccessAdministrationAuthorityHolder(
    actor: ActorContext,
  ): Promise<void> {
    const [liveActor] = await this.databaseContext.connection
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
    if (!liveActor) throw new ForbiddenException();
  }

  private async requireActiveTarget(
    workspaceId: string,
    workspaceMembershipId: string,
  ): Promise<{ internalUserId: string }> {
    const [target] = await this.databaseContext.connection
      .select({ internalUserId: workspaceMemberships.internalUserId })
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
          eq(workspaceMemberships.workspaceId, workspaceId),
          eq(workspaceMemberships.id, workspaceMembershipId),
          eq(workspaceMemberships.status, 'active'),
        ),
      )
      .for('update')
      .limit(1);
    if (!target) throw new ForbiddenException();
    return target;
  }

  private async requireAnotherAccessAdministrationAuthorityHolderIfTargetHoldsAuthority(
    workspaceId: string,
    workspaceMembershipId: string,
  ): Promise<void> {
    const [targetGrant] = await this.databaseContext.connection
      .select({ id: workspacePermissionGrants.id })
      .from(workspacePermissionGrants)
      .where(
        and(
          eq(workspacePermissionGrants.workspaceId, workspaceId),
          eq(
            workspacePermissionGrants.workspaceMembershipId,
            workspaceMembershipId,
          ),
          eq(workspacePermissionGrants.permission, 'company.assignment.manage'),
        ),
      )
      .limit(1);
    if (!targetGrant) return;

    const [holders] = await this.databaseContext.connection
      .select({ count: sql<number>`count(*)::integer` })
      .from(workspacePermissionGrants)
      .innerJoin(
        workspaceMemberships,
        and(
          eq(
            workspaceMemberships.workspaceId,
            workspacePermissionGrants.workspaceId,
          ),
          eq(
            workspaceMemberships.id,
            workspacePermissionGrants.workspaceMembershipId,
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
      .where(
        and(
          eq(workspacePermissionGrants.workspaceId, workspaceId),
          eq(workspacePermissionGrants.permission, 'company.assignment.manage'),
        ),
      );
    if (!holders || holders.count <= 1) throw new ForbiddenException();
  }

  private async findCommand(actor: ActorContext, idempotencyKey: string) {
    const [command] = await this.databaseContext.connection
      .select()
      .from(workspaceMembershipSuspensionCommands)
      .where(
        and(
          eq(
            workspaceMembershipSuspensionCommands.workspaceId,
            actor.workspaceId,
          ),
          eq(
            workspaceMembershipSuspensionCommands.actorWorkspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(
            workspaceMembershipSuspensionCommands.idempotencyKey,
            idempotencyKey,
          ),
        ),
      )
      .limit(1);
    return command;
  }
}

function assertSameSuspension(
  command: CommandRow,
  workspaceMembershipId: string,
): void {
  if (command.targetWorkspaceMembershipId !== workspaceMembershipId) {
    throw new BadRequestException(
      'Idempotency-Key was already used for another suspension.',
    );
  }
}

function commandResult(
  command: CommandRow,
): WorkspaceMembershipSuspensionRecord {
  return {
    workspaceMembershipId: command.targetWorkspaceMembershipId,
    status: 'inactive',
  };
}
