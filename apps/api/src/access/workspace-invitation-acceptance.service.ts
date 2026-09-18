import {
  ForbiddenException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, eq, gt, or, sql } from 'drizzle-orm';
import { AccountabilityService } from '../accountability/accountability.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  internalUsers,
  workspaceInvitations,
  workspaceInvitationAcceptances,
  workspaceInvitationProofs,
  workspaceMemberships,
  workspaces,
} from '../database/schema/index.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from './access-command-validation.js';
import type { ActorContext, ExternalPrincipal } from './access.types.js';
import {
  INVITATION_ACCEPTANCE_PROVIDER,
  type InvitationAcceptanceProvider,
} from './workspace-invitation-acceptance-provider.js';

@Injectable()
export class WorkspaceInvitationAcceptanceService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly accountability: AccountabilityService,
    @Inject(INVITATION_ACCEPTANCE_PROVIDER)
    private readonly provider: InvitationAcceptanceProvider,
  ) {}

  async accept(input: {
    principal: ExternalPrincipal;
    body: unknown;
    key: string | undefined;
  }) {
    const command = acceptanceCommand(input.body, input.key);
    const initial = await this.database.transaction(() =>
      this.inspectIntent(input.principal, command),
    );
    if (initial.kind === 'replay') return acceptanceResult(initial.acceptance);
    const { invitation } = initial;
    const request = {
      principal: input.principal,
      invitation: {
        reference: invitation.id,
        providerId: invitation.providerId,
        email: invitation.email,
      },
      ...(command.ticket ? { ticket: command.ticket } : {}),
    };
    let context = await this.proofContext(invitation.id);
    let proof = await this.provider.prove({
      ...request,
      ...(context ? { context } : {}),
    });
    if (proof.kind === 'needs-client') {
      const prepared = await this.provider.prepare(invitation.id);
      if (!prepared)
        throw new ServiceUnavailableException(
          'Invitation verification is temporarily unavailable.',
        );
      const reservation = await this.database.transaction(async () => {
        const current = await this.inspectIntent(input.principal, command);
        if (current.kind === 'replay') return current;
        await this.database.connection
          .insert(workspaceInvitationProofs)
          .values({ invitationId: invitation.id, ...prepared })
          .onConflictDoNothing();
        return {
          kind: 'prepared',
          context: await this.proofContext(invitation.id),
        } as const;
      });
      if (reservation.kind === 'replay')
        return acceptanceResult(reservation.acceptance);
      context = reservation.context;
      if (!context)
        throw new ServiceUnavailableException(
          'Invitation verification is temporarily unavailable.',
        );
      proof = await this.provider.prove({ ...request, context });
    }
    if (proof.kind === 'unavailable' || proof.kind === 'needs-client')
      throw new ServiceUnavailableException(
        'Invitation verification is temporarily unavailable.',
      );
    if (
      proof.kind !== 'verified' ||
      proof.provider !== input.principal.provider ||
      proof.subject !== input.principal.subject ||
      proof.reference !== invitation.id ||
      (invitation.providerId !== null &&
        invitation.providerId !== proof.providerId)
    )
      throw new ForbiddenException();

    return this.database.transaction(async () => {
      const db = this.database.connection;
      const current = await this.inspectIntent(input.principal, command);
      if (current.kind === 'replay')
        return acceptanceResult(current.acceptance);
      const { invitation: live, workspace } = current;
      if (live.providerId !== null && live.providerId !== proof.providerId)
        throw new ForbiddenException();
      let [user] = await db
        .select()
        .from(internalUsers)
        .where(
          and(
            eq(internalUsers.externalProvider, input.principal.provider),
            eq(internalUsers.externalSubject, input.principal.subject),
          ),
        )
        .for('update');
      let created = false;
      if (!user) {
        const [inserted] = await db
          .insert(internalUsers)
          .values({
            externalProvider: input.principal.provider,
            externalSubject: input.principal.subject,
            displayName: input.principal.displayName,
            email: input.principal.email,
          })
          .onConflictDoNothing()
          .returning();
        created = Boolean(inserted);
        [user] = await db
          .select()
          .from(internalUsers)
          .where(
            and(
              eq(internalUsers.externalProvider, input.principal.provider),
              eq(internalUsers.externalSubject, input.principal.subject),
            ),
          )
          .for('update');
      }
      if (!user || user.status !== 'active') throw new ForbiddenException();
      await db
        .insert(workspaceMemberships)
        .values({ workspaceId: workspace.id, internalUserId: user.id })
        .onConflictDoNothing();
      const [membership] = await db
        .select()
        .from(workspaceMemberships)
        .where(
          and(
            eq(workspaceMemberships.workspaceId, workspace.id),
            eq(workspaceMemberships.internalUserId, user.id),
          ),
        )
        .for('update');
      if (!membership || membership.status !== 'active')
        throw new ForbiddenException();
      // Unique-identity contention can wait: decide expiry again after those locks.
      await this.requireEligible(live.id);
      const [acceptance] = await db
        .insert(workspaceInvitationAcceptances)
        .values({
          invitationId: live.id,
          workspaceId: workspace.id,
          internalUserId: user.id,
          workspaceMembershipId: membership.id,
          provider: input.principal.provider,
          subject: input.principal.subject,
          idempotencyKey: command.key,
        })
        .returning();
      if (!acceptance)
        throw new Error('Invitation consumption was not recorded.');
      await db
        .update(workspaceInvitations)
        .set({
          providerId: proof.providerId,
          deliveryStatus: 'accepted',
          syncClaim: null,
        })
        .where(eq(workspaceInvitations.id, live.id));
      const actor: ActorContext = {
        internalUserId: user.id,
        workspaceMembershipId: membership.id,
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        displayName: user.displayName,
        email: user.email,
        active: true,
        workspacePermissions: [],
      };
      if (created)
        await this.accountability.record({
          actor,
          action: 'internal_user.provisioned',
          target: { type: 'internal_user', internalUserId: user.id },
          metadata: { identityProvider: input.principal.provider },
        });
      await this.accountability.record({
        actor,
        action: 'workspace_invitation.accepted',
        target: { type: 'workspace_invitation', invitationId: live.id },
        metadata: {},
      });
      return acceptanceResult(acceptance);
    });
  }

  private async proofContext(invitationId: string) {
    const [context] = await this.database.connection
      .select({
        clientId: workspaceInvitationProofs.clientId,
        sealedToken: workspaceInvitationProofs.sealedToken,
      })
      .from(workspaceInvitationProofs)
      .where(eq(workspaceInvitationProofs.invitationId, invitationId));
    return context;
  }

  private async inspectIntent(
    principal: ExternalPrincipal,
    command: ReturnType<typeof acceptanceCommand>,
  ) {
    const db = this.database.connection;
    // Global key scope also rejects reuse by a different principal or Workspace.
    // All acceptance transactions take this lock before the Workspace lock.
    await db.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${'invitation-acceptance:' + command.key}, 0))`,
    );
    const invitation = await this.findInvitation(command.invitationId);
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, invitation.workspaceId))
      .for('update');
    if (!workspace) throw new ForbiddenException();
    const recorded = await db
      .select()
      .from(workspaceInvitationAcceptances)
      .where(
        or(
          eq(workspaceInvitationAcceptances.invitationId, invitation.id),
          eq(workspaceInvitationAcceptances.idempotencyKey, command.key),
        ),
      );
    if (recorded.length) {
      const acceptance = recorded[0];
      if (
        recorded.length !== 1 ||
        !acceptance ||
        acceptance.invitationId !== invitation.id ||
        acceptance.idempotencyKey !== command.key ||
        acceptance.provider !== principal.provider ||
        acceptance.subject !== principal.subject ||
        acceptance.workspaceId !== workspace.id
      )
        throw new ForbiddenException();
      const [active] = await db
        .select({ id: internalUsers.id })
        .from(internalUsers)
        .innerJoin(
          workspaceMemberships,
          and(
            eq(workspaceMemberships.internalUserId, internalUsers.id),
            eq(workspaceMemberships.id, acceptance.workspaceMembershipId),
            eq(workspaceMemberships.workspaceId, workspace.id),
            eq(workspaceMemberships.status, 'active'),
          ),
        )
        .where(
          and(
            eq(internalUsers.id, acceptance.internalUserId),
            eq(internalUsers.externalProvider, principal.provider),
            eq(internalUsers.externalSubject, principal.subject),
            eq(internalUsers.status, 'active'),
          ),
        )
        .for('update');
      if (!active) throw new ForbiddenException();
      return { kind: 'replay', acceptance } as const;
    }
    const live = await this.requireEligible(invitation.id);
    return { kind: 'unused', invitation: live, workspace } as const;
  }

  private async requireEligible(id: string) {
    const [invitation] = await this.database.connection
      .select()
      .from(workspaceInvitations)
      .where(
        and(
          eq(workspaceInvitations.id, id),
          gt(workspaceInvitations.expiresAt, sql`clock_timestamp()`),
        ),
      );
    if (
      !invitation ||
      invitation.revokedAt ||
      ['revoked', 'expired', 'rejected'].includes(invitation.deliveryStatus)
    )
      throw new ForbiddenException();
    return invitation;
  }

  private async findInvitation(id: string) {
    const [invitation] = await this.database.connection
      .select()
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.id, id))
      .limit(1);
    if (!invitation) throw new ForbiddenException();
    return invitation;
  }
}

function acceptanceResult(
  record: typeof workspaceInvitationAcceptances.$inferSelect,
) {
  return {
    invitationId: record.invitationId,
    workspaceId: record.workspaceId,
    internalUserId: record.internalUserId,
    workspaceMembershipId: record.workspaceMembershipId,
    acceptedAt: record.acceptedAt.toISOString(),
  };
}

function acceptanceCommand(body: unknown, key: string | undefined) {
  try {
    if (
      typeof body !== 'object' ||
      body === null ||
      Array.isArray(body) ||
      !('invitationId' in body) ||
      typeof body.invitationId !== 'string' ||
      Object.keys(body).some(
        (field) => field !== 'invitationId' && field !== 'ticket',
      )
    )
      throw new ForbiddenException();
    const ticket = 'ticket' in body ? body.ticket : undefined;
    if (
      ticket !== undefined &&
      (typeof ticket !== 'string' || !ticket || ticket.length > 16_384)
    )
      throw new ForbiddenException();
    return {
      invitationId: requireUuid(body.invitationId),
      key: requireIdempotencyKey(key),
      ticket,
    };
  } catch {
    throw new ForbiddenException();
  }
}
