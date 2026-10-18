import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { workspaceMemberships } from './core.js';
import { projectTemplateInstances } from './project-template.js';

/** Immutable transition and event source. Task gate evidence stays out of its Activity projection. */
export const projectStageTransitions = pgTable(
  'project_stage_transitions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id').notNull(),
    stageRevision: integer('stage_revision').notNull(),
    fromStageKey: text('from_stage_key').notNull(),
    fromStageTitle: text('from_stage_title').notNull(),
    toStageKey: text('to_stage_key').notNull(),
    toStageTitle: text('to_stage_title').notNull(),
    requiredTasks: jsonb('required_tasks').$type<unknown>().notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('project_stage_transitions_scope_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.projectId,
      table.id,
    ),
    unique('project_stage_transitions_revision_unique').on(
      table.workspaceId,
      table.projectId,
      table.stageRevision,
    ),
    foreignKey({
      name: 'project_stage_transitions_instance_fk',
      columns: [table.workspaceId, table.companyId, table.projectId],
      foreignColumns: [
        projectTemplateInstances.workspaceId,
        projectTemplateInstances.companyId,
        projectTemplateInstances.projectId,
      ],
    }),
    foreignKey({
      name: 'project_stage_transitions_actor_fk',
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
      'project_stage_transitions_transition_check',
      sql`${table.stageRevision} = 1 AND ${table.fromStageKey} = 'scoping' AND ${table.toStageKey} = 'preparation'`,
    ),
    check(
      'project_stage_transitions_proof_check',
      sql`jsonb_typeof(${table.requiredTasks}) = 'array' AND jsonb_array_length(${table.requiredTasks}) = 2`,
    ),
  ],
);
export const projectStageCommands = pgTable(
  'project_stage_commands',
  {
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    transitionId: uuid('transition_id').notNull(),
  },
  (table) => [
    uniqueIndex('project_stage_commands_actor_key_unique').on(
      table.workspaceId,
      table.actorMembershipId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: 'project_stage_commands_transition_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.projectId,
        table.transitionId,
      ],
      foreignColumns: [
        projectStageTransitions.workspaceId,
        projectStageTransitions.companyId,
        projectStageTransitions.projectId,
        projectStageTransitions.id,
      ],
    }),
    foreignKey({
      name: 'project_stage_commands_actor_fk',
      columns: [table.workspaceId, table.actorMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
  ],
);
