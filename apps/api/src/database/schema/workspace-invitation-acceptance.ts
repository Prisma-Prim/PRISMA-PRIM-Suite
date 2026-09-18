import { sql } from 'drizzle-orm';
import {
  foreignKey,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { workspaceMemberships } from './core.js';
import { workspaceInvitations } from './workspace-invitation.js';

// Private server-owned Clerk client; never returned by invitation APIs.
// Stored before exchanging a ticket so a lost provider response is recoverable.
export const workspaceInvitationProofs = pgTable(
  'workspace_invitation_proofs',
  {
    invitationId: uuid('invitation_id')
      .primaryKey()
      .references(() => workspaceInvitations.id),
    clientId: text('client_id').notNull().unique(),
    sealedToken: text('sealed_token').notNull(),
  },
);

export const workspaceInvitationAcceptances = pgTable(
  'workspace_invitation_acceptances',
  {
    invitationId: uuid('invitation_id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    internalUserId: uuid('internal_user_id').notNull(),
    workspaceMembershipId: uuid('workspace_membership_id').notNull(),
    provider: text('provider').notNull(),
    subject: text('subject').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true })
      .default(sql`clock_timestamp()`)
      .notNull(),
  },
  (table) => [
    uniqueIndex('workspace_invitation_acceptances_key_unique').on(
      table.idempotencyKey,
    ),
    foreignKey({
      name: 'workspace_invitation_acceptances_invitation_fk',
      columns: [table.workspaceId, table.invitationId],
      foreignColumns: [
        workspaceInvitations.workspaceId,
        workspaceInvitations.id,
      ],
    }),
    foreignKey({
      name: 'workspace_invitation_acceptances_recipient_fk',
      columns: [
        table.workspaceId,
        table.workspaceMembershipId,
        table.internalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
  ],
);
