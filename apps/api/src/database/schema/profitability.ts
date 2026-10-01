import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { clientRequests, opportunities } from './commercial-intake.js';
import { companies, workspaceMemberships } from './core.js';
import type { ProfitabilityVersionRecord } from '../../profitability/profitability.types.js';

export const profitabilityEstimates = pgTable(
  'profitability_estimates',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    opportunityId: uuid('opportunity_id').notNull(),
    clientRequestId: uuid('client_request_id').notNull(),
    latestVersionNumber: integer('latest_version_number').notNull(),
  },
  (table) => [
    uniqueIndex('profitability_estimates_scope_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
    ),
    uniqueIndex('profitability_estimates_opportunity_unique').on(
      table.workspaceId,
      table.companyId,
      table.opportunityId,
    ),
    foreignKey({
      name: 'profitability_estimates_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'profitability_estimates_opportunity_fk',
      columns: [table.workspaceId, table.companyId, table.opportunityId],
      foreignColumns: [
        opportunities.workspaceId,
        opportunities.companyId,
        opportunities.id,
      ],
    }),
    foreignKey({
      name: 'profitability_estimates_request_fk',
      columns: [table.workspaceId, table.companyId, table.clientRequestId],
      foreignColumns: [
        clientRequests.workspaceId,
        clientRequests.companyId,
        clientRequests.id,
      ],
    }),
    check(
      'profitability_estimates_head_check',
      sql`${table.latestVersionNumber} > 0`,
    ),
  ],
);

export const profitabilityEstimateVersions = pgTable(
  'profitability_estimate_versions',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    estimateId: uuid('estimate_id').notNull(),
    opportunityId: uuid('opportunity_id').notNull(),
    clientRequestId: uuid('client_request_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    predecessorVersionId: uuid('predecessor_version_id'),
    currency: text('currency').notNull(),
    executorType: text('executor_type').notNull(),
    executorCost: numeric('executor_cost', {
      precision: 30,
      scale: 2,
    }).notNull(),
    fiscalCost: numeric('fiscal_cost', { precision: 30, scale: 2 }).notNull(),
    allocatedOverhead: numeric('allocated_overhead', {
      precision: 30,
      scale: 2,
    }).notNull(),
    targetProfitability: text('target_profitability').notNull(),
    proposedPrice: numeric('proposed_price', {
      precision: 30,
      scale: 2,
    }).notNull(),
    pricingIntent: text('pricing_intent').notNull(),
    strategicReason: text('strategic_reason'),
    costComplete: text('cost_complete').notNull(),
    noKnownDuplicate: text('no_known_duplicate').notNull(),
    totalCost: numeric('total_cost', { precision: 30, scale: 2 }).notNull(),
    profit: numeric('profit', { precision: 30, scale: 2 }).notNull(),
    estimatedProfitability: numeric('estimated_profitability', {
      precision: 30,
      scale: 2,
    }).notNull(),
    targetDifference: numeric('target_difference', {
      precision: 30,
      scale: 2,
    }).notNull(),
    calculationRuleId: text('calculation_rule_id').notNull(),
    calculationRuleVersion: integer('calculation_rule_version').notNull(),
    roundingMode: text('rounding_mode').notNull(),
    roundingScale: integer('rounding_scale').notNull(),
    createdByInternalUserId: uuid('created_by_internal_user_id').notNull(),
    createdByWorkspaceMembershipId: uuid(
      'created_by_workspace_membership_id',
    ).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('profitability_versions_scope_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
    ),
    uniqueIndex('profitability_versions_scope_id_number_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
      table.versionNumber,
    ),
    uniqueIndex('profitability_versions_number_unique').on(
      table.workspaceId,
      table.companyId,
      table.estimateId,
      table.versionNumber,
    ),
    foreignKey({
      name: 'profitability_versions_estimate_fk',
      columns: [table.workspaceId, table.companyId, table.estimateId],
      foreignColumns: [
        profitabilityEstimates.workspaceId,
        profitabilityEstimates.companyId,
        profitabilityEstimates.id,
      ],
    }),
    foreignKey({
      name: 'profitability_versions_creator_fk',
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
      'profitability_versions_fixed_rule_check',
      sql`${table.calculationRuleId} = 'CONFIRMED_COST_PROFITABILITY' AND ${table.calculationRuleVersion} = 1 AND ${table.roundingMode} = 'HALF_UP' AND ${table.roundingScale} = 2`,
    ),
    check(
      'profitability_versions_confirmation_check',
      sql`${table.costComplete} = 'true' AND ${table.noKnownDuplicate} = 'true'`,
    ),
  ],
);

export const profitabilityDirectCostLines = pgTable(
  'profitability_direct_cost_lines',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    estimateVersionId: uuid('estimate_version_id').notNull(),
    position: integer('position').notNull(),
    lineKey: text('line_key').notNull(),
    category: text('category').notNull(),
    label: text('label').notNull(),
    currency: text('currency').notNull(),
    amount: numeric('amount', { precision: 30, scale: 2 }).notNull(),
  },
  (table) => [
    uniqueIndex('profitability_lines_position_unique').on(
      table.workspaceId,
      table.companyId,
      table.estimateVersionId,
      table.position,
    ),
    uniqueIndex('profitability_lines_key_unique').on(
      table.workspaceId,
      table.companyId,
      table.estimateVersionId,
      table.lineKey,
    ),
    foreignKey({
      name: 'profitability_lines_version_fk',
      columns: [table.workspaceId, table.companyId, table.estimateVersionId],
      foreignColumns: [
        profitabilityEstimateVersions.workspaceId,
        profitabilityEstimateVersions.companyId,
        profitabilityEstimateVersions.id,
      ],
    }),
    check('profitability_lines_positive_check', sql`${table.amount} > 0`),
  ],
);

