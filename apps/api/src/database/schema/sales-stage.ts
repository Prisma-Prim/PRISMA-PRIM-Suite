import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { SALES_STAGE_STATES } from '../../sales-stage/sales-stage.definition.js';
import { companies, workspaceMemberships } from './core.js';

// The configuration revision of one Company's Sales Stage list (Commercial
// Workflow PRD section 24.2). A Company without a row is at revision 0; the
// first committed operation records revision 1.
export const salesStageConfigurations = pgTable(
  'sales_stage_configurations',
  {
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    revision: integer('revision').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      name: 'sales_stage_configurations_pk',
      columns: [table.workspaceId, table.companyId],
    }),
    foreignKey({
      name: 'sales_stage_configurations_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    check(
      'sales_stage_configurations_revision_check',
      sql`${table.revision} >= 1`,
    ),
  ],
);

// One Company's Sales Stages (section 24.1). The identifier carries the
// stage's meaning; a label is tenant terminology, stored exactly as submitted
// and unique within the Company ignoring case. Positions 1 to 30, each used
// once, bound the list to 30 stages. A stage is never deleted.
export const salesStages = pgTable(
  'sales_stages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    label: text('label').notNull(),
    position: integer('position').notNull(),
    state: text('state', { enum: SALES_STAGE_STATES })
      .default('ACTIVE')
      .notNull(),
    createdByInternalUserId: uuid('created_by_internal_user_id').notNull(),
    createdByWorkspaceMembershipId: uuid(
      'created_by_workspace_membership_id',
    ).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('sales_stages_scope_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
    ),
    unique('sales_stages_position_unique').on(
      table.workspaceId,
      table.companyId,
      table.position,
    ),
    uniqueIndex('sales_stages_label_unique').on(
      table.workspaceId,
      table.companyId,
      sql`lower(${table.label})`,
    ),
    foreignKey({
      name: 'sales_stages_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'sales_stages_creator_fk',
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
      'sales_stages_label_check',
      sql`length(${table.label}) BETWEEN 1 AND 80 AND length(btrim(${table.label})) > 0`,
    ),
    check(
      'sales_stages_position_check',
      sql`${table.position} BETWEEN 1 AND 30`,
    ),
    check('sales_stages_state_check', sql`${table.state} = 'ACTIVE'`),
  ],
);

// Durable receipt of one Sales Stage configuration command, in its own key
// space. Each committed operation produces exactly one configuration
// revision, and the receipt keeps the stage as the command created it.
export const salesStageConfigurationCommands = pgTable(
  'sales_stage_configuration_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    operation: text('operation', { enum: ['CREATED'] }).notNull(),
    salesStageId: uuid('sales_stage_id').notNull(),
    label: text('label').notNull(),
    position: integer('position').notNull(),
    expectedRevision: integer('expected_revision').notNull(),
    resultRevision: integer('result_revision').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('sales_stage_configuration_commands_actor_key_unique').on(
      table.workspaceId,
      table.companyId,
      table.actorWorkspaceMembershipId,
      table.idempotencyKey,
    ),
    uniqueIndex('sales_stage_configuration_commands_revision_unique').on(
      table.workspaceId,
      table.companyId,
      table.resultRevision,
    ),
    foreignKey({
      name: 'sales_stage_configuration_commands_actor_fk',
      columns: [table.workspaceId, table.actorWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'sales_stage_configuration_commands_stage_fk',
      columns: [table.workspaceId, table.companyId, table.salesStageId],
      foreignColumns: [
        salesStages.workspaceId,
        salesStages.companyId,
        salesStages.id,
      ],
    }),
    check(
      'sales_stage_configuration_commands_revision_check',
      sql`${table.expectedRevision} >= 0 AND ${table.resultRevision} = (${table.expectedRevision})::bigint + 1`,
    ),
    check(
      'sales_stage_configuration_commands_operation_check',
      sql`${table.operation} = 'CREATED'`,
    ),
  ],
);

// The `sales_stage.configured` record of section 24.5, attributed to the
// acting membership and targeting the stage. Its metadata is exactly the
// operation, the resulting configuration revision and the label after it;
// one event per revision.
export const salesStageEvents = pgTable(
  'sales_stage_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    salesStageId: uuid('sales_stage_id').notNull(),
    action: text('action', { enum: ['sales_stage.configured'] }).notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    metadata: jsonb('metadata').$type<unknown>().notNull(),
  },
  (table) => [
    uniqueIndex('sales_stage_events_revision_unique').on(
      table.workspaceId,
      table.companyId,
      sql`(${table.metadata} ->> 'configurationRevision')`,
    ),
    foreignKey({
      name: 'sales_stage_events_stage_fk',
      columns: [table.workspaceId, table.companyId, table.salesStageId],
      foreignColumns: [
        salesStages.workspaceId,
        salesStages.companyId,
        salesStages.id,
      ],
    }),
    foreignKey({
      name: 'sales_stage_events_actor_fk',
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
    check(
      'sales_stage_events_action_metadata_check',
      sql`((${table.action} = 'sales_stage.configured'
        AND ${table.metadata} ->> 'operation' = 'CREATED'
        AND jsonb_typeof(${table.metadata} -> 'configurationRevision') = 'number'
        AND jsonb_typeof(${table.metadata} -> 'label') = 'string'
        AND ${table.metadata} = jsonb_build_object(
          'operation', 'CREATED',
          'configurationRevision', (${table.metadata} ->> 'configurationRevision')::integer,
          'label', ${table.metadata} ->> 'label')
        AND (${table.metadata} ->> 'configurationRevision')::integer >= 1
        AND length(${table.metadata} ->> 'label') BETWEEN 1 AND 80
        AND length(btrim(${table.metadata} ->> 'label')) > 0) IS TRUE)`,
    ),
  ],
);
