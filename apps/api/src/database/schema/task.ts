import { sql, type SQLWrapper } from 'drizzle-orm';
import {
  check,
  date,
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
import { projects } from './project.js';

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id').notNull(),
    clientAccountId: uuid('client_account_id').notNull(),
    title: text('title').notNull(),
    assigneeMembershipId: uuid('assignee_membership_id'),
    assigneeDisplayLabel: text('assignee_display_label'),
    dueDate: date('due_date', { mode: 'string' }),
    priority: text('priority', { enum: ['normal', 'important', 'critical'] })
      .notNull()
      .default('normal'),
    status: text('status', {
      enum: ['todo', 'in_progress', 'blocked', 'done', 'cancelled'],
    })
      .notNull()
      .default('todo'),
    version: integer('version').notNull().default(1),
    createdByInternalUserId: uuid('created_by_internal_user_id').notNull(),
    createdByMembershipId: uuid('created_by_membership_id').notNull(),
    createdByDisplayName: text('created_by_display_name').notNull(),
    completedByInternalUserId: uuid('completed_by_internal_user_id'),
    completedByMembershipId: uuid('completed_by_membership_id'),
    completedByDisplayName: text('completed_by_display_name'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    blockageReason: text('blockage_reason'),
    blockedByInternalUserId: uuid('blocked_by_internal_user_id'),
    blockedByMembershipId: uuid('blocked_by_membership_id'),
    blockedByDisplayName: text('blocked_by_display_name'),
    blockedAt: timestamp('blocked_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),
    cancelledByInternalUserId: uuid('cancelled_by_internal_user_id'),
    cancelledByMembershipId: uuid('cancelled_by_membership_id'),
    cancelledByDisplayName: text('cancelled_by_display_name'),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    const completion = [
      table.completedAt,
      table.completedByMembershipId,
      table.completedByInternalUserId,
      table.completedByDisplayName,
    ];
    const blockage = [
      table.blockageReason,
      table.blockedAt,
      table.blockedByMembershipId,
      table.blockedByInternalUserId,
      table.blockedByDisplayName,
    ];
    const cancellation = [
      table.cancellationReason,
      table.cancelledAt,
      table.cancelledByMembershipId,
      table.cancelledByInternalUserId,
      table.cancelledByDisplayName,
    ];
    return [
      uniqueIndex('tasks_scope_id_unique').on(
        table.workspaceId,
        table.companyId,
        table.id,
      ),
      foreignKey({
        name: 'tasks_project_fk',
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
        name: 'tasks_assignee_fk',
        columns: [table.workspaceId, table.assigneeMembershipId],
        foreignColumns: [
          workspaceMemberships.workspaceId,
          workspaceMemberships.id,
        ],
      }),
      foreignKey({
        name: 'tasks_creator_fk',
        columns: [
          table.workspaceId,
          table.createdByMembershipId,
          table.createdByInternalUserId,
        ],
        foreignColumns: [
          workspaceMemberships.workspaceId,
          workspaceMemberships.id,
          workspaceMemberships.internalUserId,
        ],
      }),
      foreignKey({
        name: 'tasks_completion_actor_fk',
        columns: [
          table.workspaceId,
          table.completedByMembershipId,
          table.completedByInternalUserId,
        ],
        foreignColumns: [
          workspaceMemberships.workspaceId,
          workspaceMemberships.id,
          workspaceMemberships.internalUserId,
        ],
      }),
      check(
        'tasks_title_check',
        sql`length(${table.title}) BETWEEN 1 AND 200 AND ${table.title} = btrim(${table.title})`,
      ),
      check('tasks_version_check', sql`${table.version} >= 1`),
      check(
        'tasks_assignee_check',
        sql`(${table.assigneeMembershipId} IS NULL) = (${table.assigneeDisplayLabel} IS NULL)`,
      ),
      check(
        'tasks_date_check',
        sql`${table.dueDate} IS NULL OR (${table.dueDate} >= DATE '0001-01-01' AND ${table.dueDate} <= DATE '9999-12-31')`,
      ),
      check(
        'tasks_priority_check',
        sql`${table.priority} IN ('normal', 'important', 'critical')`,
      ),
      foreignKey({
        name: 'tasks_blockage_actor_fk',
        columns: [
          table.workspaceId,
          table.blockedByMembershipId,
          table.blockedByInternalUserId,
        ],
        foreignColumns: [
          workspaceMemberships.workspaceId,
          workspaceMemberships.id,
          workspaceMemberships.internalUserId,
        ],
      }),
      foreignKey({
        name: 'tasks_cancellation_actor_fk',
        columns: [
          table.workspaceId,
          table.cancelledByMembershipId,
          table.cancelledByInternalUserId,
        ],
        foreignColumns: [
          workspaceMemberships.workspaceId,
          workspaceMemberships.id,
          workspaceMemberships.internalUserId,
        ],
      }),
      check(
        'tasks_blockage_reason_check',
        sql`${table.blockageReason} IS NULL OR (length(${table.blockageReason}) BETWEEN 1 AND 500 AND ${table.blockageReason} = btrim(${table.blockageReason}))`,
      ),
      check(
        'tasks_cancellation_reason_check',
        sql`${table.cancellationReason} IS NULL OR (length(${table.cancellationReason}) BETWEEN 1 AND 500 AND ${table.cancellationReason} = btrim(${table.cancellationReason}))`,
      ),
      // Each state carries exactly its own current declaration; every other declaration is retired.
      check(
        'tasks_state_check',
        sql`(${table.status} IN ('todo', 'in_progress') AND ${absent(completion)} AND ${absent(blockage)} AND ${absent(cancellation)})
        OR (${table.status} = 'blocked' AND ${absent(completion)} AND ${present(blockage)} AND ${absent(cancellation)})
        OR (${table.status} = 'done' AND ${present(completion)} AND ${absent(blockage)} AND ${absent(cancellation)})
        OR (${table.status} = 'cancelled' AND ${absent(completion)} AND ${absent(blockage)} AND ${present(cancellation)})`,
      ),
    ];
  },
);
function absent(columns: SQLWrapper[]) {
  return sql.join(
    columns.map((column) => sql`${column} IS NULL`),
    sql` AND `,
  );
}
function present(columns: SQLWrapper[]) {
  return sql.join(
    columns.map((column) => sql`${column} IS NOT NULL`),
    sql` AND `,
  );
}

export const taskCommands = pgTable(
  'task_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    taskId: uuid('task_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    command: text('command').notNull(),
    result: jsonb('result').$type<unknown>().notNull(),
  },
  (table) => [
    uniqueIndex('task_commands_actor_key_unique').on(
      table.workspaceId,
      table.actorMembershipId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: 'task_commands_task_fk',
      columns: [table.workspaceId, table.companyId, table.taskId],
      foreignColumns: [tasks.workspaceId, tasks.companyId, tasks.id],
    }),
    foreignKey({
      name: 'task_commands_actor_fk',
      columns: [table.workspaceId, table.actorMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
  ],
);
export const taskEvents = pgTable(
  'task_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    taskId: uuid('task_id').notNull(),
    version: integer('version').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    meaning: jsonb('meaning').$type<unknown>().notNull(),
  },
  (table) => [
    uniqueIndex('task_events_version_unique').on(
      table.workspaceId,
      table.taskId,
      table.version,
    ),
    foreignKey({
      name: 'task_events_task_fk',
      columns: [table.workspaceId, table.companyId, table.taskId],
      foreignColumns: [tasks.workspaceId, tasks.companyId, tasks.id],
    }),
    foreignKey({
      name: 'task_events_actor_fk',
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
    check('task_events_version_check', sql`${table.version} >= 1`),
  ],
);
