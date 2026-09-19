import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { clientAccounts, companies, workspaceMemberships } from './core.js';

export const projects = pgTable(
  'projects',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    clientAccountId: uuid('client_account_id').notNull(),
    title: text('title').notNull(),
    status: text('status', { enum: ['preparatory'] })
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
    check(
      'projects_title_check',
      sql`length(${table.title}) BETWEEN 1 AND 200 AND ${table.title} = btrim(${table.title})`,
    ),
    check('projects_preparatory_check', sql`${table.status} = 'preparatory'`),
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
