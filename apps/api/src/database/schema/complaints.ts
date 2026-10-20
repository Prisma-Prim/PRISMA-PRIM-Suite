import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  clientCompanyRelationships,
  companies,
  workspaceMemberships,
} from './core.js';
import { projects } from './project.js';

export const complaints = pgTable(
  'complaints',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    clientAccountId: uuid('client_account_id').notNull(),
    projectId: uuid('project_id'),
    responsibleMembershipId: uuid('responsible_membership_id').notNull(),
    responsibleDisplayLabel: text('responsible_display_label').notNull(),
    createdByInternalUserId: uuid('created_by_internal_user_id').notNull(),
    revision: integer('revision').default(1).notNull(),
    latestIntakeRevision: integer('latest_intake_revision')
      .default(1)
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('complaints_scope_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
    ),
    foreignKey({
      name: 'complaints_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'complaints_original_client_relationship_fk',
      columns: [table.workspaceId, table.clientAccountId, table.companyId],
      foreignColumns: [
        clientCompanyRelationships.workspaceId,
        clientCompanyRelationships.clientAccountId,
        clientCompanyRelationships.companyId,
      ],
    }),
    foreignKey({
      name: 'complaints_original_project_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.clientAccountId,
        table.projectId,
      ],
      foreignColumns: [
        projects.workspaceId,
        projects.companyId,
        projects.clientAccountId,
        projects.id,
      ],
    }),
    foreignKey({
      name: 'complaints_responsible_actor_fk',
      columns: [
        table.workspaceId,
        table.responsibleMembershipId,
        table.createdByInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'complaints_revision_check',
      sql`${table.revision} >= 1 AND ${table.latestIntakeRevision} >= 1 AND ${table.latestIntakeRevision} <= ${table.revision}`,
    ),
  ],
);

export const complaintIntakeVersions = pgTable(
  'complaint_intake_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    complaintId: uuid('complaint_id').notNull(),
    revision: integer('revision').notNull(),
    intake: jsonb('intake').$type<unknown>().notNull(),
    reason: text('reason'),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorDisplayLabel: text('actor_display_label').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('complaint_intake_versions_revision_unique').on(
      table.workspaceId,
      table.companyId,
      table.complaintId,
      table.revision,
    ),
    foreignKey({
      name: 'complaint_intake_versions_complaint_fk',
      columns: [table.workspaceId, table.companyId, table.complaintId],
      foreignColumns: [
        complaints.workspaceId,
        complaints.companyId,
        complaints.id,
      ],
    }),
    foreignKey({
      name: 'complaint_intake_versions_actor_fk',
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
      'complaint_intake_versions_payload_check',
      sql`jsonb_typeof(${table.intake}) = 'object' AND ${table.revision} >= 1 AND ((${table.revision} = 1 AND ${table.reason} IS NULL) OR (${table.revision} > 1 AND ${table.reason} IS NOT NULL AND length(btrim(${table.reason})) BETWEEN 1 AND 1000))`,
    ),
  ],
);

