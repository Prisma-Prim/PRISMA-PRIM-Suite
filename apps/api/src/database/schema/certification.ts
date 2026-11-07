import { sql } from 'drizzle-orm';
import {
  check,
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
import { clientLegalEntities } from './client-legal-entity.js';
import { projects } from './project.js';

export const CERTIFICATION_CASE_STATUSES = ['open', 'rejected'] as const;
export const CERTIFICATION_STEPS = [
  'application',
  'application_review',
] as const;
export const CERTIFICATION_EVENT_ACTIONS = [
  'certification_case.opened',
  'certification_case.application_recorded',
  'certification_case.application_reviewed',
] as const;
export const CERTIFICATION_COMMAND_KINDS = [
  'open',
  'application',
  'application_review',
] as const;

/** One initial certification of one Client Legal Entity, carried out under one Project. */
export const certificationCases = pgTable(
  'certification_cases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id').notNull(),
    clientAccountId: uuid('client_account_id').notNull(),
    clientLegalEntityId: uuid('client_legal_entity_id').notNull(),
    orderReference: text('order_reference').notNull(),
    standard: text('standard', { enum: ['iso_22000_2018'] }).notNull(),
    auditType: text('audit_type', {
      enum: ['initial_certification'],
    }).notNull(),
    status: text('status', { enum: CERTIFICATION_CASE_STATUSES }).notNull(),
    revision: integer('revision').notNull(),
    openedByMembershipId: uuid('opened_by_membership_id').notNull(),
    openedByInternalUserId: uuid('opened_by_internal_user_id').notNull(),
    openedByDisplayName: text('opened_by_display_name').notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('certification_cases_scope_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
    ),
    uniqueIndex('certification_cases_order_reference_unique').on(
      table.workspaceId,
      table.companyId,
      table.orderReference,
    ),
    index('certification_cases_project_idx').on(
      table.workspaceId,
      table.companyId,
      table.projectId,
      table.openedAt,
      table.id,
    ),
    foreignKey({
      name: 'certification_cases_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'certification_cases_project_fk',
      columns: [table.workspaceId, table.companyId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.companyId, projects.id],
    }),
    foreignKey({
      name: 'certification_cases_client_fk',
      columns: [table.workspaceId, table.clientAccountId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    foreignKey({
      name: 'certification_cases_legal_entity_fk',
      columns: [
        table.workspaceId,
        table.clientAccountId,
        table.clientLegalEntityId,
      ],
      foreignColumns: [
        clientLegalEntities.workspaceId,
        clientLegalEntities.clientAccountId,
        clientLegalEntities.id,
      ],
    }),
    foreignKey({
      name: 'certification_cases_opener_fk',
      columns: [
        table.workspaceId,
        table.openedByMembershipId,
        table.openedByInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check('certification_cases_revision_check', sql`${table.revision} > 0`),
    check(
      'certification_cases_kind_check',
      sql`${table.standard} = 'iso_22000_2018' AND ${table.auditType} = 'initial_certification' AND ${table.status} IN ('open', 'rejected')`,
    ),
    check(
      'certification_cases_order_reference_check',
      sql`length(btrim(${table.orderReference})) BETWEEN 1 AND 64`,
    ),
  ],
);

/** Immutable versions of each recorded step; a later version needs a reason. */
export const certificationStepVersions = pgTable(
  'certification_step_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    caseId: uuid('case_id').notNull(),
    step: text('step', { enum: CERTIFICATION_STEPS }).notNull(),
    version: integer('version').notNull(),
    caseRevision: integer('case_revision').notNull(),
    payload: jsonb('payload').$type<unknown>().notNull(),
    reason: text('reason'),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('certification_step_versions_number_unique').on(
      table.workspaceId,
      table.companyId,
      table.caseId,
      table.step,
      table.version,
    ),
    uniqueIndex('certification_step_versions_case_revision_unique').on(
      table.workspaceId,
      table.companyId,
      table.caseId,
      table.caseRevision,
    ),
    foreignKey({
      name: 'certification_step_versions_case_fk',
      columns: [table.workspaceId, table.companyId, table.caseId],
      foreignColumns: [
        certificationCases.workspaceId,
        certificationCases.companyId,
        certificationCases.id,
      ],
    }),
    foreignKey({
      name: 'certification_step_versions_actor_fk',
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
      'certification_step_versions_reason_check',
      sql`(${table.version} = 1 AND ${table.reason} IS NULL) OR (${table.version} > 1 AND length(btrim(${table.reason})) > 0)`,
    ),
    check(
      'certification_step_versions_step_check',
      sql`${table.step} IN ('application', 'application_review') AND ${table.version} > 0 AND ${table.caseRevision} > 1`,
    ),
    check(
      'certification_step_versions_payload_check',
      sql`jsonb_typeof(${table.payload}) = 'object'`,
    ),
  ],
);

export const certificationReceipts = pgTable(
  'certification_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    commandKind: text('command_kind', {
      enum: CERTIFICATION_COMMAND_KINDS,
    }).notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    caseId: uuid('case_id').notNull(),
    response: jsonb('response').$type<unknown>().notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('certification_receipts_actor_key_unique').on(
      table.workspaceId,
      table.companyId,
      table.actorMembershipId,
      table.commandKind,
      table.idempotencyKey,
    ),
    check(
      'certification_receipts_kind_check',
      sql`${table.commandKind} IN ('open', 'application', 'application_review')`,
    ),
    foreignKey({
      name: 'certification_receipts_case_fk',
      columns: [table.workspaceId, table.companyId, table.caseId],
      foreignColumns: [
        certificationCases.workspaceId,
        certificationCases.companyId,
        certificationCases.id,
      ],
    }),
    foreignKey({
      name: 'certification_receipts_actor_fk',
      columns: [table.workspaceId, table.actorMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
  ],
);

// Case-scoped Activity: read back only through the Case timeline.
export const certificationEvents = pgTable(
  'certification_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    caseId: uuid('case_id').notNull(),
    revision: integer('revision').notNull(),
    action: text('action', { enum: CERTIFICATION_EVENT_ACTIONS }).notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    metadata: jsonb('metadata').$type<unknown>().notNull(),
  },
  (table) => [
    uniqueIndex('certification_events_revision_unique').on(
      table.workspaceId,
      table.companyId,
      table.caseId,
      table.revision,
    ),
    check(
      'certification_events_action_check',
      sql`${table.action} IN ('certification_case.opened', 'certification_case.application_recorded', 'certification_case.application_reviewed') AND ${table.revision} > 0 AND jsonb_typeof(${table.metadata}) = 'object'`,
    ),
    foreignKey({
      name: 'certification_events_case_fk',
      columns: [table.workspaceId, table.companyId, table.caseId],
      foreignColumns: [
        certificationCases.workspaceId,
        certificationCases.companyId,
        certificationCases.id,
      ],
    }),
    foreignKey({
      name: 'certification_events_actor_fk',
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
  ],
);
