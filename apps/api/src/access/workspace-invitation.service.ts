import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  internalUsers,
  workspaceMemberships,
  workspacePermissionGrants,
  workspaces,
  workspaceInvitations,
  workspaceInvitationCommands,
  workspaceInvitationAcceptances,
} from '../database/schema/index.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from './access-command-validation.js';
import type { ActorContext } from './access.types.js';
import {
  WORKSPACE_INVITATION_PROVIDER,
  type WorkspaceInvitationProvider,
  type ProviderInvitationResult,
} from './workspace-invitation-provider.js';

type Invitation = typeof workspaceInvitations.$inferSelect;
const DAY_MS = 86_400_000;
const SYNC_INTERVAL_MS = 30_000;

@Injectable()
export class WorkspaceInvitationService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly accountability: AccountabilityService,
    @Inject(WORKSPACE_INVITATION_PROVIDER)
    private readonly provider: WorkspaceInvitationProvider,
  ) {}

  async issue(
    actor: ActorContext,
    body: { email?: unknown; expiresInDays?: unknown },
    key: string | undefined,
  ) {
    const email = deliveryEmail(body.email);
    const expiresInDays = body.expiresInDays;
    if (
      typeof expiresInDays !== 'number' ||
      !Number.isInteger(expiresInDays) ||
      expiresInDays < 1 ||
      expiresInDays > 30
    )
      throw new BadRequestException('Expiry must be between 1 and 30 days.');
    const idempotencyKey = commandKey(key);
    const reservation = await this.database.transaction(async () => {
      await this.requireOwner(actor);
      const previous = await this.command(actor, idempotencyKey);
      if (previous) {
        const invitation = await this.invitation(actor, previous.invitationId);
        if (
          previous.operation !== 'issue' ||
          invitation.email !== email ||
          invitation.expiresInDays !== expiresInDays
        )
          reusedKey();
        return { invitation, send: false };
      }
      // An uncertain earlier delivery cannot be bypassed using another key.
      const [existing] = await this.database.connection
        .select({ id: workspaceInvitations.id })
        .from(workspaceInvitations)
        .where(
          and(
            eq(workspaceInvitations.workspaceId, actor.workspaceId),
            eq(workspaceInvitations.email, email),
            inArray(workspaceInvitations.deliveryStatus, [
              'uncertain',
              'pending',
            ]),
          ),
        )
        .limit(1);
      if (existing)
        throw new ConflictException(
          'An invitation already requires confirmation or revocation.',
        );
      const now = new Date();
      const [invitation] = await this.database.connection
        .insert(workspaceInvitations)
        .values({
          workspaceId: actor.workspaceId,
          issuedByWorkspaceMembershipId: actor.workspaceMembershipId,
          email,
          expiresInDays,
          expiresAt: new Date(now.getTime() + expiresInDays * DAY_MS),
          syncClaim: randomUUID(),
          syncAfter: new Date(now.getTime() + SYNC_INTERVAL_MS),
        })
        .returning();
      if (!invitation) throw new Error('Invitation reservation failed.');
      await this.recordCommand(actor, idempotencyKey, 'issue', invitation.id);
      await this.accountability.record({
        actor,
        action: 'workspace_invitation.issued',
        target: { type: 'workspace_invitation', invitationId: invitation.id },
        metadata: {},
      });
      return { invitation, send: true };
    });
    // Commit the reservation before any external side effect. Replays only read it.
    if (reservation.send) {
      const result = await this.provider.issue(intent(reservation.invitation));
      await this.saveProviderResult(reservation.invitation, result);
    }
    return this.get(actor, reservation.invitation.id);
  }

  async list(actor: ActorContext, after?: string) {
    const cursor = after === undefined ? undefined : requireUuid(after);
    return this.database.transaction(async () => {
      await this.requireOwner(actor);
      const rows = await this.database.connection
        .select({
          invitation: workspaceInvitations,
          consumedAt: workspaceInvitationAcceptances.acceptedAt,
        })
        .from(workspaceInvitations)
        .leftJoin(
          workspaceInvitationAcceptances,
          eq(
            workspaceInvitationAcceptances.invitationId,
            workspaceInvitations.id,
          ),
        )
        .where(
          and(
            eq(workspaceInvitations.workspaceId, actor.workspaceId),
            cursor ? gt(workspaceInvitations.id, cursor) : undefined,
          ),
        )
        .orderBy(asc(workspaceInvitations.id))
        .limit(51);
      const page = rows.slice(0, 50);
      return {
        invitations: page.map((row) =>
          safeInvitation(row.invitation, row.consumedAt),
        ),
        nextCursor:
          rows.length > 50 ? (page.at(-1)?.invitation.id ?? null) : null,
      };
    });
  }

  async get(actor: ActorContext, id: string) {
    return this.database.transaction(async () => {
      await this.requireOwner(actor);
      const invitation = await this.invitation(actor, id);
      const [consumed] = await this.database.connection
        .select({ acceptedAt: workspaceInvitationAcceptances.acceptedAt })
        .from(workspaceInvitationAcceptances)
        .where(eq(workspaceInvitationAcceptances.invitationId, invitation.id));
      return safeInvitation(invitation, consumed?.acceptedAt ?? null);
    });
  }

  async revoke(actor: ActorContext, id: string, key: string | undefined) {
    const invitationId = requireUuid(id);
    const idempotencyKey = commandKey(key);
    await this.database.transaction(async () => {
      await this.requireOwner(actor);
      const previous = await this.command(actor, idempotencyKey);
      if (previous) {
        if (
          previous.operation !== 'revoke' ||
          previous.invitationId !== invitationId
        )
          reusedKey();
        return;
      }
      const invitation = await this.invitation(actor, invitationId);
      const [consumed] = await this.database.connection
        .select({ id: workspaceInvitationAcceptances.invitationId })
        .from(workspaceInvitationAcceptances)
        .where(eq(workspaceInvitationAcceptances.invitationId, invitation.id));
      if (consumed)
        throw new ConflictException(
          'The Workspace invitation has already been consumed.',
        );
      await this.recordCommand(actor, idempotencyKey, 'revoke', invitation.id);
      if (!invitation.revokedAt) {
        await this.database.connection
          .update(workspaceInvitations)
          .set({
            revokedAt: new Date(),
            ...(!invitation.syncClaim ? { syncAfter: new Date() } : {}),
          })
          .where(eq(workspaceInvitations.id, invitation.id));
        await this.accountability.record({
          actor,
          action: 'workspace_invitation.revoked',
          target: { type: 'workspace_invitation', invitationId: invitation.id },
          metadata: {},
        });
      }
    });
    // Local revocation is durable even if the provider is unavailable.
    return this.refresh(actor, invitationId);
  }

  async refresh(actor: ActorContext, id: string) {
    const invitationId = requireUuid(id);
    const claimed = await this.database.transaction(async () => {
      await this.requireOwner(actor);
      const invitation = await this.invitation(actor, invitationId);
      const [consumed] = await this.database.connection
        .select({ id: workspaceInvitationAcceptances.invitationId })
        .from(workspaceInvitationAcceptances)
        .where(eq(workspaceInvitationAcceptances.invitationId, invitation.id));
      if (
        consumed ||
        invitation.deliveryStatus === 'rejected' ||
        invitation.deliveryStatus === 'revoked' ||
        invitation.deliveryStatus === 'expired' ||
        invitation.syncAfter.getTime() > Date.now()
      )
        return undefined;
      const [claim] = await this.database.connection
        .update(workspaceInvitations)
        .set({
          syncClaim: randomUUID(),
          syncAfter: new Date(Date.now() + SYNC_INTERVAL_MS),
        })
        .where(eq(workspaceInvitations.id, invitation.id))
        .returning();
      return claim;
    });
    if (claimed) {
      const result = claimed.revokedAt
        ? await this.provider.revoke(intent(claimed))
        : await this.provider.inspect(intent(claimed));
      await this.saveProviderResult(claimed, result);
    }
    return this.get(actor, invitationId);
  }

  private async saveProviderResult(
    invitation: Invitation,
    result: ProviderInvitationResult,
  ) {
    if (!invitation.syncClaim) return;
    if (
      result.kind === 'confirmed' &&
      invitation.providerId &&
      result.providerId !== invitation.providerId
    )
      return;
    // A response from an expired claim cannot overwrite a newer reconciliation.
    await this.database.connection
      .update(workspaceInvitations)
      .set({
        syncClaim: null,
        ...(result.kind === 'confirmed'
          ? { deliveryStatus: result.status, providerId: result.providerId }
          : result.kind === 'rejected'
            ? { deliveryStatus: 'rejected' as const }
            : {}),
      })
      .where(
        and(
          eq(workspaceInvitations.id, invitation.id),
          eq(workspaceInvitations.syncClaim, invitation.syncClaim),
        ),
      );
  }

  private async requireOwner(actor: ActorContext) {
    if (!actor.active || !actor.workspacePermissions.includes('member.invite'))
      throw new ForbiddenException();
    await this.database.connection
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, actor.workspaceId))
      .for('update');
    const [live] = await this.database.connection
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
          eq(workspacePermissionGrants.permission, 'member.invite'),
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
    if (!live) throw new ForbiddenException();
  }

  private async invitation(actor: ActorContext, id: string) {
    const [invitation] = await this.database.connection
      .select()
      .from(workspaceInvitations)
      .where(
        and(
          eq(workspaceInvitations.workspaceId, actor.workspaceId),
          eq(workspaceInvitations.id, requireUuid(id)),
        ),
      )
      .limit(1);
    if (!invitation) throw new ForbiddenException();
    return invitation;
  }

  private async command(actor: ActorContext, idempotencyKey: string) {
    const [command] = await this.database.connection
      .select()
      .from(workspaceInvitationCommands)
      .where(
        and(
          eq(workspaceInvitationCommands.workspaceId, actor.workspaceId),
          eq(
            workspaceInvitationCommands.actorWorkspaceMembershipId,
            actor.workspaceMembershipId,
          ),
          eq(workspaceInvitationCommands.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return command;
  }

  private async recordCommand(
    actor: ActorContext,
    idempotencyKey: string,
    operation: 'issue' | 'revoke',
    invitationId: string,
  ) {
    await this.database.connection.insert(workspaceInvitationCommands).values({
      workspaceId: actor.workspaceId,
      actorWorkspaceMembershipId: actor.workspaceMembershipId,
      idempotencyKey,
      operation,
      invitationId,
    });
  }
}

function intent(invitation: Invitation) {
  return {
    reference: invitation.id,
    email: invitation.email,
    expiresInDays: invitation.expiresInDays,
  };
}

function safeInvitation(invitation: Invitation, consumedAt: Date | null) {
  const expired = invitation.expiresAt.getTime() <= Date.now();
  return {
    id: invitation.id,
    email: invitation.email,
    expiresAt: invitation.expiresAt.toISOString(),
    createdAt: invitation.createdAt.toISOString(),
    revokedAt: invitation.revokedAt?.toISOString() ?? null,
    consumedAt: consumedAt?.toISOString() ?? null,
    status: consumedAt
      ? 'accepted'
      : invitation.revokedAt
        ? 'revoked'
        : expired
          ? 'expired'
          : invitation.deliveryStatus,
    deliveryStatus: invitation.deliveryStatus,
    nextCheckAt: invitation.syncAfter.toISOString(),
  };
}

function deliveryEmail(value: unknown): string {
  if (typeof value !== 'string')
    throw new BadRequestException('A recipient email is required.');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email))
    throw new BadRequestException('A valid recipient email is required.');
  return email;
}
function commandKey(value: string | undefined) {
  const key = requireIdempotencyKey(value);
  if (key.length > 200)
    throw new BadRequestException('Idempotency-Key is too long.');
  return key;
}
function reusedKey(): never {
  throw new BadRequestException(
    'Idempotency-Key was already used for another command.',
  );
}