export const complaintJournalEntries = pgTable(
  'complaint_journal_entries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    complaintId: uuid('complaint_id').notNull(),
    revision: integer('revision').notNull(),
    kind: text('kind').notNull(),
    originalEntryId: uuid('original_entry_id'),
    originalKind: text('original_kind'),
    factualText: text('factual_text').notNull(),
    declaredDate: date('declared_date', { mode: 'string' }),
    reason: text('reason'),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorDisplayLabel: text('actor_display_label').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('complaint_journal_entries_scope_kind_unique').on(
      table.workspaceId,
      table.companyId,
      table.complaintId,
      table.id,
      table.kind,
    ),
    uniqueIndex('complaint_journal_entries_revision_unique').on(
      table.workspaceId,
      table.companyId,
      table.complaintId,
      table.revision,
    ),
    index('complaint_journal_entries_history_idx').on(
      table.workspaceId,
      table.companyId,
      table.complaintId,
      table.occurredAt,
      table.id,
    ),
    index('complaint_journal_entries_original_idx').on(
      table.workspaceId,
      table.companyId,
      table.complaintId,
      table.originalEntryId,
    ),
    foreignKey({
      name: 'complaint_journal_entries_complaint_fk',
      columns: [table.workspaceId, table.companyId, table.complaintId],
      foreignColumns: [
        complaints.workspaceId,
        complaints.companyId,
        complaints.id,
      ],
    }),
    foreignKey({
      name: 'complaint_journal_entries_original_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.complaintId,
        table.originalEntryId,
        table.originalKind,
      ],
      foreignColumns: [
        table.workspaceId,
        table.companyId,
        table.complaintId,
        table.id,
        table.kind,
      ],
    }),
    foreignKey({
      name: 'complaint_journal_entries_actor_fk',
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
      'complaint_journal_entries_payload_check',
      sql`
      ${table.revision} > 1 AND length(btrim(${table.factualText})) BETWEEN 1 AND 5000
      AND (
        (${table.kind} IN ('action', 'response') AND ${table.originalEntryId} IS NULL
          AND ${table.originalKind} IS NULL AND ${table.reason} IS NULL)
        OR (${table.kind} = 'correction' AND ${table.originalEntryId} IS NOT NULL
          AND ${table.originalKind} IS NOT NULL AND ${table.originalKind} IN ('action', 'response')
          AND ${table.reason} IS NOT NULL AND length(btrim(${table.reason})) BETWEEN 1 AND 1000)
      )`,
    ),
  ],
);

export const complaintReceipts = pgTable(
  'complaint_receipts',
  {
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    complaintId: uuid('complaint_id').notNull(),
    fingerprint: text('fingerprint').notNull(),
    response: jsonb('response').$type<unknown>().notNull(),
  },
  (table) => [
    uniqueIndex('complaint_receipts_actor_key_unique').on(
      table.workspaceId,
      table.companyId,
      table.actorMembershipId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: 'complaint_receipts_complaint_fk',
      columns: [table.workspaceId, table.companyId, table.complaintId],
      foreignColumns: [
        complaints.workspaceId,
        complaints.companyId,
        complaints.id,
      ],
    }),
    foreignKey({
      name: 'complaint_receipts_actor_fk',
      columns: [table.workspaceId, table.actorMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'complaint_receipts_response_check',
      sql`jsonb_typeof(${table.response}) = 'object' AND length(${table.fingerprint}) = 64`,
    ),
  ],
);

// This restricted family has no generic Activity/Home read projection.
export const complaintEvents = pgTable(
  'complaint_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    complaintId: uuid('complaint_id').notNull(),
    revision: integer('revision').notNull(),
    action: text('action').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    metadata: jsonb('metadata').$type<unknown>().notNull(),
  },
  (table) => [
    uniqueIndex('complaint_events_revision_unique').on(
      table.workspaceId,
      table.companyId,
      table.complaintId,
      table.revision,
    ),
    foreignKey({
      name: 'complaint_events_complaint_fk',
      columns: [table.workspaceId, table.companyId, table.complaintId],
      foreignColumns: [
        complaints.workspaceId,
        complaints.companyId,
        complaints.id,
      ],
    }),
    foreignKey({
      name: 'complaint_events_actor_fk',
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
      'complaint_events_metadata_check',
      sql`(
        ((${table.action} = 'complaint.recorded' AND ${table.revision} = 1)
          OR (${table.action} = 'complaint.intake.corrected' AND ${table.revision} > 1))
          AND ${table.metadata} = jsonb_build_object('revision', ${table.revision})
      ) OR (
        ${table.action} = 'complaint.journal.recorded' AND ${table.revision} > 1
        AND ${table.metadata}->>'kind' IS NOT NULL
        AND ${table.metadata}->>'kind' IN ('action', 'response', 'correction')
        AND ${table.metadata} = jsonb_build_object('revision', ${table.revision}, 'kind', ${table.metadata}->>'kind')
      )`,
    ),
  ],
);
