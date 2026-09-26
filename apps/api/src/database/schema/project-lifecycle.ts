import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  PROJECT_LIFECYCLE_ACTIONS,
  PROJECT_STATUSES,
} from '../../project/project-lifecycle.types.js';
import { workspaceMemberships } from './core.js';
import { projects } from './project.js';

const DECLARATION_VALUES = ['present', 'missing'] as const;

// The append-only `project.lifecycle.changed` record (Project/Task PRD
// section 23): one row per committed transition, with its resulting revision.
export const projectLifecycleTransitions = pgTable(
  'project_lifecycle_transitions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id').notNull(),
    lifecycleRevision: integer('lifecycle_revision').notNull(),
    action: text('action', { enum: PROJECT_LIFECYCLE_ACTIONS }).notNull(),
    fromStatus: text('from_status', { enum: PROJECT_STATUSES }).notNull(),
    toStatus: text('to_status', { enum: PROJECT_STATUSES }).notNull(),
    reason: text('reason'),
    note: text('note'),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // A constraint, not only an index, so each receipt can reference it.
    unique('project_lifecycle_transitions_revision_unique').on(
      table.workspaceId,
      table.projectId,
      table.lifecycleRevision,
    ),
    foreignKey({
      name: 'project_lifecycle_transitions_project_fk',
      columns: [table.workspaceId, table.companyId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.companyId, projects.id],
    }),
    foreignKey({
      name: 'project_lifecycle_transitions_actor_fk',
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
      'project_lifecycle_transitions_revision_check',
      sql`${table.lifecycleRevision} >= 1`,
    ),
    // Exactly the section 23 transitions; no other action or pair exists.
    check(
      'project_lifecycle_transitions_action_check',
      sql`(
        (${table.action} = 'activate' AND ${table.fromStatus} = 'preparatory' AND ${table.toStatus} = 'active')
        OR (${table.action} = 'hold' AND ${table.fromStatus} = 'active' AND ${table.toStatus} = 'on_hold')
        OR (${table.action} = 'resume' AND ${table.fromStatus} = 'on_hold' AND ${table.toStatus} = 'active')
        OR (${table.action} = 'complete' AND ${table.fromStatus} = 'active' AND ${table.toStatus} = 'completed')
        OR (${table.action} = 'cancel' AND ${table.fromStatus} IN ('preparatory', 'active', 'on_hold') AND ${table.toStatus} = 'cancelled')
      )`,
    ),
    // Hold and cancel carry a reason, completion a note, the others neither.
    check(
      'project_lifecycle_transitions_text_check',
      sql`(
        (${table.action} IN ('hold', 'cancel') AND ${table.reason} IS NOT NULL AND ${table.note} IS NULL)
        OR (${table.action} = 'complete' AND ${table.note} IS NOT NULL AND ${table.reason} IS NULL)
        OR (${table.action} IN ('activate', 'resume') AND ${table.reason} IS NULL AND ${table.note} IS NULL)
      )
      AND (${table.reason} IS NULL OR (length(${table.reason}) BETWEEN 1 AND 500 AND ${table.reason} = btrim(${table.reason})))
      AND (${table.note} IS NULL OR (length(${table.note}) BETWEEN 1 AND 500 AND ${table.note} = btrim(${table.note})))`,
    ),
  ],
);

