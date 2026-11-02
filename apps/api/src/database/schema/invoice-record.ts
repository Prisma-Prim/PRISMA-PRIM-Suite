import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  companies,
  companyRoleAssignments,
  workspaceMemberships,
} from './core.js';
import { documentPdfs } from './document-pdfs.js';
function scope() {
  return {
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
  };
}
export const invoiceRecords = pgTable(
  'invoice_records',
  {
    ...scope(),
    id: uuid('id').primaryKey(),
    createdSequence: bigint('created_sequence', { mode: 'bigint' })
      .generatedAlwaysAsIdentity()
      .notNull(),
    documentId: uuid('document_id').notNull(),
    documentVersionId: uuid('document_version_id').notNull(),
    representationId: uuid('representation_id').notNull(),
    sourceSnapshot: jsonb('source_snapshot').$type<unknown>().notNull(),
    replacesWithdrawnRecordId: uuid('replaces_withdrawn_record_id'),
    revision: integer('revision').notNull(),
    entryState: text('entry_state').notNull(),
    values: jsonb('values').$type<unknown>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('invoice_record_scope_unique').on(
      t.workspaceId,
      t.companyId,
      t.id,
    ),
    uniqueIndex('invoice_record_active_document_unique')
      .on(t.workspaceId, t.companyId, t.documentId)
      .where(sql`${t.entryState}='RECORDED'`),
    uniqueIndex('invoice_record_direct_replacement_unique').on(
      t.replacesWithdrawnRecordId,
    ),
    index('invoice_record_inventory_idx').on(
      t.workspaceId,
      t.companyId,
      t.createdAt.desc(),
      t.id.desc(),
    ),
    foreignKey({
      name: 'invoice_record_source_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.documentId,
        t.documentVersionId,
        t.representationId,
      ],
      foreignColumns: [
        documentPdfs.workspaceId,
        documentPdfs.companyId,
        documentPdfs.documentId,
        documentPdfs.versionId,
        documentPdfs.id,
      ],
    }),
    check(
      'invoice_record_head_check',
      sql`${t.revision} BETWEEN 1 AND 2147483647 AND ${t.entryState} IN ('RECORDED','WITHDRAWN') AND invoice_values_valid(${t.values}) AND jsonb_typeof(${t.sourceSnapshot})='object'`,
    ),
  ],
);
export const invoiceRecordCommands = pgTable(
  'invoice_record_commands',
  {
    ...scope(),
    id: uuid('id').defaultRandom().primaryKey(),
    recordId: uuid('record_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => companyRoleAssignments.id),
    sourceCaptures: jsonb('source_captures').$type<unknown>(),
    idempotencyKey: text('idempotency_key').notNull(),
    intent: jsonb('intent').$type<unknown>().notNull(),
    revision: integer('revision').notNull().default(0),
    response: jsonb('response')
      .$type<unknown>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('invoice_command_actor_key').on(
      t.workspaceId,
      t.actorMembershipId,
      t.idempotencyKey,
    ),
    uniqueIndex('invoice_command_record_revision').on(
      t.workspaceId,
      t.companyId,
      t.recordId,
      t.revision,
    ),
    foreignKey({
      name: 'invoice_command_company_fk',
      columns: [t.workspaceId, t.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'invoice_command_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId, t.actorInternalUserId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'invoice_command_actor_label_check',
      sql`invoice_text(to_jsonb(${t.actorDisplayName}),1000)`,
    ),
    check(
      'invoice_command_receipt_check',
      sql`invoice_receipt_valid(${t.response}) AND ${t.revision} BETWEEN 1 AND 2147483647 AND length(${t.idempotencyKey}) BETWEEN 1 AND 200`,
    ),
  ],
);
export const invoiceRecordHistory = pgTable(
  'invoice_record_history',
  {
    ...scope(),
    recordId: uuid('record_id').notNull(),
    revision: integer('revision').notNull(),
    commandId: uuid('command_id')
      .notNull()
      .references(() => invoiceRecordCommands.id),
    fact: jsonb('fact').$type<unknown>().notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.workspaceId, t.companyId, t.recordId, t.revision],
    }),
    uniqueIndex('invoice_history_command_unique').on(t.commandId),
    foreignKey({
      name: 'invoice_history_record_fk',
      columns: [t.workspaceId, t.companyId, t.recordId],
      foreignColumns: [
        invoiceRecords.workspaceId,
        invoiceRecords.companyId,
        invoiceRecords.id,
      ],
    }),
    check(
      'invoice_history_fact_check',
      sql`invoice_revision_valid(${t.fact}) AND ${t.fact}->>'recordId'=${t.recordId}::text AND (${t.fact}->>'revision')::integer=${t.revision} AND ${t.fact}->>'commandId'=${t.commandId}::text`,
    ),
  ],
);
export const invoiceRecordEvents = pgTable(
  'invoice_record_events',
  {
    ...scope(),
    recordId: uuid('record_id').notNull(),
    revision: integer('revision').notNull(),
    commandId: uuid('command_id')
      .notNull()
      .references(() => invoiceRecordCommands.id),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    action: text('action').notNull(),
    metadata: jsonb('metadata').$type<unknown>().notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.workspaceId, t.companyId, t.recordId, t.revision],
    }),
    uniqueIndex('invoice_event_command_unique').on(t.commandId),
    foreignKey({
      name: 'invoice_event_history_fk',
      columns: [t.workspaceId, t.companyId, t.recordId, t.revision],
      foreignColumns: [
        invoiceRecordHistory.workspaceId,
        invoiceRecordHistory.companyId,
        invoiceRecordHistory.recordId,
        invoiceRecordHistory.revision,
      ],
    }),
    foreignKey({
      name: 'invoice_event_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId, t.actorInternalUserId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'invoice_event_check',
      sql`${t.action} IN ('invoice_record.created','invoice_record.transcription.corrected','invoice_record.entry.withdrawn') AND ${t.metadata}=jsonb_build_object('revision',${t.revision})`,
    ),
  ],
);
export const invoiceRecordCursorKeys = pgTable(
  'invoice_record_cursor_keys',
  {
    ...scope(),
    key: text('key')
      .notNull()
      .default(sql`gen_random_uuid()::text || gen_random_uuid()::text`),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.companyId] }),
    foreignKey({
      name: 'invoice_cursor_company_fk',
      columns: [t.workspaceId, t.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
  ],
);
