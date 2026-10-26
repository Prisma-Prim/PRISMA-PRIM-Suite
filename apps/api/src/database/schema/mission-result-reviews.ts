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
import { companyRoleAssignments, workspaceMemberships } from './core.js';
import {
  projectTemplateInstances,
  projectTemplateTaskCopies,
} from './project-template.js';
import { taskResultDeclarations } from './task-results.js';

function scope() {
  return {
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id').notNull(),
  };
}

export const missionResultReviewBatches = pgTable(
  'mission_result_review_batches',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ...scope(),
    revision: integer('revision').notNull(),
    predecessorId: uuid('predecessor_id'),
    previousRevision: integer('previous_revision'),
    outcome: text('outcome', {
      enum: ['ACCEPTED_BY_REVIEWER', 'NEEDS_WORK'],
    }).notNull(),
    basis: text('basis').notNull(),
    signature: text('signature').notNull(),
    selectedCount: integer('selected_count').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    reviewerAssignmentId: uuid('reviewer_assignment_id')
      .notNull()
      .references(() => companyRoleAssignments.id),
    reviewerPermissionSetVersion: text(
      'reviewer_permission_set_version',
    ).notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('mr_review_batches_revision_unique').on(
      table.workspaceId,
      table.companyId,
      table.projectId,
      table.revision,
    ),
    uniqueIndex('mr_review_batches_scope_unique').on(
      table.workspaceId,
      table.companyId,
      table.projectId,
      table.id,
      table.revision,
    ),
    foreignKey({
      name: 'mr_review_batches_source_fk',
      columns: [table.workspaceId, table.companyId, table.projectId],
      foreignColumns: [
        projectTemplateInstances.workspaceId,
        projectTemplateInstances.companyId,
        projectTemplateInstances.projectId,
      ],
    }),
    foreignKey({
      name: 'mr_review_batches_predecessor_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.projectId,
        table.predecessorId,
        table.previousRevision,
      ],
      foreignColumns: [
        table.workspaceId,
        table.companyId,
        table.projectId,
        table.id,
        table.revision,
      ],
    }),
    foreignKey({
      name: 'mr_review_batches_actor_fk',
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
      'mr_review_batches_meaning_check',
      sql`${table.revision} >= 1 AND ${table.selectedCount} BETWEEN 1 AND 13 AND ${table.outcome} IN ('ACCEPTED_BY_REVIEWER','NEEDS_WORK') AND ${table.reviewerPermissionSetVersion} = 'v1' AND char_length(${table.basis}) BETWEEN 1 AND 2000 AND ${table.basis} = btrim(${table.basis}) AND char_length(${table.signature}) <= 50000 AND jsonb_typeof(${table.signature}::jsonb) = 'object' AND ((${table.revision} = 1 AND ${table.predecessorId} IS NULL AND ${table.previousRevision} IS NULL) OR (${table.revision} > 1 AND ${table.predecessorId} IS NOT NULL AND ${table.previousRevision} IS NOT NULL AND ${table.previousRevision} = ${table.revision} - 1))`,
    ),
  ],
);

