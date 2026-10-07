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
import { opportunities } from './commercial-intake.js';
import { companies, workspaceMemberships } from './core.js';

// A head of zero exists only during first submission. The migration's deferred
// head check requires the committed identity to reference an actual version.
// Its update guard permits only head+1; identity and history never repoint.
export const profitabilityEstimates = pgTable(
  'profitability_estimates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    opportunityId: uuid('opportunity_id').notNull(),
    clientRequestId: uuid('client_request_id').notNull(),
    latestVersionNumber: integer('latest_version_number').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('profitability_estimates_opportunity_unique').on(
      table.workspaceId,
      table.companyId,
      table.opportunityId,
    ),
    uniqueIndex('profitability_estimates_scope_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
    ),
    uniqueIndex('profitability_estimates_identity_unique').on(
      table.workspaceId,
      table.companyId,
      table.opportunityId,
      table.clientRequestId,
      table.id,
    ),
    foreignKey({
      name: 'profitability_estimates_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'profitability_estimates_opportunity_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.clientRequestId,
        table.opportunityId,
      ],
      foreignColumns: [
        opportunities.workspaceId,
        opportunities.companyId,
        opportunities.clientRequestId,
        opportunities.id,
      ],
    }),
    check(
      'profitability_estimates_head_check',
      sql`${table.latestVersionNumber} >= 0`,
    ),
  ],
);

// Inputs/results are JSON decimal strings, never numeric columns. Database
// JSON remains unknown until the profitability read boundary proves its shape.
export const profitabilityEstimateVersions = pgTable(
  'profitability_estimate_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    estimateId: uuid('estimate_id').notNull(),
    opportunityId: uuid('opportunity_id').notNull(),
    clientRequestId: uuid('client_request_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    predecessorVersionId: uuid('predecessor_version_id'),
    predecessorVersionNumber: integer('predecessor_version_number'),
    inputs: jsonb('inputs').$type<unknown>().notNull(),
    results: jsonb('results').$type<unknown>().notNull(),
    calculationRule: jsonb('calculation_rule').$type<unknown>().notNull(),
    createdByWorkspaceMembershipId: uuid(
      'created_by_workspace_membership_id',
    ).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('profitability_estimate_versions_number_unique').on(
      table.workspaceId,
      table.companyId,
      table.estimateId,
      table.versionNumber,
    ),
    uniqueIndex('profitability_estimate_versions_scope_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
    ),
    uniqueIndex('profitability_estimate_versions_opportunity_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.opportunityId,
      table.id,
    ),
    uniqueIndex('profitability_estimate_versions_identity_unique').on(
      table.workspaceId,
      table.companyId,
      table.estimateId,
      table.opportunityId,
      table.clientRequestId,
      table.id,
      table.versionNumber,
    ),
    uniqueIndex('profitability_estimate_versions_predecessor_unique').on(
      table.workspaceId,
      table.companyId,
      table.estimateId,
      table.id,
      table.versionNumber,
    ),
    foreignKey({
      name: 'profitability_estimate_versions_estimate_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.opportunityId,
        table.clientRequestId,
        table.estimateId,
      ],
      foreignColumns: [
        profitabilityEstimates.workspaceId,
        profitabilityEstimates.companyId,
        profitabilityEstimates.opportunityId,
        profitabilityEstimates.clientRequestId,
        profitabilityEstimates.id,
      ],
    }),
    foreignKey({
      name: 'profitability_estimate_versions_predecessor_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.estimateId,
        table.predecessorVersionId,
        table.predecessorVersionNumber,
      ],
      foreignColumns: [
        table.workspaceId,
        table.companyId,
        table.estimateId,
        table.id,
        table.versionNumber,
      ],
    }),
    foreignKey({
      name: 'profitability_estimate_versions_creator_fk',
      columns: [table.workspaceId, table.createdByWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'profitability_estimate_versions_predecessor_check',
      sql`(
      (${table.versionNumber} = 1 AND ${table.predecessorVersionId} IS NULL AND ${table.predecessorVersionNumber} IS NULL)
      OR (${table.versionNumber} > 1 AND ${table.predecessorVersionId} IS NOT NULL
        AND ${table.predecessorVersionNumber} IS NOT NULL
        AND ${table.predecessorVersionNumber} = ${table.versionNumber} - 1)
    )`,
    ),
    check(
      'profitability_estimate_versions_payload_check',
      sql`jsonb_typeof(${table.inputs}) = 'object'
      AND jsonb_typeof(${table.results}) = 'object'
      AND ${table.calculationRule} = '{"id":"CONFIRMED_COST_PROFITABILITY","version":1,"monetaryScale":2,"percentageScale":2,"rounding":"HALF_UP"}'::jsonb`,
    ),
  ],
);

