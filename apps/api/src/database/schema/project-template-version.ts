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
import { companies, workspaceMemberships } from './core.js';

/** Immutable Company successors. Version 1 remains solely the code-defined baseline. */
export const projectTemplateVersions = pgTable(
  'project_template_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    templateKey: text('template_key').notNull(),
    version: integer('version').notNull(),
    sourceVersion: integer('source_version').notNull(),
    snapshot: jsonb('snapshot').$type<unknown>().notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('project_template_versions_scope_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
    ),
    unique('project_template_versions_scope_version_unique').on(
      table.workspaceId,
      table.companyId,
      table.templateKey,
      table.version,
    ),
    foreignKey({
      name: 'project_template_versions_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'project_template_versions_actor_fk',
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
      'project_template_versions_lineage_check',
      sql`${table.templateKey} = 'CONSULTING_PREPARATION_ILLUSTRATIVE' AND ${table.version} > 1 AND ${table.sourceVersion} = ${table.version} - 1`,
    ),
    check(
      'project_template_versions_snapshot_check',
      sql`jsonb_typeof(${table.snapshot}) = 'object'`,
    ),
  ],
);

export const projectTemplateVersionCommands = pgTable(
  'project_template_version_commands',
  {
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    versionId: uuid('version_id').notNull(),
  },
  (table) => [
    uniqueIndex('project_template_version_commands_actor_key_unique').on(
      table.workspaceId,
      table.actorMembershipId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: 'project_template_version_commands_version_fk',
      columns: [table.workspaceId, table.companyId, table.versionId],
      foreignColumns: [
        projectTemplateVersions.workspaceId,
        projectTemplateVersions.companyId,
        projectTemplateVersions.id,
      ],
    }),
    foreignKey({
      name: 'project_template_version_commands_actor_fk',
      columns: [table.workspaceId, table.actorMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
  ],
);
