import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { workspaceMemberships } from './core.js';
import { projects } from './project.js';
import { tasks } from './task.js';

/** Immutable copied source and actor-scoped full creation intent, not live configuration. */
export const projectTemplateInstances = pgTable(
  'project_template_instances',
  {
    projectId: uuid('project_id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    clientAccountId: uuid('client_account_id').notNull(),
    createdByMembershipId: uuid('created_by_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    snapshot: jsonb('snapshot').$type<unknown>().notNull(),
    currentStageKey: text('current_stage_key'),
    stageRevision: integer('stage_revision').default(0).notNull(),
  },
  (table) => [
    uniqueIndex('project_template_instances_scope_project_unique').on(
      table.workspaceId,
      table.companyId,
      table.projectId,
    ),
    uniqueIndex('project_template_instances_actor_key_unique').on(
      table.workspaceId,
      table.createdByMembershipId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: 'project_template_instances_project_fk',
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
      name: 'project_template_instances_actor_fk',
      columns: [table.workspaceId, table.createdByMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'project_template_instances_progress_check',
      sql`(${table.stageRevision} = 0 AND ${table.currentStageKey} IS NULL) OR (${table.stageRevision} = 1 AND ${table.currentStageKey} = 'preparation')`,
    ),
    check(
      'project_template_instances_snapshot_check',
      sql`jsonb_typeof(${table.snapshot}) = 'object'`,
    ),
    check(
      'project_template_instances_pilot_progress_check',
      sql`${table.snapshot}->>'templateKey' <> 'CONSULTING_MISSION_PILOT_ILLUSTRATIVE' OR (${table.stageRevision} = 0 AND ${table.currentStageKey} IS NULL)`,
    ),
  ],
);

export const projectTemplateTaskCopies = pgTable(
  'project_template_task_copies',
  {
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id').notNull(),
    taskId: uuid('task_id').notNull(),
    position: integer('position').notNull(),
  },
  (table) => [
    uniqueIndex('project_template_task_copies_review_scope_unique').on(
      table.workspaceId,
      table.companyId,
      table.projectId,
      table.taskId,
      table.position,
    ),
    uniqueIndex('project_template_task_copies_task_unique').on(
      table.workspaceId,
      table.companyId,
      table.taskId,
    ),
    uniqueIndex('project_template_task_copies_position_unique').on(
      table.workspaceId,
      table.companyId,
      table.projectId,
      table.position,
    ),
    foreignKey({
      name: 'project_template_task_copies_instance_fk',
      columns: [table.workspaceId, table.companyId, table.projectId],
      foreignColumns: [
        projectTemplateInstances.workspaceId,
        projectTemplateInstances.companyId,
        projectTemplateInstances.projectId,
      ],
    }),
    foreignKey({
      name: 'project_template_task_copies_task_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.projectId,
        table.taskId,
      ],
      foreignColumns: [
        tasks.workspaceId,
        tasks.companyId,
        tasks.projectId,
        tasks.id,
      ],
    }),
    check(
      'project_template_task_copies_position_check',
      sql`${table.position} BETWEEN 0 AND 12`,
    ),
  ],
);