export const profitabilityEstimateDecisions = pgTable(
  'profitability_estimate_decisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    estimateId: uuid('estimate_id').notNull(),
    opportunityId: uuid('opportunity_id').notNull(),
    clientRequestId: uuid('client_request_id').notNull(),
    versionId: uuid('version_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    code: text('code', { enum: ['APPROVE', 'MODIFY', 'REJECT'] }).notNull(),
    decidedByWorkspaceMembershipId: uuid(
      'decided_by_workspace_membership_id',
    ).notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('profitability_estimate_decisions_version_unique').on(
      table.workspaceId,
      table.companyId,
      table.versionId,
    ),
    foreignKey({
      name: 'profitability_estimate_decisions_version_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.estimateId,
        table.opportunityId,
        table.clientRequestId,
        table.versionId,
        table.versionNumber,
      ],
      foreignColumns: [
        profitabilityEstimateVersions.workspaceId,
        profitabilityEstimateVersions.companyId,
        profitabilityEstimateVersions.estimateId,
        profitabilityEstimateVersions.opportunityId,
        profitabilityEstimateVersions.clientRequestId,
        profitabilityEstimateVersions.id,
        profitabilityEstimateVersions.versionNumber,
      ],
    }),
    foreignKey({
      name: 'profitability_estimate_decisions_actor_fk',
      columns: [table.workspaceId, table.decidedByWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'profitability_estimate_decisions_code_check',
      sql`${table.code} IN ('APPROVE', 'MODIFY', 'REJECT')`,
    ),
  ],
);

export const profitabilityEstimateReceipts = pgTable(
  'profitability_estimate_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    commandKind: text('command_kind', { enum: ['create', 'decide'] }).notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    opportunityId: uuid('opportunity_id').notNull(),
    versionId: uuid('version_id').notNull(),
    response: jsonb('response').$type<unknown>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('profitability_estimate_receipts_actor_key_unique').on(
      table.workspaceId,
      table.companyId,
      table.actorWorkspaceMembershipId,
      table.commandKind,
      table.idempotencyKey,
    ),
    foreignKey({
      name: 'profitability_estimate_receipts_actor_fk',
      columns: [table.workspaceId, table.actorWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'profitability_estimate_receipts_opportunity_fk',
      columns: [table.workspaceId, table.companyId, table.opportunityId],
      foreignColumns: [
        opportunities.workspaceId,
        opportunities.companyId,
        opportunities.id,
      ],
    }),
    foreignKey({
      name: 'profitability_estimate_receipts_version_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.opportunityId,
        table.versionId,
      ],
      foreignColumns: [
        profitabilityEstimateVersions.workspaceId,
        profitabilityEstimateVersions.companyId,
        profitabilityEstimateVersions.opportunityId,
        profitabilityEstimateVersions.id,
      ],
    }),
    check(
      'profitability_estimate_receipts_shape_check',
      sql`${table.commandKind} IN ('create', 'decide')
      AND length(${table.idempotencyKey}) > 0 AND length(${table.fingerprint}) > 0
      AND jsonb_typeof(${table.response}) = 'object'`,
    ),
  ],
);

// Events deliberately have no read projection. Strict metadata contains only
// the estimate identifier, exact version and optional Director decision code.
export const profitabilityEstimateEvents = pgTable(
  'profitability_estimate_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    estimateId: uuid('estimate_id').notNull(),
    versionId: uuid('version_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    opportunityId: uuid('opportunity_id').notNull(),
    clientRequestId: uuid('client_request_id').notNull(),
    action: text('action', {
      enum: [
        'profitability_estimate_version.created',
        'profitability_estimate_version.decided',
      ],
    }).notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    metadata: jsonb('metadata').$type<unknown>().notNull(),
  },
  (table) => [
    uniqueIndex('profitability_estimate_events_version_action_unique').on(
      table.workspaceId,
      table.companyId,
      table.versionId,
      table.action,
    ),
    foreignKey({
      name: 'profitability_estimate_events_version_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.estimateId,
        table.opportunityId,
        table.clientRequestId,
        table.versionId,
        table.versionNumber,
      ],
      foreignColumns: [
        profitabilityEstimateVersions.workspaceId,
        profitabilityEstimateVersions.companyId,
        profitabilityEstimateVersions.estimateId,
        profitabilityEstimateVersions.opportunityId,
        profitabilityEstimateVersions.clientRequestId,
        profitabilityEstimateVersions.id,
        profitabilityEstimateVersions.versionNumber,
      ],
    }),
    foreignKey({
      name: 'profitability_estimate_events_actor_fk',
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
      'profitability_estimate_events_metadata_check',
      sql`(CASE
      WHEN ${table.action} = 'profitability_estimate_version.created' THEN
        ${table.metadata} = jsonb_build_object('estimateId', ${table.estimateId}::text, 'versionNumber', ${table.versionNumber})
      WHEN ${table.action} = 'profitability_estimate_version.decided' THEN
        ${table.metadata}->>'decisionCode' IN ('APPROVE', 'MODIFY', 'REJECT')
        AND ${table.metadata} = jsonb_build_object('estimateId', ${table.estimateId}::text, 'versionNumber', ${table.versionNumber}, 'decisionCode', ${table.metadata}->>'decisionCode')
      ELSE false END) IS TRUE`,
    ),
  ],
);