// The immutable start declaration of a Project's one activation. The start
// exception is present if and only if at least one item is missing.
export const projectStartDeclarations = pgTable(
  'project_start_declarations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id').notNull(),
    approvedOffer: text('approved_offer', {
      enum: DECLARATION_VALUES,
    }).notNull(),
    contractOrPrecontract: text('contract_or_precontract', {
      enum: DECLARATION_VALUES,
    }).notNull(),
    projectPlan: text('project_plan', { enum: DECLARATION_VALUES }).notNull(),
    initialDocuments: text('initial_documents', {
      enum: DECLARATION_VALUES,
    }).notNull(),
    deadlines: text('deadlines', { enum: DECLARATION_VALUES }).notNull(),
    financialConditions: text('financial_conditions', {
      enum: DECLARATION_VALUES,
    }).notNull(),
    risks: text('risks', { enum: DECLARATION_VALUES }).notNull(),
    exceptionReason: text('exception_reason'),
    completionMembershipId: uuid('completion_membership_id'),
    completionDisplayLabel: text('completion_display_label'),
    completionDueDate: date('completion_due_date', { mode: 'string' }),
    declaredByInternalUserId: uuid('declared_by_internal_user_id').notNull(),
    declaredByMembershipId: uuid('declared_by_membership_id').notNull(),
    declaredByDisplayName: text('declared_by_display_name').notNull(),
    declaredAt: timestamp('declared_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('project_start_declarations_project_unique').on(
      table.workspaceId,
      table.projectId,
    ),
    foreignKey({
      name: 'project_start_declarations_project_fk',
      columns: [table.workspaceId, table.companyId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.companyId, projects.id],
    }),
    foreignKey({
      name: 'project_start_declarations_declared_by_fk',
      columns: [
        table.workspaceId,
        table.declaredByMembershipId,
        table.declaredByInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    foreignKey({
      name: 'project_start_declarations_completion_fk',
      columns: [table.workspaceId, table.completionMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'project_start_declarations_items_check',
      sql`${table.approvedOffer} IN ('present', 'missing')
        AND ${table.contractOrPrecontract} IN ('present', 'missing')
        AND ${table.projectPlan} IN ('present', 'missing')
        AND ${table.initialDocuments} IN ('present', 'missing')
        AND ${table.deadlines} IN ('present', 'missing')
        AND ${table.financialConditions} IN ('present', 'missing')
        AND ${table.risks} IN ('present', 'missing')`,
    ),
    check(
      'project_start_declarations_exception_check',
      sql`(
        ${table.approvedOffer} = 'missing'
        OR ${table.contractOrPrecontract} = 'missing'
        OR ${table.projectPlan} = 'missing'
        OR ${table.initialDocuments} = 'missing'
        OR ${table.deadlines} = 'missing'
        OR ${table.financialConditions} = 'missing'
        OR ${table.risks} = 'missing'
      ) = (${table.exceptionReason} IS NOT NULL)
      AND (${table.exceptionReason} IS NULL) = (${table.completionMembershipId} IS NULL)
      AND (${table.exceptionReason} IS NULL) = (${table.completionDisplayLabel} IS NULL)
      AND (${table.exceptionReason} IS NULL) = (${table.completionDueDate} IS NULL)
      AND (${table.exceptionReason} IS NULL OR (length(${table.exceptionReason}) BETWEEN 1 AND 500 AND ${table.exceptionReason} = btrim(${table.exceptionReason})))
      AND (${table.completionDueDate} IS NULL OR (${table.completionDueDate} >= DATE '0001-01-01' AND ${table.completionDueDate} <= DATE '9999-12-31'))`,
    ),
  ],
);

// One durable receipt per actor/Workspace key. It points at the committed
// transition whose recorded outcome an exact replay returns.
export const projectLifecycleCommands = pgTable(
  'project_lifecycle_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    /** The normalized validated command, compared exactly on replay. */
    command: text('command').notNull(),
    resultRevision: integer('result_revision').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('project_lifecycle_commands_actor_key_unique').on(
      table.workspaceId,
      table.actorMembershipId,
      table.idempotencyKey,
    ),
    uniqueIndex('project_lifecycle_commands_result_unique').on(
      table.workspaceId,
      table.projectId,
      table.resultRevision,
    ),
    foreignKey({
      name: 'project_lifecycle_commands_project_fk',
      columns: [table.workspaceId, table.companyId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.companyId, projects.id],
    }),
    foreignKey({
      name: 'project_lifecycle_commands_actor_fk',
      columns: [table.workspaceId, table.actorMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'project_lifecycle_commands_transition_fk',
      columns: [table.workspaceId, table.projectId, table.resultRevision],
      foreignColumns: [
        projectLifecycleTransitions.workspaceId,
        projectLifecycleTransitions.projectId,
        projectLifecycleTransitions.lifecycleRevision,
      ],
    }),
  ],
);
