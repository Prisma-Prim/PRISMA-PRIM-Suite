import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { PROJECT_STATUSES } from '../../project/project-lifecycle.types.js';
import { clientAccounts, companies, workspaceMemberships } from './core.js';

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    clientAccountId: uuid('client_account_id').notNull(),
    title: text('title').notNull(),
    status: text('status', { enum: PROJECT_STATUSES })
      .default('preparatory')
      .notNull(),
    createdByInternalUserId: uuid('created_by_internal_user_id').notNull(),
    createdByWorkspaceMembershipId: uuid(
      'created_by_workspace_membership_id',
    ).notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    // The accountable member and the label captured when they were named.
    responsibleMembershipId: uuid('responsible_membership_id'),
    responsibleDisplayLabel: text('responsible_display_label'),
    responsibilityRevision: integer('responsibility_revision')
      .default(0)
      .notNull(),
    responsibilityChangedByInternalUserId: uuid(
      'responsibility_changed_by_internal_user_id',
    ),
    responsibilityChangedByMembershipId: uuid(
      'responsibility_changed_by_membership_id',
    ),
    responsibilityChangedByDisplayName: text(
      'responsibility_changed_by_display_name',
    ),
    responsibilityChangedAt: timestamp('responsibility_changed_at', {
      withTimezone: true,
    }),
    // The lifecycle version token (Project/Task PRD section 23), separate
    // from the responsibility revision.
    lifecycleRevision: integer('lifecycle_revision').default(0).notNull(),
  },
  (table) => [
    uniqueIndex('projects_workspace_id_id_unique').on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex('projects_original_scope_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.clientAccountId,
      table.id,
    ),
    uniqueIndex('projects_scope_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
    ),
    uniqueIndex('projects_actor_key_unique').on(
      table.workspaceId,
      table.createdByWorkspaceMembershipId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: 'projects_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'projects_client_fk',
      columns: [table.workspaceId, table.clientAccountId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    foreignKey({
      name: 'projects_creator_fk',
      columns: [
        table.workspaceId,
        table.createdByWorkspaceMembershipId,
        table.createdByInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    foreignKey({
      name: 'projects_responsible_fk',
      columns: [table.workspaceId, table.responsibleMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'projects_responsibility_changed_by_fk',
      columns: [
        table.workspaceId,
        table.responsibilityChangedByMembershipId,
        table.responsibilityChangedByInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'projects_title_check',
      sql`length(${table.title}) BETWEEN 1 AND 200 AND ${table.title} = btrim(${table.title})`,
    ),
    check(
      'projects_status_check',
      sql`${table.status} IN ('preparatory', 'active', 'on_hold', 'completed', 'cancelled')`,
    ),
    // Only a committed transition leaves `preparatory`, and none returns to it.
    check(
      'projects_lifecycle_revision_check',
      sql`${table.lifecycleRevision} >= 0 AND (${table.status} = 'preparatory') = (${table.lifecycleRevision} = 0)`,
    ),
    // An active or on-hold Project always has a responsible member.
    check(
      'projects_lifecycle_responsible_check',
      sql`${table.status} NOT IN ('active', 'on_hold') OR ${table.responsibleMembershipId} IS NOT NULL`,
    ),
    check(
      'projects_responsible_check',
      sql`(${table.responsibleMembershipId} IS NULL) = (${table.responsibleDisplayLabel} IS NULL)`,
    ),
    // Revision 0 means no responsible member was ever named; every later
    // revision carries the attribution of its last change.
    check(
      'projects_responsibility_revision_check',
      sql`(
        (${table.responsibilityRevision} = 0
          AND ${table.responsibleMembershipId} IS NULL
          AND ${table.responsibilityChangedByInternalUserId} IS NULL
          AND ${table.responsibilityChangedByMembershipId} IS NULL
          AND ${table.responsibilityChangedByDisplayName} IS NULL
          AND ${table.responsibilityChangedAt} IS NULL)
        OR
        (${table.responsibilityRevision} >= 1
          AND ${table.responsibilityChangedByInternalUserId} IS NOT NULL
          AND ${table.responsibilityChangedByMembershipId} IS NOT NULL
          AND ${table.responsibilityChangedByDisplayName} IS NOT NULL
          AND ${table.responsibilityChangedAt} IS NOT NULL)
      )`,
    ),
  ],
);

// One durable receipt per actor/Workspace key. Every successful outcome's
// requested target equals its resulting responsible member.
export const projectResponsibilityCommands = pgTable(
  'project_responsibility_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    expectedRevision: integer('expected_revision').notNull(),
    resultRevision: integer('result_revision').notNull(),
    outcome: text('outcome', { enum: ['changed', 'unchanged'] }).notNull(),
    responsibleMembershipId: uuid('responsible_membership_id'),
    responsibleDisplayLabel: text('responsible_display_label'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('project_responsibility_commands_actor_key_unique').on(
      table.workspaceId,
      table.actorMembershipId,
      table.idempotencyKey,
    ),
    uniqueIndex('project_responsibility_commands_revision_unique')
      .on(table.workspaceId, table.projectId, table.resultRevision)
      .where(sql`${table.outcome} = 'changed'`),
    foreignKey({
      name: 'project_responsibility_commands_project_fk',
      columns: [table.workspaceId, table.companyId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.companyId, projects.id],
    }),
    foreignKey({
      name: 'project_responsibility_commands_actor_fk',
      columns: [table.workspaceId, table.actorMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'project_responsibility_commands_responsible_fk',
      columns: [table.workspaceId, table.responsibleMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'project_responsibility_commands_outcome_check',
      sql`${table.expectedRevision} >= 0 AND (
        (${table.outcome} = 'changed'
          AND ${table.resultRevision} = (${table.expectedRevision})::bigint + 1)
        OR
        (${table.outcome} = 'unchanged'
          AND ${table.resultRevision} = ${table.expectedRevision})
      )`,
    ),
    check(
      'project_responsibility_commands_responsible_check',
      sql`(${table.responsibleMembershipId} IS NULL) = (${table.responsibleDisplayLabel} IS NULL)`,
    ),
  ],
);

// The append-only `project.responsible.changed` history, one row per material
// change. Before and after keep only a membership identifier and its label.
export const projectResponsibilityEvents = pgTable(
  'project_responsibility_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id').notNull(),
    revision: integer('revision').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    beforeMembershipId: uuid('before_membership_id'),
    beforeDisplayLabel: text('before_display_label'),
    afterMembershipId: uuid('after_membership_id'),
    afterDisplayLabel: text('after_display_label'),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('project_responsibility_events_revision_unique').on(
      table.workspaceId,
      table.projectId,
      table.revision,
    ),
    foreignKey({
      name: 'project_responsibility_events_project_fk',
      columns: [table.workspaceId, table.companyId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.companyId, projects.id],
    }),
    foreignKey({
      name: 'project_responsibility_events_actor_fk',
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
    foreignKey({
      name: 'project_responsibility_events_before_fk',
      columns: [table.workspaceId, table.beforeMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'project_responsibility_events_after_fk',
      columns: [table.workspaceId, table.afterMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'project_responsibility_events_revision_check',
      sql`${table.revision} >= 1`,
    ),
    check(
      'project_responsibility_events_members_check',
      sql`(${table.beforeMembershipId} IS NULL) = (${table.beforeDisplayLabel} IS NULL)
        AND (${table.afterMembershipId} IS NULL) = (${table.afterDisplayLabel} IS NULL)
        AND ${table.beforeMembershipId} IS DISTINCT FROM ${table.afterMembershipId}`,
    ),
  ],
);

export const projectCreationEvents = pgTable(
  'project_creation_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('project_creation_events_project_unique').on(
      table.workspaceId,
      table.projectId,
    ),
    foreignKey({
      name: 'project_creation_events_target_fk',
      columns: [table.workspaceId, table.companyId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.companyId, projects.id],
    }),
    foreignKey({
      name: 'project_creation_events_actor_fk',
      columns: [
        table.workspaceId,
        table.actorWorkspaceMembershipId,
        table.actorInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
  ],
);
