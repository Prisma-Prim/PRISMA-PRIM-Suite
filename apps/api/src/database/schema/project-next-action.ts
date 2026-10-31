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
import { companyRoleAssignments, workspaceMemberships } from './core.js';
import { projects } from './project.js';

function scope() {
  return {
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id').notNull(),
    originalClientAccountId: uuid('original_client_account_id').notNull(),
  };
}
function attribution() {
  return {
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  };
}
export const projectNextActionHistory = pgTable(
  'project_next_action_history',
  {
    ...scope(),
    ...attribution(),
    id: uuid('id').defaultRandom().primaryKey(),
    revision: integer('revision').notNull(),
    predecessorRevision: integer('predecessor_revision').notNull(),
    beforeText: text('before_text'),
    text: text('text'),
    lifecycleRevision: integer('lifecycle_revision').notNull(),
    clientUseVersion: integer('client_use_version').notNull(),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => companyRoleAssignments.id),
  },
  (t) => [
    unique('pna_history_scope_revision_unique').on(
      t.workspaceId,
      t.companyId,
      t.projectId,
      t.revision,
    ),
    foreignKey({
      name: 'pna_history_project_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.originalClientAccountId,
        t.projectId,
      ],
      foreignColumns: [
        projects.workspaceId,
        projects.companyId,
        projects.clientAccountId,
        projects.id,
      ],
    }),
    foreignKey({
      name: 'pna_history_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId, t.actorInternalUserId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'pna_history_revision_check',
      sql`${t.revision}>0 AND ${t.predecessorRevision}=${t.revision}-1 AND ${t.lifecycleRevision}>=0 AND ${t.clientUseVersion}>0`,
    ),
    check(
      'pna_history_material_check',
      sql`${t.beforeText} IS DISTINCT FROM ${t.text}`,
    ),
    check(
      'pna_history_text_bound',
      sql`pna_text_valid(${t.text}) AND pna_text_valid(${t.beforeText})`,
    ),
    check(
      'pna_history_timestamp_check',
      sql`date_trunc('milliseconds',${t.occurredAt})=${t.occurredAt}`,
    ),
  ],
);

export const projectNextActionHeads = pgTable(
  'project_next_action_heads',
  {
    ...scope(),
    ...attribution(),
    revision: integer('revision').notNull(),
    text: text('text'),
  },
  (t) => [
    uniqueIndex('pna_head_project_unique').on(t.projectId),
    foreignKey({
      name: 'pna_head_project_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.originalClientAccountId,
        t.projectId,
      ],
      foreignColumns: [
        projects.workspaceId,
        projects.companyId,
        projects.clientAccountId,
        projects.id,
      ],
    }),
    foreignKey({
      name: 'pna_head_history_fk',
      columns: [t.workspaceId, t.companyId, t.projectId, t.revision],
      foreignColumns: [
        projectNextActionHistory.workspaceId,
        projectNextActionHistory.companyId,
        projectNextActionHistory.projectId,
        projectNextActionHistory.revision,
      ],
    }),
    foreignKey({
      name: 'pna_head_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId, t.actorInternalUserId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check('pna_head_revision_check', sql`${t.revision}>0`),
    check('pna_head_text_bound', sql`pna_text_valid(${t.text})`),
    check(
      'pna_head_timestamp_check',
      sql`date_trunc('milliseconds',${t.occurredAt})=${t.occurredAt}`,
    ),
  ],
);

export const projectNextActionCommands = pgTable(
  'project_next_action_commands',
  {
    ...scope(),
    id: uuid('id').defaultRandom().primaryKey(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => companyRoleAssignments.id),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    revision: integer('revision').notNull(),
    clientUseVersion: integer('client_use_version').notNull(),
    outcome: text('outcome', { enum: ['changed', 'unchanged'] }).notNull(),
    response: jsonb('response').$type<unknown>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('pna_command_actor_key_unique').on(
      t.workspaceId,
      t.actorMembershipId,
      t.idempotencyKey,
    ),
    uniqueIndex('pna_command_material_revision_unique')
      .on(t.workspaceId, t.companyId, t.projectId, t.revision)
      .where(sql`${t.outcome}='changed'`),
    foreignKey({
      name: 'pna_command_project_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.originalClientAccountId,
        t.projectId,
      ],
      foreignColumns: [
        projects.workspaceId,
        projects.companyId,
        projects.clientAccountId,
        projects.id,
      ],
    }),
    foreignKey({
      name: 'pna_command_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId, t.actorInternalUserId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'pna_command_revision_check',
      sql`${t.revision}>=0 AND ${t.outcome} IN ('changed','unchanged') AND (${t.outcome}<>'changed' OR ${t.revision}>0)`,
    ),
    check('pna_command_key_check', sql`length(${t.idempotencyKey})>0`),
    check('pna_command_client_use_check', sql`${t.clientUseVersion}>=0`),
  ],
);

/** Restricted internal Activity facts; no generic Activity/Home source selects this table. */
export const projectNextActionEvents = pgTable(
  'project_next_action_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id').notNull(),
    revision: integer('revision').notNull(),
    action: text('action').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    metadata: jsonb('metadata').$type<unknown>().notNull(),
  },
  (t) => [
    uniqueIndex('pna_event_revision_unique').on(
      t.workspaceId,
      t.companyId,
      t.projectId,
      t.revision,
    ),
    foreignKey({
      name: 'pna_event_history_fk',
      columns: [t.workspaceId, t.companyId, t.projectId, t.revision],
      foreignColumns: [
        projectNextActionHistory.workspaceId,
        projectNextActionHistory.companyId,
        projectNextActionHistory.projectId,
        projectNextActionHistory.revision,
      ],
    }),
    foreignKey({
      name: 'pna_event_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId, t.actorInternalUserId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'pna_event_check',
      sql`${t.action}='project.next_action.updated' AND ${t.metadata}=jsonb_build_object('revision',${t.revision})`,
    ),
  ],
);
