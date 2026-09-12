import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { clientAccounts, companies, workspaceMemberships } from './core.js';

export const clientUnionReviews = pgTable(
  'client_union_reviews',
  {
    reference: uuid('reference').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    companyId: uuid('company_id').notNull(),
    firstClientId: uuid('first_client_id').notNull(),
    secondClientId: uuid('second_client_id').notNull(),
    normalizedIdentifier: text('normalized_identifier').notNull(),
    snapshot: jsonb('snapshot').$type<unknown>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('client_union_reviews_workspace_reference_unique').on(
      table.workspaceId,
      table.reference,
    ),
    foreignKey({
      name: 'client_union_reviews_actor_fk',
      columns: [table.workspaceId, table.actorWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'client_union_reviews_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'client_union_reviews_first_fk',
      columns: [table.workspaceId, table.firstClientId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    foreignKey({
      name: 'client_union_reviews_second_fk',
      columns: [table.workspaceId, table.secondClientId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    check(
      'client_union_reviews_distinct_clients',
      sql`${table.firstClientId} <> ${table.secondClientId}`,
    ),
    check(
      'client_union_reviews_exact_identifier',
      sql`length(${table.normalizedIdentifier}) > 0 AND ${table.normalizedIdentifier} = btrim(${table.normalizedIdentifier})`,
    ),
  ],
);

export const clientUnionOperations = pgTable(
  'client_union_operations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    reviewReference: uuid('review_reference').notNull(),
    canonicalClientId: uuid('canonical_client_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    companyId: uuid('company_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    reason: text('reason').notNull(),
    intent: jsonb('intent').$type<unknown>().notNull(),
    resultSnapshot: jsonb('result_snapshot').$type<unknown>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('client_union_operations_workspace_id_unique').on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex('client_union_operations_review_unique').on(
      table.workspaceId,
      table.reviewReference,
    ),
    uniqueIndex('client_union_operations_actor_command_unique').on(
      table.workspaceId,
      table.actorWorkspaceMembershipId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: 'client_union_operations_review_fk',
      columns: [table.workspaceId, table.reviewReference],
      foreignColumns: [
        clientUnionReviews.workspaceId,
        clientUnionReviews.reference,
      ],
    }),
    foreignKey({
      name: 'client_union_operations_actor_fk',
      columns: [table.workspaceId, table.actorWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'client_union_operations_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'client_union_operations_canonical_fk',
      columns: [table.workspaceId, table.canonicalClientId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    check(
      'client_union_operations_reason_not_blank',
      sql`length(btrim(${table.reason})) BETWEEN 1 AND 2000`,
    ),
  ],
);

export const clientUnionReversals = pgTable(
  'client_union_reversals',
  {
    operationId: uuid('operation_id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    companyId: uuid('company_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('client_union_reversals_actor_command_unique').on(
      table.workspaceId,
      table.actorWorkspaceMembershipId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: 'client_union_reversals_operation_fk',
      columns: [table.workspaceId, table.operationId],
      foreignColumns: [
        clientUnionOperations.workspaceId,
        clientUnionOperations.id,
      ],
    }),
    foreignKey({
      name: 'client_union_reversals_actor_fk',
      columns: [table.workspaceId, table.actorWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'client_union_reversals_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    check(
      'client_union_reversals_reason_not_blank',
      sql`length(btrim(${table.reason})) BETWEEN 1 AND 2000`,
    ),
  ],
);

export const clientIdentifierReservations = pgTable(
  'client_identifier_reservations',
  {
    workspaceId: uuid('workspace_id').notNull(),
    normalizedIdentifier: text('normalized_identifier').notNull(),
    sourceClientId: uuid('source_client_id').notNull(),
  },
  (table) => [
    uniqueIndex('client_identifier_reservations_key_source_unique').on(
      table.workspaceId,
      table.normalizedIdentifier,
      table.sourceClientId,
    ),
    foreignKey({
      name: 'client_identifier_reservations_source_fk',
      columns: [table.workspaceId, table.sourceClientId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    check(
      'client_identifier_reservations_exact_identifier',
      sql`length(${table.normalizedIdentifier}) > 0 AND ${table.normalizedIdentifier} = btrim(${table.normalizedIdentifier})`,
    ),
  ],
);

export const clientUnionProjections = pgTable(
  'client_union_projections',
  {
    reference: uuid('reference').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    operationId: uuid('operation_id').notNull(),
    companyId: uuid('company_id').notNull(),
    action: text('action').notNull(),
  },
  (table) => [
    uniqueIndex('client_union_projections_operation_company_action_unique').on(
      table.workspaceId,
      table.operationId,
      table.companyId,
      table.action,
    ),
    index('client_union_projections_company_lookup').on(
      table.workspaceId,
      table.companyId,
      table.reference,
    ),
    foreignKey({
      name: 'client_union_projections_operation_fk',
      columns: [table.workspaceId, table.operationId],
      foreignColumns: [
        clientUnionOperations.workspaceId,
        clientUnionOperations.id,
      ],
    }),
    foreignKey({
      name: 'client_union_projections_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    check(
      'client_union_projections_action_check',
      sql`${table.action} IN ('client.union_confirmed', 'client.union_reversed')`,
    ),
  ],
);
