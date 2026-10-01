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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { clientAccounts, companies, workspaceMemberships } from './core.js';

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
    check('client_requests_version_check', sql`${table.version} = 1`),
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
    status: text('status', { enum: ['OPEN'] })
      .default('OPEN')
      .notNull(),
    responsibleInternalUserId: uuid('responsible_internal_user_id').notNull(),
    responsibleWorkspaceMembershipId: uuid(
      'responsible_workspace_membership_id',
    ).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    version: integer('version').default(1).notNull(),
    // Server-owned trace of the last material Opportunity mutation: a
    // next-action update or a responsible-actor change. All stay null while
    // the Opportunity is still at its captured version 1.
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
    check('opportunities_status_check', sql`${table.status} = 'OPEN'`),
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
        'opportunity.created',
        'opportunity.next_action.updated',
        'opportunity.responsible.changed',
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
    // Update metadata carries the resulting version only: one integer key,
    // never previous or new text. A responsible-actor change additionally
    // carries exactly the previous and new responsible actor, each a
    // membership identifier and a non-blank captured label, and they differ.
    check(
      'commercial_intake_events_action_metadata_check',
      sql`(
        (${table.action} = 'client_request.created'
          AND ${table.metadata} = '{"requestVersion": 1}'::jsonb)
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
