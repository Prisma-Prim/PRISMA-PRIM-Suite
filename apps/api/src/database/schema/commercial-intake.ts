import { sql } from 'drizzle-orm';
import {
  check,
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  OPPORTUNITY_LOSS_REASON_CODES,
  OPPORTUNITY_OUTCOME_STATUSES,
} from '../../commercial-intake/opportunity-outcome.js';
import { clientAccounts, companies, workspaceMemberships } from './core.js';
import { salesStages } from './sales-stage.js';

export const clientRequests = pgTable(
  'client_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    clientAccountId: uuid('client_account_id'),
    originalText: text('original_text').notNull(),
    sourceKind: text('source_kind', { enum: ['MANUAL_TEXT'] })
      .default('MANUAL_TEXT')
      .notNull(),
    sourceLabel: text('source_label'),
    reportedReceivedAt: timestamp('reported_received_at', {
      withTimezone: true,
    }),
    subject: text('subject'),
    capturedByInternalUserId: uuid('captured_by_internal_user_id').notNull(),
    capturedByWorkspaceMembershipId: uuid(
      'captured_by_workspace_membership_id',
    ).notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    version: integer('version').default(1).notNull(),
  },
  (table) => [
    uniqueIndex('client_requests_workspace_id_id_unique').on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex('client_requests_scope_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
    ),
    uniqueIndex('client_requests_offer_client_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
      table.clientAccountId,
    ),
    index('client_requests_company_newest_index').on(
      table.workspaceId,
      table.companyId,
      table.capturedAt,
      table.id,
    ),
    foreignKey({
      name: 'client_requests_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'client_requests_client_fk',
      columns: [table.workspaceId, table.clientAccountId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    foreignKey({
      name: 'client_requests_creator_fk',
      columns: [
        table.workspaceId,
        table.capturedByWorkspaceMembershipId,
        table.capturedByInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'client_requests_original_text_check',
      sql`length(${table.originalText}) BETWEEN 1 AND 20000 AND length(btrim(${table.originalText})) > 0`,
    ),
    check(
      'client_requests_source_label_check',
      sql`${table.sourceLabel} IS NULL OR length(${table.sourceLabel}) <= 120`,
    ),
    check(
      'client_requests_subject_check',
      sql`${table.subject} IS NULL OR length(${table.subject}) <= 200`,
    ),
    check(
      'client_requests_source_kind_check',
      sql`${table.sourceKind} = 'MANUAL_TEXT'`,
    ),
    check(
      'client_requests_version_check',
      sql`(
        ${table.version} = 1
        OR (${table.version} = 2 AND ${table.clientAccountId} IS NOT NULL)
      )`,
    ),
  ],
);

export const opportunities = pgTable(
  'opportunities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    clientRequestId: uuid('client_request_id').notNull(),
    initial: boolean('initial').default(true).notNull(),
    title: text('title').notNull(),
    scope: text('scope'),
    nextAction: text('next_action').notNull(),
    // The outcome status (Commercial Workflow PRD section 23). Capture enters
    // OPEN at the capture time; each later status is entered at the time of
    // its outcome history entry.
    status: text('status', { enum: OPPORTUNITY_OUTCOME_STATUSES })
      .default('OPEN')
      .notNull(),
    responsibleInternalUserId: uuid('responsible_internal_user_id').notNull(),
    responsibleWorkspaceMembershipId: uuid(
      'responsible_workspace_membership_id',
    ).notNull(),
    // The Sales Stage of the Opportunity's own Company (section 24.4), or
    // none. Capture assigns none.
    salesStageId: uuid('sales_stage_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    version: integer('version').default(1).notNull(),
    // Server-owned trace of the last material Opportunity mutation: a
    // next-action update, a responsible-actor change, an outcome status
    // change or a Sales Stage change. All stay null while the Opportunity is
    // still at its captured version 1.
    lastUpdatedByInternalUserId: uuid('last_updated_by_internal_user_id'),
    lastUpdatedByWorkspaceMembershipId: uuid(
      'last_updated_by_workspace_membership_id',
    ),
    lastUpdatedAt: timestamp('last_updated_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('opportunities_workspace_id_id_unique').on(
      table.workspaceId,
      table.id,
    ),
    uniqueIndex('opportunities_scope_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
    ),
    uniqueIndex('opportunities_request_identity_unique').on(
      table.workspaceId,
      table.companyId,
      table.clientRequestId,
      table.id,
    ),
    uniqueIndex('opportunities_initial_request_unique')
      .on(table.workspaceId, table.companyId, table.clientRequestId)
      .where(sql`${table.initial} = true`),
    foreignKey({
      name: 'opportunities_request_fk',
      columns: [table.workspaceId, table.companyId, table.clientRequestId],
      foreignColumns: [
        clientRequests.workspaceId,
        clientRequests.companyId,
        clientRequests.id,
      ],
    }),
    foreignKey({
      name: 'opportunities_responsible_fk',
      columns: [
        table.workspaceId,
        table.responsibleWorkspaceMembershipId,
        table.responsibleInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    foreignKey({
      name: 'opportunities_sales_stage_fk',
      columns: [table.workspaceId, table.companyId, table.salesStageId],
      foreignColumns: [
        salesStages.workspaceId,
        salesStages.companyId,
        salesStages.id,
      ],
    }),
    check(
      'opportunities_title_check',
      sql`length(${table.title}) BETWEEN 1 AND 160 AND length(btrim(${table.title})) > 0`,
    ),
    check(
      'opportunities_scope_check',
      sql`${table.scope} IS NULL OR length(${table.scope}) <= 2000`,
    ),
    check(
      'opportunities_next_action_check',
      sql`length(${table.nextAction}) BETWEEN 1 AND 500 AND length(btrim(${table.nextAction})) > 0`,
    ),
    foreignKey({
      name: 'opportunities_last_updated_by_fk',
      columns: [
        table.workspaceId,
        table.lastUpdatedByWorkspaceMembershipId,
        table.lastUpdatedByInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'opportunities_status_check',
      sql`${table.status} IN ('OPEN', 'ON_HOLD', 'WON', 'LOST', 'DISQUALIFIED', 'ARCHIVED')`,
    ),
    check('opportunities_version_check', sql`${table.version} >= 1`),
    check(
      'opportunities_last_update_check',
      sql`(
        (${table.version} = 1
          AND ${table.lastUpdatedByInternalUserId} IS NULL
          AND ${table.lastUpdatedByWorkspaceMembershipId} IS NULL
          AND ${table.lastUpdatedAt} IS NULL)
        OR
        (${table.version} >= 2
          AND ${table.lastUpdatedByInternalUserId} IS NOT NULL
          AND ${table.lastUpdatedByWorkspaceMembershipId} IS NOT NULL
          AND ${table.lastUpdatedAt} IS NOT NULL)
      )`,
    ),
  ],
);

// Durable receipt of one next-action command. An unchanged outcome records a
// no-op at the observed version; an updated outcome records the version it
// produced, and only one updated command may produce a given version.
export const commercialIntakeNextActionCommands = pgTable(
  'commercial_intake_next_action_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    opportunityId: uuid('opportunity_id').notNull(),
    expectedVersion: integer('expected_version').notNull(),
    resultVersion: integer('result_version').notNull(),
    outcome: text('outcome', { enum: ['updated', 'unchanged'] }).notNull(),
    nextAction: text('next_action').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('commercial_intake_next_action_commands_actor_key_unique').on(
      table.workspaceId,
      table.companyId,
      table.actorWorkspaceMembershipId,
      table.idempotencyKey,
    ),
    uniqueIndex('commercial_intake_next_action_commands_version_unique')
      .on(table.workspaceId, table.opportunityId, table.resultVersion)
      .where(sql`${table.outcome} = 'updated'`),
    foreignKey({
      name: 'commercial_intake_next_action_commands_actor_fk',
      columns: [table.workspaceId, table.actorWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'commercial_intake_next_action_commands_opportunity_fk',
      columns: [table.workspaceId, table.companyId, table.opportunityId],
      foreignColumns: [
        opportunities.workspaceId,
        opportunities.companyId,
        opportunities.id,
      ],
    }),
    check(
      'commercial_intake_next_action_commands_outcome_check',
      sql`${table.expectedVersion} >= 1 AND (
        (${table.outcome} = 'updated'
          AND ${table.resultVersion} = (${table.expectedVersion})::bigint + 1)
        OR
        (${table.outcome} = 'unchanged'
          AND ${table.resultVersion} = ${table.expectedVersion})
      )`,
    ),
    check(
      'commercial_intake_next_action_commands_next_action_check',
      sql`length(${table.nextAction}) BETWEEN 1 AND 500 AND length(btrim(${table.nextAction})) > 0`,
    ),
  ],
);

export const commercialIntakeClientAssociationCommands = pgTable(
  'commercial_intake_client_association_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    clientRequestId: uuid('client_request_id').notNull(),
    clientAccountId: uuid('client_account_id').notNull(),
    expectedVersion: integer('expected_version').notNull(),
    resultVersion: integer('result_version').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex(
      'commercial_intake_client_association_commands_actor_key_unique',
    ).on(
      table.workspaceId,
      table.companyId,
      table.actorWorkspaceMembershipId,
      table.idempotencyKey,
    ),
    uniqueIndex(
      'commercial_intake_client_association_commands_request_unique',
    ).on(table.workspaceId, table.companyId, table.clientRequestId),
    foreignKey({
      name: 'commercial_intake_client_association_commands_actor_fk',
      columns: [table.workspaceId, table.actorWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'commercial_intake_client_association_commands_request_fk',
      columns: [table.workspaceId, table.companyId, table.clientRequestId],
      foreignColumns: [
        clientRequests.workspaceId,
        clientRequests.companyId,
        clientRequests.id,
      ],
    }),
    foreignKey({
      name: 'commercial_intake_client_association_commands_client_fk',
      columns: [table.workspaceId, table.clientAccountId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    check(
      'commercial_intake_client_association_commands_version_check',
      sql`${table.expectedVersion} = 1 AND ${table.resultVersion} = 2`,
    ),
  ],
);

// Durable receipt of one responsible-actor command, in its own key space. It
// shares the Opportunity version with the next-action update: an unchanged
// outcome records a no-op at the observed version, an updated outcome the
// version it produced, and only one updated command may produce a version.
export const commercialIntakeResponsibleCommands = pgTable(
  'commercial_intake_responsible_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    opportunityId: uuid('opportunity_id').notNull(),
    expectedVersion: integer('expected_version').notNull(),
    resultVersion: integer('result_version').notNull(),
    outcome: text('outcome', { enum: ['updated', 'unchanged'] }).notNull(),
    // The requested member, which every recorded outcome leaves responsible.
    responsibleWorkspaceMembershipId: uuid(
      'responsible_workspace_membership_id',
    ).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('commercial_intake_responsible_commands_actor_key_unique').on(
      table.workspaceId,
      table.companyId,
      table.actorWorkspaceMembershipId,
      table.idempotencyKey,
    ),
    uniqueIndex('commercial_intake_responsible_commands_version_unique')
      .on(table.workspaceId, table.opportunityId, table.resultVersion)
      .where(sql`${table.outcome} = 'updated'`),
    foreignKey({
      name: 'commercial_intake_responsible_commands_actor_fk',
      columns: [table.workspaceId, table.actorWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'commercial_intake_responsible_commands_opportunity_fk',
      columns: [table.workspaceId, table.companyId, table.opportunityId],
      foreignColumns: [
        opportunities.workspaceId,
        opportunities.companyId,
        opportunities.id,
      ],
    }),
    foreignKey({
      name: 'commercial_intake_responsible_commands_responsible_fk',
      columns: [table.workspaceId, table.responsibleWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'commercial_intake_responsible_commands_outcome_check',
      sql`${table.expectedVersion} >= 1 AND (
        (${table.outcome} = 'updated'
          AND ${table.resultVersion} = (${table.expectedVersion})::bigint + 1)
        OR
        (${table.outcome} = 'unchanged'
          AND ${table.resultVersion} = ${table.expectedVersion})
      )`,
    ),
  ],
);

// The append-only outcome history of section 23.6: one entry per committed
// status transition, with its resulting Opportunity version. Capture's initial
// OPEN state has no entry. Entries are never edited or deleted.
export const opportunityOutcomeHistory = pgTable(
  'opportunity_outcome_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    opportunityId: uuid('opportunity_id').notNull(),
    opportunityVersion: integer('opportunity_version').notNull(),
    previousStatus: text('previous_status', {
      enum: OPPORTUNITY_OUTCOME_STATUSES,
    }).notNull(),
    newStatus: text('new_status', {
      enum: OPPORTUNITY_OUTCOME_STATUSES,
    }).notNull(),
    lossReasonCode: text('loss_reason_code', {
      enum: OPPORTUNITY_LOSS_REASON_CODES,
    }),
    reason: text('reason'),
    note: text('note'),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    actorDisplayLabel: text('actor_display_label').notNull(),
    changedAt: timestamp('changed_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // A constraint, not only an index, so each receipt can reference it; it
    // also serves the newest-first history pages.
    unique('opportunity_outcome_history_version_unique').on(
      table.workspaceId,
      table.opportunityId,
      table.opportunityVersion,
    ),
    foreignKey({
      name: 'opportunity_outcome_history_opportunity_fk',
      columns: [table.workspaceId, table.companyId, table.opportunityId],
      foreignColumns: [
        opportunities.workspaceId,
        opportunities.companyId,
        opportunities.id,
      ],
    }),
    foreignKey({
      name: 'opportunity_outcome_history_actor_fk',
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
      'opportunity_outcome_history_version_check',
      sql`${table.opportunityVersion} >= 2`,
    ),
    // Exactly the section 23.2 transitions; no other pair exists.
    check(
      'opportunity_outcome_history_transition_check',
      sql`(
        (${table.previousStatus} = 'OPEN' AND ${table.newStatus} IN ('ON_HOLD', 'WON', 'LOST', 'DISQUALIFIED', 'ARCHIVED'))
        OR (${table.previousStatus} = 'ON_HOLD' AND ${table.newStatus} IN ('OPEN', 'WON', 'LOST', 'DISQUALIFIED', 'ARCHIVED'))
        OR (${table.previousStatus} IN ('WON', 'LOST', 'DISQUALIFIED', 'ARCHIVED') AND ${table.newStatus} = 'OPEN')
      )`,
    ),
    // Lose carries a loss reason code and an optional note, required for
    // OTHER. Hold, Disqualify, Archive and Reopen carry a reason; Resume and
    // Win carry nothing. Text follows the section 16.3 rule.
    check(
      'opportunity_outcome_history_input_check',
      sql`(
        (${table.newStatus} = 'LOST'
          AND ${table.lossReasonCode} IS NOT NULL
          AND ${table.reason} IS NULL
          AND (${table.lossReasonCode} <> 'OTHER' OR ${table.note} IS NOT NULL))
        OR
        ((${table.newStatus} IN ('ON_HOLD', 'DISQUALIFIED', 'ARCHIVED')
            OR (${table.newStatus} = 'OPEN' AND ${table.previousStatus} <> 'ON_HOLD'))
          AND ${table.lossReasonCode} IS NULL
          AND ${table.note} IS NULL
          AND ${table.reason} IS NOT NULL)
        OR
        ((${table.newStatus} = 'WON'
            OR (${table.newStatus} = 'OPEN' AND ${table.previousStatus} = 'ON_HOLD'))
          AND ${table.lossReasonCode} IS NULL
          AND ${table.note} IS NULL
          AND ${table.reason} IS NULL)
      )
      AND (${table.reason} IS NULL OR (length(${table.reason}) BETWEEN 1 AND 500 AND length(btrim(${table.reason})) > 0))
      AND (${table.note} IS NULL OR (length(${table.note}) BETWEEN 1 AND 500 AND length(btrim(${table.note})) > 0))`,
    ),
    // Only the fixed section 23.2 loss reason codes.
    check(
      'opportunity_outcome_history_loss_reason_check',
      sql`${table.lossReasonCode} IS NULL OR ${table.lossReasonCode} IN ('PRICE', 'DEADLINE', 'COMPETITOR', 'NO_BUDGET', 'POSTPONED', 'CLIENT_WITHDREW', 'OTHER', 'UNKNOWN')`,
    ),
    check(
      'opportunity_outcome_history_actor_label_check',
      sql`length(btrim(${table.actorDisplayLabel})) > 0`,
    ),
  ],
);

// Durable receipt of one outcome status command, in its own key space. It
// shares the Opportunity version with the next-action update and the
// reassignment. Requesting the current status is refused, so every receipt
// records a transition and references the history entry it produced.
export const commercialIntakeOutcomeCommands = pgTable(
  'commercial_intake_outcome_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    opportunityId: uuid('opportunity_id').notNull(),
    expectedVersion: integer('expected_version').notNull(),
    resultVersion: integer('result_version').notNull(),
    previousStatus: text('previous_status', {
      enum: OPPORTUNITY_OUTCOME_STATUSES,
    }).notNull(),
    newStatus: text('new_status', {
      enum: OPPORTUNITY_OUTCOME_STATUSES,
    }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('commercial_intake_outcome_commands_actor_key_unique').on(
      table.workspaceId,
      table.companyId,
      table.actorWorkspaceMembershipId,
      table.idempotencyKey,
    ),
    uniqueIndex('commercial_intake_outcome_commands_version_unique').on(
      table.workspaceId,
      table.opportunityId,
      table.resultVersion,
    ),
    foreignKey({
      name: 'commercial_intake_outcome_commands_actor_fk',
      columns: [table.workspaceId, table.actorWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'commercial_intake_outcome_commands_opportunity_fk',
      columns: [table.workspaceId, table.companyId, table.opportunityId],
      foreignColumns: [
        opportunities.workspaceId,
        opportunities.companyId,
        opportunities.id,
      ],
    }),
    foreignKey({
      name: 'commercial_intake_outcome_commands_history_fk',
      columns: [table.workspaceId, table.opportunityId, table.resultVersion],
      foreignColumns: [
        opportunityOutcomeHistory.workspaceId,
        opportunityOutcomeHistory.opportunityId,
        opportunityOutcomeHistory.opportunityVersion,
      ],
    }),
    check(
      'commercial_intake_outcome_commands_version_check',
      sql`${table.expectedVersion} >= 1 AND ${table.resultVersion} = (${table.expectedVersion})::bigint + 1`,
    ),
    check(
      'commercial_intake_outcome_commands_transition_check',
      sql`(
        (${table.previousStatus} = 'OPEN' AND ${table.newStatus} IN ('ON_HOLD', 'WON', 'LOST', 'DISQUALIFIED', 'ARCHIVED'))
        OR (${table.previousStatus} = 'ON_HOLD' AND ${table.newStatus} IN ('OPEN', 'WON', 'LOST', 'DISQUALIFIED', 'ARCHIVED'))
        OR (${table.previousStatus} IN ('WON', 'LOST', 'DISQUALIFIED', 'ARCHIVED') AND ${table.newStatus} = 'OPEN')
      )`,
    ),
  ],
);

// The append-only Sales Stage history of section 24.5: one entry per material
// assignment, with the stages and the labels captured at the change, the
// resulting Opportunity version and the acting member's captured label.
// Entries are never edited or deleted.
export const opportunityStageHistory = pgTable(
  'opportunity_stage_history',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    opportunityId: uuid('opportunity_id').notNull(),
    opportunityVersion: integer('opportunity_version').notNull(),
    previousSalesStageId: uuid('previous_sales_stage_id'),
    previousLabel: text('previous_label'),
    newSalesStageId: uuid('new_sales_stage_id'),
    newLabel: text('new_label'),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    actorDisplayLabel: text('actor_display_label').notNull(),
    changedAt: timestamp('changed_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Also serves the newest-first history pages.
    unique('opportunity_stage_history_version_unique').on(
      table.workspaceId,
      table.opportunityId,
      table.opportunityVersion,
    ),
    foreignKey({
      name: 'opportunity_stage_history_opportunity_fk',
      columns: [table.workspaceId, table.companyId, table.opportunityId],
      foreignColumns: [
        opportunities.workspaceId,
        opportunities.companyId,
        opportunities.id,
      ],
    }),
    foreignKey({
      name: 'opportunity_stage_history_previous_stage_fk',
      columns: [table.workspaceId, table.companyId, table.previousSalesStageId],
      foreignColumns: [
        salesStages.workspaceId,
        salesStages.companyId,
        salesStages.id,
      ],
    }),
    foreignKey({
      name: 'opportunity_stage_history_new_stage_fk',
      columns: [table.workspaceId, table.companyId, table.newSalesStageId],
      foreignColumns: [
        salesStages.workspaceId,
        salesStages.companyId,
        salesStages.id,
      ],
    }),
    foreignKey({
      name: 'opportunity_stage_history_actor_fk',
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
      'opportunity_stage_history_version_check',
      sql`${table.opportunityVersion} >= 2`,
    ),
    // A stage and its captured label are present together, and a material
    // change always changes the stage.
    check(
      'opportunity_stage_history_stage_check',
      sql`(${table.previousSalesStageId} IS NULL) = (${table.previousLabel} IS NULL)
        AND (${table.newSalesStageId} IS NULL) = (${table.newLabel} IS NULL)
        AND ${table.previousSalesStageId} IS DISTINCT FROM ${table.newSalesStageId}
        AND (${table.previousLabel} IS NULL OR (length(${table.previousLabel}) BETWEEN 1 AND 80 AND length(btrim(${table.previousLabel})) > 0))
        AND (${table.newLabel} IS NULL OR (length(${table.newLabel}) BETWEEN 1 AND 80 AND length(btrim(${table.newLabel})) > 0))`,
    ),
    check(
      'opportunity_stage_history_actor_label_check',
      sql`length(btrim(${table.actorDisplayLabel})) > 0`,
    ),
  ],
);

// Durable receipt of one Sales Stage assignment command, in its own key space.
// It shares the Opportunity version with the next action, the reassignment
// and the outcome status: an unchanged outcome records a no-op at the observed
// version, an updated outcome the version it produced, and only one updated
// command may produce a version.
export const commercialIntakeStageCommands = pgTable(
  'commercial_intake_stage_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    opportunityId: uuid('opportunity_id').notNull(),
    expectedVersion: integer('expected_version').notNull(),
    resultVersion: integer('result_version').notNull(),
    outcome: text('outcome', { enum: ['updated', 'unchanged'] }).notNull(),
    // The requested stage, which every recorded outcome leaves assigned; null
    // when the command cleared the stage.
    salesStageId: uuid('sales_stage_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('commercial_intake_stage_commands_actor_key_unique').on(
      table.workspaceId,
      table.companyId,
      table.actorWorkspaceMembershipId,
      table.idempotencyKey,
    ),
    uniqueIndex('commercial_intake_stage_commands_version_unique')
      .on(table.workspaceId, table.opportunityId, table.resultVersion)
      .where(sql`${table.outcome} = 'updated'`),
    foreignKey({
      name: 'commercial_intake_stage_commands_actor_fk',
      columns: [table.workspaceId, table.actorWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'commercial_intake_stage_commands_opportunity_fk',
      columns: [table.workspaceId, table.companyId, table.opportunityId],
      foreignColumns: [
        opportunities.workspaceId,
        opportunities.companyId,
        opportunities.id,
      ],
    }),
    foreignKey({
      name: 'commercial_intake_stage_commands_stage_fk',
      columns: [table.workspaceId, table.companyId, table.salesStageId],
      foreignColumns: [
        salesStages.workspaceId,
        salesStages.companyId,
        salesStages.id,
      ],
    }),
    check(
      'commercial_intake_stage_commands_outcome_check',
      sql`${table.expectedVersion} >= 1 AND (
        (${table.outcome} = 'updated'
          AND ${table.resultVersion} = (${table.expectedVersion})::bigint + 1)
        OR
        (${table.outcome} = 'unchanged'
          AND ${table.resultVersion} = ${table.expectedVersion})
      )`,
    ),
  ],
);

export const commercialIntakeCommands = pgTable(
  'commercial_intake_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    resultClientRequestId: uuid('result_client_request_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('commercial_intake_commands_actor_key_unique').on(
      table.workspaceId,
      table.companyId,
      table.actorWorkspaceMembershipId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: 'commercial_intake_commands_actor_fk',
      columns: [table.workspaceId, table.actorWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'commercial_intake_commands_result_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.resultClientRequestId,
      ],
      foreignColumns: [
        clientRequests.workspaceId,
        clientRequests.companyId,
        clientRequests.id,
      ],
    }),
  ],
);

export const commercialIntakeEvents = pgTable(
  'commercial_intake_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    action: text('action', {
      enum: [
        'client_request.created',
        'client_request.client_associated',
        'opportunity.created',
        'opportunity.next_action.updated',
        'opportunity.responsible.changed',
        'opportunity.outcome.changed',
        'opportunity.stage.changed',
      ],
    }).notNull(),
    clientRequestId: uuid('client_request_id').notNull(),
    opportunityId: uuid('opportunity_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    metadata: jsonb('metadata').$type<unknown>().notNull(),
  },
  (table) => [
    uniqueIndex('commercial_intake_events_request_created_unique')
      .on(table.workspaceId, table.clientRequestId)
      .where(sql`${table.action} = 'client_request.created'`),
    uniqueIndex('commercial_intake_events_opportunity_created_unique')
      .on(table.workspaceId, table.opportunityId)
      .where(sql`${table.action} = 'opportunity.created'`),
    uniqueIndex('commercial_intake_events_client_associated_unique')
      .on(table.workspaceId, table.clientRequestId)
      .where(sql`${table.action} = 'client_request.client_associated'`),
    // Exactly one update event per resulting Opportunity version.
    uniqueIndex('commercial_intake_events_next_action_version_unique')
      .on(
        table.workspaceId,
        table.opportunityId,
        sql`(${table.metadata} ->> 'opportunityVersion')`,
      )
      .where(sql`${table.action} = 'opportunity.next_action.updated'`),
    // Exactly one responsible-actor change event per resulting version.
    uniqueIndex('commercial_intake_events_responsible_version_unique')
      .on(
        table.workspaceId,
        table.opportunityId,
        sql`(${table.metadata} ->> 'opportunityVersion')`,
      )
      .where(sql`${table.action} = 'opportunity.responsible.changed'`),
    // Exactly one outcome status change event per resulting version.
    uniqueIndex('commercial_intake_events_outcome_version_unique')
      .on(
        table.workspaceId,
        table.opportunityId,
        sql`(${table.metadata} ->> 'opportunityVersion')`,
      )
      .where(sql`${table.action} = 'opportunity.outcome.changed'`),
    // Exactly one Sales Stage change event per resulting version.
    uniqueIndex('commercial_intake_events_stage_version_unique')
      .on(
        table.workspaceId,
        table.opportunityId,
        sql`(${table.metadata} ->> 'opportunityVersion')`,
      )
      .where(sql`${table.action} = 'opportunity.stage.changed'`),
    // Update metadata carries the resulting version only: one integer key,
    // never previous or new text. A responsible-actor change additionally
    // carries exactly the previous and new responsible actor, each a
    // membership identifier and a non-blank captured label, and they differ.
    // An outcome status change carries exactly the previous and new status of
    // one section 23.2 transition, plus the loss reason code of a loss; never
    // reason or note text. A Sales Stage change carries exactly the previous
    // and new stage, each a stage identifier and its non-blank captured label
    // or null, and they differ.
    check(
      'commercial_intake_events_action_metadata_check',
      sql`(
        (${table.action} = 'client_request.created'
          AND ${table.metadata} = '{"requestVersion": 1}'::jsonb)
        OR
        (${table.action} = 'client_request.client_associated'
          AND ${table.metadata} = '{"requestVersion": 2}'::jsonb)
        OR
        (${table.action} = 'opportunity.created'
          AND ${table.metadata} = '{"opportunityVersion": 1}'::jsonb)
        OR
        (${table.action} = 'opportunity.next_action.updated'
          AND jsonb_typeof(${table.metadata} -> 'opportunityVersion') = 'number'
          AND ${table.metadata} = jsonb_build_object('opportunityVersion', (${table.metadata} ->> 'opportunityVersion')::integer)
          AND (${table.metadata} ->> 'opportunityVersion')::integer >= 2)
        OR
        ((${table.action} = 'opportunity.responsible.changed'
          AND jsonb_typeof(${table.metadata} -> 'opportunityVersion') = 'number'
          AND jsonb_typeof(${table.metadata} #> '{before,workspaceMembershipId}') = 'string'
          AND jsonb_typeof(${table.metadata} #> '{before,displayLabel}') = 'string'
          AND jsonb_typeof(${table.metadata} #> '{after,workspaceMembershipId}') = 'string'
          AND jsonb_typeof(${table.metadata} #> '{after,displayLabel}') = 'string'
          AND ${table.metadata} = jsonb_build_object(
            'opportunityVersion', (${table.metadata} ->> 'opportunityVersion')::integer,
            'before', jsonb_build_object(
              'workspaceMembershipId', ${table.metadata} #>> '{before,workspaceMembershipId}',
              'displayLabel', ${table.metadata} #>> '{before,displayLabel}'),
            'after', jsonb_build_object(
              'workspaceMembershipId', ${table.metadata} #>> '{after,workspaceMembershipId}',
              'displayLabel', ${table.metadata} #>> '{after,displayLabel}'))
          AND (${table.metadata} ->> 'opportunityVersion')::integer >= 2
          AND length(btrim(${table.metadata} #>> '{before,displayLabel}')) > 0
          AND length(btrim(${table.metadata} #>> '{after,displayLabel}')) > 0
          AND ${table.metadata} #>> '{before,workspaceMembershipId}'
            <> ${table.metadata} #>> '{after,workspaceMembershipId}') IS TRUE)
        OR
        ((${table.action} = 'opportunity.outcome.changed'
          AND jsonb_typeof(${table.metadata} -> 'opportunityVersion') = 'number'
          AND (${table.metadata} ->> 'opportunityVersion')::integer >= 2
          AND (
            (${table.metadata} ->> 'previousStatus' = 'OPEN'
              AND ${table.metadata} ->> 'newStatus' IN ('ON_HOLD', 'WON', 'LOST', 'DISQUALIFIED', 'ARCHIVED'))
            OR (${table.metadata} ->> 'previousStatus' = 'ON_HOLD'
              AND ${table.metadata} ->> 'newStatus' IN ('OPEN', 'WON', 'LOST', 'DISQUALIFIED', 'ARCHIVED'))
            OR (${table.metadata} ->> 'previousStatus' IN ('WON', 'LOST', 'DISQUALIFIED', 'ARCHIVED')
              AND ${table.metadata} ->> 'newStatus' = 'OPEN'))
          AND (
            (${table.metadata} ->> 'newStatus' = 'LOST'
              AND ${table.metadata} ->> 'lossReasonCode' IN ('PRICE', 'DEADLINE', 'COMPETITOR', 'NO_BUDGET', 'POSTPONED', 'CLIENT_WITHDREW', 'OTHER', 'UNKNOWN')
              AND ${table.metadata} = jsonb_build_object(
                'opportunityVersion', (${table.metadata} ->> 'opportunityVersion')::integer,
                'previousStatus', ${table.metadata} ->> 'previousStatus',
                'newStatus', 'LOST',
                'lossReasonCode', ${table.metadata} ->> 'lossReasonCode'))
            OR
            (${table.metadata} ->> 'newStatus' <> 'LOST'
              AND ${table.metadata} = jsonb_build_object(
                'opportunityVersion', (${table.metadata} ->> 'opportunityVersion')::integer,
                'previousStatus', ${table.metadata} ->> 'previousStatus',
                'newStatus', ${table.metadata} ->> 'newStatus')))) IS TRUE)
        OR
        ((${table.action} = 'opportunity.stage.changed'
          AND jsonb_typeof(${table.metadata} -> 'opportunityVersion') = 'number'
          AND (${table.metadata} ->> 'opportunityVersion')::integer >= 2
          AND (jsonb_typeof(${table.metadata} -> 'previousStage') = 'null'
            OR (jsonb_typeof(${table.metadata} #> '{previousStage,salesStageId}') = 'string'
              AND jsonb_typeof(${table.metadata} #> '{previousStage,label}') = 'string'
              AND ${table.metadata} -> 'previousStage' = jsonb_build_object(
                'salesStageId', ${table.metadata} #>> '{previousStage,salesStageId}',
                'label', ${table.metadata} #>> '{previousStage,label}')
              AND length(${table.metadata} #>> '{previousStage,label}') BETWEEN 1 AND 80
              AND length(btrim(${table.metadata} #>> '{previousStage,label}')) > 0))
          AND (jsonb_typeof(${table.metadata} -> 'newStage') = 'null'
            OR (jsonb_typeof(${table.metadata} #> '{newStage,salesStageId}') = 'string'
              AND jsonb_typeof(${table.metadata} #> '{newStage,label}') = 'string'
              AND ${table.metadata} -> 'newStage' = jsonb_build_object(
                'salesStageId', ${table.metadata} #>> '{newStage,salesStageId}',
                'label', ${table.metadata} #>> '{newStage,label}')
              AND length(${table.metadata} #>> '{newStage,label}') BETWEEN 1 AND 80
              AND length(btrim(${table.metadata} #>> '{newStage,label}')) > 0))
          AND ${table.metadata} = jsonb_build_object(
            'opportunityVersion', (${table.metadata} ->> 'opportunityVersion')::integer,
            'previousStage', ${table.metadata} -> 'previousStage',
            'newStage', ${table.metadata} -> 'newStage')
          AND (${table.metadata} #>> '{previousStage,salesStageId}')
            IS DISTINCT FROM (${table.metadata} #>> '{newStage,salesStageId}')) IS TRUE)
      )`,
    ),
    foreignKey({
      name: 'commercial_intake_events_request_fk',
      columns: [table.workspaceId, table.companyId, table.clientRequestId],
      foreignColumns: [
        clientRequests.workspaceId,
        clientRequests.companyId,
        clientRequests.id,
      ],
    }),
    foreignKey({
      name: 'commercial_intake_events_opportunity_fk',
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
    foreignKey({
      name: 'commercial_intake_events_actor_fk',
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
