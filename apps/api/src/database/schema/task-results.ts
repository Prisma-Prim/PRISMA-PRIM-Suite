import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { workspaceMemberships } from './core.js';
import { documentPdfs } from './document-pdfs.js';
import { tasks } from './task.js';

/** A separate append-only result stream; ordinary Task versions are unchanged. */
export const taskResultDeclarations = pgTable(
  'task_result_declarations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    taskId: uuid('task_id').notNull(),
    revision: integer('revision').notNull(),
    declaration: text('declaration').notNull(),
    documentId: uuid('document_id').notNull(),
    versionId: uuid('version_id').notNull(),
    pdfId: uuid('pdf_id').notNull(),
    predecessorId: uuid('predecessor_id'),
    reason: text('reason'),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('task_result_declarations_revision_unique').on(
      table.workspaceId,
      table.companyId,
      table.taskId,
      table.revision,
    ),
    uniqueIndex('task_result_declarations_scope_unique').on(
      table.workspaceId,
      table.companyId,
      table.taskId,
      table.id,
    ),
    foreignKey({
      name: 'task_result_declarations_task_fk',
      columns: [table.workspaceId, table.companyId, table.taskId],
      foreignColumns: [tasks.workspaceId, tasks.companyId, tasks.id],
    }),
    foreignKey({
      name: 'task_result_declarations_pdf_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.documentId,
        table.versionId,
        table.pdfId,
      ],
      foreignColumns: [
        documentPdfs.workspaceId,
        documentPdfs.companyId,
        documentPdfs.documentId,
        documentPdfs.versionId,
        documentPdfs.id,
      ],
    }),
    foreignKey({
      name: 'task_result_declarations_actor_fk',
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
      'task_result_declarations_revision_check',
      sql`${table.revision} >= 1`,
    ),
    check(
      'task_result_declarations_text_check',
      sql`length(${table.declaration}) BETWEEN 1 AND 2000 AND ${table.declaration} = btrim(${table.declaration})`,
    ),
    check(
      'task_result_declarations_correction_check',
      sql`(${table.revision} = 1 AND ${table.predecessorId} IS NULL AND ${table.reason} IS NULL) OR (${table.revision} > 1 AND ${table.predecessorId} IS NOT NULL AND ${table.reason} IS NOT NULL AND length(${table.reason}) BETWEEN 1 AND 500 AND ${table.reason} = btrim(${table.reason}))`,
    ),
  ],
);

/** A minimal immutable outcome, separate from ordinary Task command receipts. */
export const taskResultCommands = pgTable(
  'task_result_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    taskId: uuid('task_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    command: text('command').notNull(),
    action: text('action', {
      enum: ['recorded', 'corrected', 'unchanged'],
    }).notNull(),
    resultId: uuid('result_id').notNull(),
  },
  (table) => [
    uniqueIndex('task_result_commands_actor_key_unique').on(
      table.workspaceId,
      table.actorMembershipId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: 'task_result_commands_result_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.taskId,
        table.resultId,
      ],
      foreignColumns: [
        taskResultDeclarations.workspaceId,
        taskResultDeclarations.companyId,
        taskResultDeclarations.taskId,
        taskResultDeclarations.id,
      ],
    }),
    foreignKey({
      name: 'task_result_commands_actor_fk',
      columns: [table.workspaceId, table.actorMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'task_result_commands_action_check',
      sql`${table.action} IN ('recorded', 'corrected', 'unchanged')`,
    ),
  ],
);

/** Restricted Accountability recording, intentionally absent from ordinary feeds. */
export const taskResultEvents = pgTable(
  'task_result_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    taskId: uuid('task_id').notNull(),
    resultId: uuid('result_id').notNull(),
    revision: integer('revision').notNull(),
    action: text('action', {
      enum: ['task.result.recorded', 'task.result.corrected'],
    }).notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    metadata: jsonb('metadata').$type<unknown>().notNull(),
  },
  (table) => [
    uniqueIndex('task_result_events_result_unique').on(table.resultId),
    foreignKey({
      name: 'task_result_events_result_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.taskId,
        table.resultId,
      ],
      foreignColumns: [
        taskResultDeclarations.workspaceId,
        taskResultDeclarations.companyId,
        taskResultDeclarations.taskId,
        taskResultDeclarations.id,
      ],
    }),
    foreignKey({
      name: 'task_result_events_actor_fk',
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
      'task_result_events_meaning_check',
      sql`${table.revision} >= 1 AND ((${table.revision} = 1 AND ${table.action} = 'task.result.recorded') OR (${table.revision} > 1 AND ${table.action} = 'task.result.corrected')) AND ${table.metadata} = jsonb_build_object('revision', ${table.revision})`,
    ),
  ],
);
