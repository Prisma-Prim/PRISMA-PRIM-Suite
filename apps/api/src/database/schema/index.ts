import {
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const internalUserStatus = pgEnum('internal_user_status', [
  'active',
  'inactive',
]);

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    singletonKey: text('singleton_key').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('workspaces_singleton_key_unique').on(table.singletonKey),
  ],
);

export const internalUsers = pgTable(
  'internal_users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    externalProvider: text('external_provider').notNull(),
    externalSubject: text('external_subject').notNull(),
    displayName: text('display_name').notNull(),
    email: text('email').notNull(),
    status: internalUserStatus('status').default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('internal_users_external_identity_unique').on(
      table.externalProvider,
      table.externalSubject,
    ),
  ],
);

export const activityLogAction = pgEnum('activity_log_action', [
  'internal_user.provisioned',
]);

export const activityLogTargetType = pgEnum('activity_log_target_type', [
  'internal_user',
]);

export const activityLogEvents = pgTable(
  'activity_log_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    actorInternalUserId: uuid('actor_internal_user_id')
      .notNull()
      .references(() => internalUsers.id),
    action: activityLogAction('action').notNull(),
    targetType: activityLogTargetType('target_type').notNull(),
    targetInternalUserId: uuid('target_internal_user_id')
      .notNull()
      .references(() => internalUsers.id),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    metadata: jsonb('metadata').$type<{ identityProvider: string }>().notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
  },
  (table) => [
    uniqueIndex('activity_log_events_idempotency_key_unique').on(
      table.idempotencyKey,
    ),
  ],
);
