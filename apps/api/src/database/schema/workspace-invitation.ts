import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { workspaceMemberships } from './core.js';

export const invitationDeliveryStatus = pgEnum('invitation_delivery_status', [
  'uncertain',
  'pending',
  'accepted',
  'revoked',
  'expired',
  'rejected',
]);
export const workspaceInvitations = pgTable(
  'workspace_invitations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    issuedByWorkspaceMembershipId: uuid(
      'issued_by_workspace_membership_id',
    ).notNull(),
    email: text('email').notNull(),
    expiresInDays: integer('expires_in_days').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    deliveryStatus: invitationDeliveryStatus('delivery_status')
      .default('uncertain')
      .notNull(),
    providerId: text('provider_id'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    syncClaim: uuid('sync_claim'),
    syncAfter: timestamp('sync_after', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('workspace_invitations_scope_unique').on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex('workspace_invitations_provider_unique').on(table.providerId),
    index('workspace_invitations_listing').on(table.workspaceId, table.id),
    foreignKey({
      name: 'workspace_invitations_issuer_fk',
      columns: [table.workspaceId, table.issuedByWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'workspace_invitations_expiry_check',
      sql`${table.expiresInDays} BETWEEN 1 AND 30`,
    ),
    check(
      'workspace_invitations_provider_check',
      sql`${table.deliveryStatus} IN ('uncertain', 'rejected') OR ${table.providerId} IS NOT NULL`,
    ),
  ],
);

export const invitationCommandOperation = pgEnum(
  'invitation_command_operation',
  ['issue', 'revoke'],
);
export const workspaceInvitationCommands = pgTable(
  'workspace_invitation_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    operation: invitationCommandOperation('operation').notNull(),
    invitationId: uuid('invitation_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('workspace_invitation_commands_actor_key_unique').on(
      table.workspaceId,
      table.actorWorkspaceMembershipId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: 'workspace_invitation_commands_actor_fk',
      columns: [table.workspaceId, table.actorWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'workspace_invitation_commands_invitation_fk',
      columns: [table.workspaceId, table.invitationId],
      foreignColumns: [
        workspaceInvitations.workspaceId,
        workspaceInvitations.id,
      ],
    }),
  ],
);
