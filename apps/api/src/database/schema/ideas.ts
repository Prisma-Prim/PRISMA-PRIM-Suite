import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies, workspaceMemberships } from './core.js';

export const ideas = pgTable(
  'ideas',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    description: text('description').notNull(),
    origin: text('origin').notNull(),
    revision: integer('revision').default(1).notNull(),
    disposition: text('disposition', { enum: ['new', 'deferred', 'rejected'] })
      .default('new')
      .notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('ideas_scope_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
    ),
    index('ideas_list_idx').on(
      table.workspaceId,
      table.companyId,
      table.submittedAt,
      table.id,
    ),
    foreignKey({
      name: 'ideas_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'ideas_actor_fk',
      columns: [
        table.workspaceId,
        table.actorMembershipId,
        table.actorInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'ideas_revision_check',
      sql`${table.revision} > 0 AND ((${table.revision} = 1 AND ${table.disposition} = 'new') OR (${table.revision} > 1 AND ${table.disposition} IN ('deferred', 'rejected')))`,
    ),
    check(
      'ideas_text_check',
      sql`length(btrim(${table.description})) > 0 AND length(btrim(${table.origin})) > 0`,
    ),
  ],
);

export const ideaDispositions = pgTable(
  'idea_dispositions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    ideaId: uuid('idea_id').notNull(),
    precedingRevision: integer('preceding_revision').notNull(),
    revision: integer('revision').notNull(),
    kind: text('kind', { enum: ['deferred', 'rejected'] }).notNull(),
    reason: text('reason').notNull(),
    reconsiderationDate: date('reconsideration_date', { mode: 'string' }),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('idea_dispositions_revision_unique').on(
      table.workspaceId,
      table.companyId,
      table.ideaId,
      table.revision,
    ),
    uniqueIndex('idea_dispositions_scope_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.ideaId,
      table.id,
    ),
    foreignKey({
      name: 'idea_dispositions_idea_fk',
      columns: [table.workspaceId, table.companyId, table.ideaId],
      foreignColumns: [ideas.workspaceId, ideas.companyId, ideas.id],
    }),
    foreignKey({
      name: 'idea_dispositions_actor_fk',
      columns: [
        table.workspaceId,
        table.actorMembershipId,
        table.actorInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'idea_dispositions_revision_check',
      sql`${table.precedingRevision} > 0 AND ${table.revision} = ${table.precedingRevision} + 1`,
    ),
    check(
      'idea_dispositions_kind_check',
      sql`${table.kind} IN ('deferred','rejected') AND (${table.kind} = 'deferred' OR ${table.reconsiderationDate} IS NULL)`,
    ),
    check(
      'idea_dispositions_reason_check',
      sql`length(btrim(${table.reason})) > 0`,
    ),
  ],
);

export const ideaReceipts = pgTable(
  'idea_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    commandKind: text('command_kind', {
      enum: ['record', 'disposition'],
    }).notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    ideaId: uuid('idea_id').notNull(),
    response: jsonb('response').$type<unknown>().notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('idea_receipts_actor_key_unique').on(
      table.workspaceId,
      table.companyId,
      table.actorMembershipId,
      table.commandKind,
      table.idempotencyKey,
    ),
    foreignKey({
      name: 'idea_receipts_idea_fk',
      columns: [table.workspaceId, table.companyId, table.ideaId],
      foreignColumns: [ideas.workspaceId, ideas.companyId, ideas.id],
    }),
    foreignKey({
      name: 'idea_receipts_actor_fk',
      columns: [table.workspaceId, table.actorMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'idea_receipts_kind_check',
      sql`${table.commandKind} IN ('record','disposition')`,
    ),
  ],
);

// Restricted recording only: deliberately absent from ordinary Activity storage/projections.
export const ideaEvents = pgTable(
  'idea_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    ideaId: uuid('idea_id').notNull(),
    revision: integer('revision').notNull(),
    action: text('action', {
      enum: ['idea.recorded', 'idea.disposition.recorded'],
    }).notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    metadata: jsonb('metadata').$type<unknown>().notNull(),
  },
  (table) => [
    uniqueIndex('idea_events_revision_unique').on(
      table.workspaceId,
      table.companyId,
      table.ideaId,
      table.revision,
    ),
    foreignKey({
      name: 'idea_events_idea_fk',
      columns: [table.workspaceId, table.companyId, table.ideaId],
      foreignColumns: [ideas.workspaceId, ideas.companyId, ideas.id],
    }),
    foreignKey({
      name: 'idea_events_actor_fk',
      columns: [
        table.workspaceId,
        table.actorMembershipId,
        table.actorInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'idea_events_metadata_check',
      sql`((${table.action} = 'idea.recorded' AND ${table.revision} = 1 AND ${table.metadata} = jsonb_build_object('revision', ${table.revision})) OR (${table.action} = 'idea.disposition.recorded' AND ${table.revision} > 1 AND ${table.metadata}->>'disposition' IN ('deferred','rejected') AND ${table.metadata} = jsonb_build_object('revision', ${table.revision}, 'disposition', ${table.metadata}->>'disposition'))) IS TRUE`,
    ),
  ],
);
