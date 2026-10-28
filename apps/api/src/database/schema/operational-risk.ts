import { sql } from 'drizzle-orm';
import {
  check,
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

export const operationalRisks = pgTable(
  'operational_risks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    revision: integer('revision').notNull(),
    currentIntakeRevision: integer('current_intake_revision').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('operational_risks_scope_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
    ),
    index('operational_risks_company_page_idx').on(
      table.workspaceId,
      table.companyId,
      table.createdAt,
      table.id,
    ),
    foreignKey({
      name: 'operational_risks_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    check(
      'operational_risks_revision_check',
      sql`${table.revision} > 0 AND ${table.currentIntakeRevision} > 0 AND ${table.currentIntakeRevision} <= ${table.revision}`,
    ),
  ],
);

// The migration additionally installs the deferred head and history guards.
export const operationalRiskEntries = pgTable(
  'operational_risk_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    riskId: uuid('risk_id').notNull(),
    revision: integer('revision').notNull(),
    kind: text('kind').notNull(),
    predecessorId: uuid('predecessor_id'),
    predecessorRevision: integer('predecessor_revision'),
    originalEntryId: uuid('original_entry_id'),
    originalEntryRevision: integer('original_entry_revision'),
    journalKind: text('journal_kind'),
    payload: jsonb('payload').$type<unknown>().notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('operational_risk_entries_revision_unique').on(
      table.workspaceId,
      table.companyId,
      table.riskId,
      table.revision,
    ),
    uniqueIndex('operational_risk_entries_identity_unique').on(
      table.workspaceId,
      table.companyId,
      table.riskId,
      table.id,
      table.revision,
    ),
    uniqueIndex('operational_risk_entries_successor_unique')
      .on(table.workspaceId, table.companyId, table.riskId, table.predecessorId)
      .where(sql`${table.kind} = 'intake-corrected'`),
    uniqueIndex('operational_risk_journal_successor_unique')
      .on(table.workspaceId, table.companyId, table.riskId, table.predecessorId)
      .where(sql`${table.kind} = 'journal-corrected'`),
    index('operational_risk_journal_current_idx')
      .on(
        table.workspaceId,
        table.companyId,
        table.riskId,
        table.originalEntryId,
        table.revision,
      )
      .where(sql`${table.kind} = 'journal-corrected'`),
    foreignKey({
      name: 'operational_risk_entries_risk_fk',
      columns: [table.workspaceId, table.companyId, table.riskId],
      foreignColumns: [
        operationalRisks.workspaceId,
        operationalRisks.companyId,
        operationalRisks.id,
      ],
    }),
    foreignKey({
      name: 'operational_risk_entries_predecessor_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.riskId,
        table.predecessorId,
        table.predecessorRevision,
      ],
      foreignColumns: [
        table.workspaceId,
        table.companyId,
        table.riskId,
        table.id,
        table.revision,
      ],
    }),
    foreignKey({
      name: 'operational_risk_journal_original_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.riskId,
        table.originalEntryId,
        table.originalEntryRevision,
      ],
      foreignColumns: [
        table.workspaceId,
        table.companyId,
        table.riskId,
        table.id,
        table.revision,
      ],
    }),
    foreignKey({
      name: 'operational_risk_entries_actor_fk',
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
      'operational_risk_entries_kind_check',
      sql`${table.kind} IN ('intake-recorded', 'intake-corrected', 'observation', 'reassessment', 'journal-corrected') AND ${table.revision} > 0 AND jsonb_typeof(${table.payload}) = 'object'`,
    ),
    check(
      'operational_risk_entries_predecessor_check',
      sql`(
    (${table.kind} = 'intake-recorded' AND ${table.revision} = 1 AND ${table.predecessorId} IS NULL AND ${table.predecessorRevision} IS NULL)
    OR (${table.kind} IN ('intake-corrected', 'journal-corrected') AND ${table.predecessorId} IS NOT NULL AND ${table.predecessorRevision} > 0 AND ${table.predecessorRevision} < ${table.revision})
    OR (${table.kind} IN ('observation', 'reassessment') AND ${table.revision} > 1 AND ${table.predecessorId} IS NULL AND ${table.predecessorRevision} IS NULL)
  ) IS TRUE`,
    ),
    check(
      'operational_risk_journal_original_check',
      sql`(CASE WHEN ${table.kind} = 'journal-corrected' THEN
      ${table.originalEntryId} IS NOT NULL AND ${table.originalEntryRevision} > 1 AND ${table.originalEntryRevision} <= ${table.predecessorRevision}
      AND ${table.journalKind} IN ('observation', 'reassessment')
      ELSE ${table.originalEntryId} IS NULL AND ${table.originalEntryRevision} IS NULL AND ${table.journalKind} IS NULL END) IS TRUE`,
    ),
  ],
);

export const operationalRiskReceipts = pgTable(
  'operational_risk_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    commandKind: text('command_kind').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    riskId: uuid('risk_id').notNull(),
    response: jsonb('response').$type<unknown>().notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('operational_risk_receipts_command_unique').on(
      table.workspaceId,
      table.companyId,
      table.actorMembershipId,
      table.commandKind,
      table.idempotencyKey,
    ),
    foreignKey({
      name: 'operational_risk_receipts_risk_fk',
      columns: [table.workspaceId, table.companyId, table.riskId],
      foreignColumns: [
        operationalRisks.workspaceId,
        operationalRisks.companyId,
        operationalRisks.id,
      ],
    }),
    foreignKey({
      name: 'operational_risk_receipts_actor_fk',
      columns: [table.workspaceId, table.actorMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'operational_risk_receipts_shape_check',
      sql`${table.commandKind} IN ('record', 'journal', 'correct', 'journal-correct') AND length(${table.idempotencyKey}) > 0 AND length(${table.fingerprint}) = 64 AND jsonb_typeof(${table.response}) = 'object'`,
    ),
  ],
);

// Restricted recording only. This is deliberately outside generic Activity.
export const operationalRiskEvents = pgTable(
  'operational_risk_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    riskId: uuid('risk_id').notNull(),
    entryId: uuid('entry_id').notNull(),
    revision: integer('revision').notNull(),
    action: text('action').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    metadata: jsonb('metadata').$type<unknown>().notNull(),
  },
  (table) => [
    uniqueIndex('operational_risk_events_revision_unique').on(
      table.workspaceId,
      table.companyId,
      table.riskId,
      table.revision,
    ),
    foreignKey({
      name: 'operational_risk_events_entry_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.riskId,
        table.entryId,
        table.revision,
      ],
      foreignColumns: [
        operationalRiskEntries.workspaceId,
        operationalRiskEntries.companyId,
        operationalRiskEntries.riskId,
        operationalRiskEntries.id,
        operationalRiskEntries.revision,
      ],
    }),
    foreignKey({
      name: 'operational_risk_events_actor_fk',
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
      'operational_risk_events_metadata_check',
      sql`(CASE
    WHEN ${table.action} IN ('operational_risk.recorded', 'operational_risk.intake.corrected') THEN ${table.metadata} = jsonb_build_object('revision', ${table.revision})
    WHEN ${table.action} IN ('operational_risk.journal.recorded', 'operational_risk.journal.corrected') THEN ${table.metadata}->>'kind' IN ('observation', 'reassessment') AND ${table.metadata} = jsonb_build_object('revision', ${table.revision}, 'kind', ${table.metadata}->>'kind')
    ELSE false END) IS TRUE`,
    ),
  ],
);