export const profitabilityDecisions = pgTable(
  'profitability_decisions',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    estimateVersionId: uuid('estimate_version_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    code: text('code').notNull(),
    decidedByInternalUserId: uuid('decided_by_internal_user_id').notNull(),
    decidedByWorkspaceMembershipId: uuid(
      'decided_by_workspace_membership_id',
    ).notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('profitability_decisions_version_unique').on(
      table.workspaceId,
      table.companyId,
      table.estimateVersionId,
    ),
    foreignKey({
      name: 'profitability_decisions_version_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.estimateVersionId,
        table.versionNumber,
      ],
      foreignColumns: [
        profitabilityEstimateVersions.workspaceId,
        profitabilityEstimateVersions.companyId,
        profitabilityEstimateVersions.id,
        profitabilityEstimateVersions.versionNumber,
      ],
    }),
    foreignKey({
      name: 'profitability_decisions_actor_fk',
      columns: [
        table.workspaceId,
        table.decidedByWorkspaceMembershipId,
        table.decidedByInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'profitability_decisions_code_check',
      sql`${table.code} IN ('APPROVE', 'MODIFY', 'REJECT')`,
    ),
  ],
);

export const profitabilityCommandReceipts = pgTable(
  'profitability_command_receipts',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    commandKind: text('command_kind').notNull(),
    requestKey: text('request_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    result: jsonb('result').$type<ProfitabilityVersionRecord>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('profitability_receipts_scope_key_unique').on(
      table.workspaceId,
      table.companyId,
      table.actorWorkspaceMembershipId,
      table.commandKind,
      table.requestKey,
    ),
    foreignKey({
      name: 'profitability_receipts_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'profitability_receipts_actor_fk',
      columns: [table.workspaceId, table.actorWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
  ],
);

export const profitabilityEvents = pgTable(
  'profitability_events',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    action: text('action').notNull(),
    estimateId: uuid('estimate_id').notNull(),
    estimateVersionId: uuid('estimate_version_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    metadata: jsonb('metadata')
      .$type<{
        estimateId: string;
        versionNumber: number;
        decisionCode?: string;
      }>()
      .notNull(),
  },
  (table) => [
    index('profitability_events_scope_idx').on(
      table.workspaceId,
      table.companyId,
      table.occurredAt,
    ),
    foreignKey({
      name: 'profitability_events_version_fk',
      columns: [table.workspaceId, table.companyId, table.estimateVersionId],
      foreignColumns: [
        profitabilityEstimateVersions.workspaceId,
        profitabilityEstimateVersions.companyId,
        profitabilityEstimateVersions.id,
      ],
    }),
    foreignKey({
      name: 'profitability_events_actor_fk',
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
      'profitability_events_action_check',
      sql`${table.action} IN ('profitability_estimate_version.created', 'profitability_estimate_version.decided')`,
    ),
  ],
);
