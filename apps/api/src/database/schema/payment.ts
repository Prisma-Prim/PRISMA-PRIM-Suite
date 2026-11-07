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
export const paymentObservations = pgTable(
  'payments',
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
    replacesClosedPaymentId: uuid('replaces_closed_payment_id'),
    revision: integer('revision').notNull(),
    state: text('state').notNull(),
    values: jsonb('values').$type<unknown>().notNull(),
    confirmation: jsonb('confirmation').$type<unknown>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('payment_scope_unique').on(t.workspaceId, t.companyId, t.id),
    uniqueIndex('payment_direct_replacement_unique').on(
      t.replacesClosedPaymentId,
    ),
    index('payment_inventory_idx').on(
      t.workspaceId,
      t.companyId,
      t.createdAt.desc(),
      t.id.desc(),
    ),
    foreignKey({
      name: 'payment_source_fk',
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
      'payment_head_check',
      sql`${t.revision} BETWEEN 1 AND 2147483647 AND ${t.state} IN ('DRAFT','CONFIRMED','WITHDRAWN','REVERSED') AND payment_values_valid(${t.values}) AND jsonb_typeof(${t.sourceSnapshot})='object'`,
    ),
  ],
);
export const paymentCommands = pgTable(
  'payment_commands',
  {
    ...scope(),
    id: uuid('id').defaultRandom().primaryKey(),
    paymentId: uuid('payment_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    assignmentId: uuid('assignment_id').notNull(),
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
    uniqueIndex('payment_command_actor_key').on(
      t.workspaceId,
      t.actorMembershipId,
      t.idempotencyKey,
    ),
    uniqueIndex('payment_command_record_revision').on(
      t.workspaceId,
      t.companyId,
      t.paymentId,
      t.revision,
    ),
    uniqueIndex('payment_command_scope_unique').on(
      t.workspaceId,
      t.companyId,
      t.id,
    ),
    foreignKey({
      name: 'payment_command_company_fk',
      columns: [t.workspaceId, t.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'payment_commands_assignment_id_company_role_assignments_id_fk',
      columns: [t.workspaceId, t.companyId, t.assignmentId],
      foreignColumns: [
        companyRoleAssignments.workspaceId,
        companyRoleAssignments.companyId,
        companyRoleAssignments.id,
      ],
    }),
    foreignKey({
      name: 'payment_command_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId, t.actorInternalUserId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'payment_command_actor_label_check',
      sql`payment_native_text(to_jsonb(${t.actorDisplayName}))`,
    ),
    check(
      'payment_command_receipt_check',
      sql`payment_receipt_valid(${t.response}) AND ${t.revision} BETWEEN 1 AND 2147483647 AND length(${t.idempotencyKey}) BETWEEN 1 AND 200`,
    ),
  ],
);
export const paymentHistory = pgTable(
  'payment_history',
  {
    ...scope(),
    paymentId: uuid('payment_id').notNull(),
    revision: integer('revision').notNull(),
    commandId: uuid('command_id').notNull(),
    fact: jsonb('fact').$type<unknown>().notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.workspaceId, t.companyId, t.paymentId, t.revision],
    }),
    uniqueIndex('payment_history_command_unique').on(t.commandId),
    foreignKey({
      name: 'payment_history_command_id_payment_commands_id_fk',
      columns: [t.workspaceId, t.companyId, t.commandId],
      foreignColumns: [
        paymentCommands.workspaceId,
        paymentCommands.companyId,
        paymentCommands.id,
      ],
    }),
    foreignKey({
      name: 'payment_history_record_fk',
      columns: [t.workspaceId, t.companyId, t.paymentId],
      foreignColumns: [
        paymentObservations.workspaceId,
        paymentObservations.companyId,
        paymentObservations.id,
      ],
    }),
    check(
      'payment_history_fact_check',
      sql`payment_revision_valid(${t.fact}) AND ${t.fact}->>'paymentId'=${t.paymentId}::text AND (${t.fact}->>'revision')::integer=${t.revision} AND ${t.fact}->>'commandId'=${t.commandId}::text`,
    ),
  ],
);
export const paymentEvents = pgTable(
  'payment_events',
  {
    ...scope(),
    paymentId: uuid('payment_id').notNull(),
    revision: integer('revision').notNull(),
    commandId: uuid('command_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    action: text('action').notNull(),
    metadata: jsonb('metadata').$type<unknown>().notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.workspaceId, t.companyId, t.paymentId, t.revision],
    }),
    uniqueIndex('payment_event_command_unique').on(t.commandId),
    foreignKey({
      name: 'payment_events_command_id_payment_commands_id_fk',
      columns: [t.workspaceId, t.companyId, t.commandId],
      foreignColumns: [
        paymentCommands.workspaceId,
        paymentCommands.companyId,
        paymentCommands.id,
      ],
    }),
    foreignKey({
      name: 'payment_event_history_fk',
      columns: [t.workspaceId, t.companyId, t.paymentId, t.revision],
      foreignColumns: [
        paymentHistory.workspaceId,
        paymentHistory.companyId,
        paymentHistory.paymentId,
        paymentHistory.revision,
      ],
    }),
    foreignKey({
      name: 'payment_event_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId, t.actorInternalUserId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'payment_event_check',
      sql`${t.action} IN ('payment.observation.recorded','payment.draft.corrected','payment.draft.withdrawn','payment.confirmed','payment.reversed') AND ${t.metadata}=jsonb_build_object('revision',${t.revision})`,
    ),
  ],
);
export const paymentCursorKeys = pgTable(
  'payment_cursor_keys',
  {
    ...scope(),
    key: text('key')
      .notNull()
      .default(sql`gen_random_uuid()::text || gen_random_uuid()::text`),
  },
  (t) => [
    primaryKey({ columns: [t.workspaceId, t.companyId] }),
    foreignKey({
      name: 'payment_cursor_company_fk',
      columns: [t.workspaceId, t.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
  ],
);