export const missionResultReviewItems = pgTable(
  'mission_result_review_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ...scope(),
    batchId: uuid('batch_id').notNull(),
    reviewRevision: integer('review_revision').notNull(),
    taskId: uuid('task_id').notNull(),
    position: integer('position').notNull(),
    taskVersion: integer('task_version').notNull(),
    taskTitle: text('task_title').notNull(),
    resultRevision: integer('result_revision').notNull(),
    predecessorId: uuid('predecessor_id'),
    evidenceKind: text('evidence_kind', {
      enum: ['DECLARED_RESULT', 'EXTERNAL_REPORTED'],
    }).notNull(),
    resultId: uuid('result_id'),
    externalReference: text('external_reference'),
  },
  (table) => [
    uniqueIndex('mr_review_items_batch_task_unique').on(
      table.batchId,
      table.taskId,
    ),
    uniqueIndex('mr_review_items_batch_position_unique').on(
      table.batchId,
      table.position,
    ),
    uniqueIndex('mr_review_items_predecessor_scope_unique').on(
      table.workspaceId,
      table.companyId,
      table.projectId,
      table.taskId,
      table.id,
    ),
    foreignKey({
      name: 'mr_review_items_batch_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.projectId,
        table.batchId,
        table.reviewRevision,
      ],
      foreignColumns: [
        missionResultReviewBatches.workspaceId,
        missionResultReviewBatches.companyId,
        missionResultReviewBatches.projectId,
        missionResultReviewBatches.id,
        missionResultReviewBatches.revision,
      ],
    }),
    foreignKey({
      name: 'mr_review_items_copy_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.projectId,
        table.taskId,
        table.position,
      ],
      foreignColumns: [
        projectTemplateTaskCopies.workspaceId,
        projectTemplateTaskCopies.companyId,
        projectTemplateTaskCopies.projectId,
        projectTemplateTaskCopies.taskId,
        projectTemplateTaskCopies.position,
      ],
    }),
    foreignKey({
      name: 'mr_review_items_result_fk',
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
      name: 'mr_review_items_predecessor_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.projectId,
        table.taskId,
        table.predecessorId,
      ],
      foreignColumns: [
        table.workspaceId,
        table.companyId,
        table.projectId,
        table.taskId,
        table.id,
      ],
    }),
    check(
      'mr_review_items_meaning_check',
      sql`${table.position} BETWEEN 0 AND 12 AND ${table.taskVersion} >= 1 AND ${table.resultRevision} >= 0 AND char_length(${table.taskTitle}) >= 1 AND ((${table.evidenceKind}='DECLARED_RESULT' AND ${table.resultId} IS NOT NULL AND ${table.resultRevision} >= 1 AND ${table.externalReference} IS NULL) OR (${table.evidenceKind}='EXTERNAL_REPORTED' AND ${table.resultId} IS NULL AND ${table.externalReference} IS NOT NULL AND char_length(${table.externalReference}) BETWEEN 1 AND 1000 AND ${table.externalReference} = btrim(${table.externalReference})))`,
    ),
  ],
);

export const missionResultReviewCommands = pgTable(
  'mission_result_review_commands',
  {
    ...scope(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    command: text('command').notNull(),
    batchId: uuid('batch_id').notNull(),
    reviewRevision: integer('review_revision').notNull(),
    action: text('action', { enum: ['recorded', 'unchanged'] }).notNull(),
  },
  (table) => [
    uniqueIndex('mr_review_commands_actor_key_unique').on(
      table.workspaceId,
      table.actorMembershipId,
      table.idempotencyKey,
    ),
    uniqueIndex('mission_review_recorded_receipt_unique')
      .on(table.batchId)
      .where(sql`${table.action}='recorded'`),
    foreignKey({
      name: 'mr_review_commands_batch_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.projectId,
        table.batchId,
        table.reviewRevision,
      ],
      foreignColumns: [
        missionResultReviewBatches.workspaceId,
        missionResultReviewBatches.companyId,
        missionResultReviewBatches.projectId,
        missionResultReviewBatches.id,
        missionResultReviewBatches.revision,
      ],
    }),
    foreignKey({
      name: 'mr_review_commands_actor_fk',
      columns: [table.workspaceId, table.actorMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'mr_review_commands_meaning_check',
      sql`${table.action} IN ('recorded','unchanged') AND char_length(${table.idempotencyKey}) BETWEEN 1 AND 200 AND char_length(${table.command}) <= 50000 AND jsonb_typeof(${table.command}::jsonb)='object'`,
    ),
  ],
);

/** Restricted Accountability facts, intentionally absent from ordinary feeds. */
export const missionResultReviewEvents = pgTable(
  'mission_result_review_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ...scope(),
    batchId: uuid('batch_id').notNull(),
    reviewRevision: integer('review_revision').notNull(),
    action: text('action', {
      enum: ['project.mission_result.reviewed'],
    }).notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    metadata: jsonb('metadata').$type<unknown>().notNull(),
  },
  (table) => [
    uniqueIndex('mr_review_events_batch_unique').on(table.batchId),
    foreignKey({
      name: 'mr_review_events_batch_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.projectId,
        table.batchId,
        table.reviewRevision,
      ],
      foreignColumns: [
        missionResultReviewBatches.workspaceId,
        missionResultReviewBatches.companyId,
        missionResultReviewBatches.projectId,
        missionResultReviewBatches.id,
        missionResultReviewBatches.revision,
      ],
    }),
    foreignKey({
      name: 'mr_review_events_actor_fk',
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
      'mr_review_events_meaning_check',
      sql`${table.action}='project.mission_result.reviewed' AND ${table.metadata} = jsonb_build_object('revision',${table.reviewRevision})`,
    ),
  ],
);
