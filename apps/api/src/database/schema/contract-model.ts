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
  type PgTableExtraConfigValue,
} from 'drizzle-orm/pg-core';
import { companies, workspaceMemberships } from './core.js';

const scope = () => ({
  workspaceId: uuid('workspace_id').notNull(),
  companyId: uuid('company_id').notNull(),
});
const attribution = () => ({
  actorMembershipId: uuid('actor_membership_id').notNull(),
  actorInternalUserId: uuid('actor_internal_user_id').notNull(),
  actorDisplayName: text('actor_display_name').notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
});

export const contractModels = pgTable(
  'contract_models',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ...scope(),
    code: text('code').notNull(),
    language: text('language').notNull(),
    revision: integer('revision').notNull(),
    activeVersionId: uuid('active_version_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex('contract_models_scope_id_unique').on(
      t.workspaceId,
      t.companyId,
      t.id,
    ),
    uniqueIndex('contract_models_company_code_unique').on(
      t.workspaceId,
      t.companyId,
      t.code,
    ),
    foreignKey({
      name: 'contract_models_company_fk',
      columns: [t.workspaceId, t.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'contract_models_active_version_fk',
      columns: [t.workspaceId, t.companyId, t.id, t.activeVersionId],
      foreignColumns: [
        contractModelVersions.workspaceId,
        contractModelVersions.companyId,
        contractModelVersions.modelId,
        contractModelVersions.id,
      ],
    }),
    check(
      'contract_models_family_check',
      sql`${t.code} = 'INTEGRATED_MANAGEMENT_CONSULTING_CONTRACT_RO' AND ${t.language} = 'ro' AND ${t.revision} > 0`,
    ),
  ],
);

export const contractModelVersions = pgTable(
  'contract_model_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ...scope(),
    modelId: uuid('model_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    predecessorVersionId: uuid('predecessor_version_id'),
    predecessorVersionNumber: integer('predecessor_version_number'),
    content: jsonb('content').$type<unknown>().notNull(),
    ...attribution(),
  },
  (t): PgTableExtraConfigValue[] => [
    uniqueIndex('contract_model_versions_scoped_id_unique').on(
      t.workspaceId,
      t.companyId,
      t.modelId,
      t.id,
    ),
    uniqueIndex('contract_model_versions_identity_unique').on(
      t.workspaceId,
      t.companyId,
      t.modelId,
      t.id,
      t.versionNumber,
    ),
    uniqueIndex('contract_model_versions_number_unique').on(
      t.workspaceId,
      t.companyId,
      t.modelId,
      t.versionNumber,
    ),
    uniqueIndex('contract_model_versions_successor_unique').on(
      t.workspaceId,
      t.companyId,
      t.modelId,
      t.predecessorVersionId,
    ),
    foreignKey({
      name: 'contract_model_versions_model_fk',
      columns: [t.workspaceId, t.companyId, t.modelId],
      foreignColumns: [
        contractModels.workspaceId,
        contractModels.companyId,
        contractModels.id,
      ],
    }),
    foreignKey({
      name: 'contract_model_versions_predecessor_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.modelId,
        t.predecessorVersionId,
        t.predecessorVersionNumber,
      ],
      foreignColumns: [
        t.workspaceId,
        t.companyId,
        t.modelId,
        t.id,
        t.versionNumber,
      ],
    }),
    foreignKey({
      name: 'contract_model_versions_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId, t.actorInternalUserId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'contract_model_versions_lineage_check',
      sql`(${t.versionNumber} = 1 AND ${t.predecessorVersionId} IS NULL AND ${t.predecessorVersionNumber} IS NULL) OR (${t.versionNumber} > 1 AND ${t.predecessorVersionId} IS NOT NULL AND ${t.predecessorVersionNumber} IS NOT NULL AND ${t.predecessorVersionNumber} = ${t.versionNumber} - 1)`,
    ),
    check(
      'contract_model_versions_content_check',
      sql`jsonb_typeof(${t.content}) = 'object' AND ${t.content} ? 'sourceKind' AND ${t.content}->'sourceKind' IN ('"ILLUSTRATIVE"'::jsonb, '"COMPANY_SUPPLIED"'::jsonb)`,
    ),
  ],
);

export const contractModelDecisions = pgTable(
  'contract_model_decisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ...scope(),
    modelId: uuid('model_id').notNull(),
    versionId: uuid('version_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    outcome: text('outcome', { enum: ['APPROVE', 'REJECT'] }).notNull(),
    basis: text('basis').notNull(),
    ...attribution(),
  },
  (t) => [
    uniqueIndex('contract_model_decisions_approval_identity_unique').on(
      t.workspaceId,
      t.companyId,
      t.modelId,
      t.versionId,
      t.versionNumber,
      t.outcome,
      t.id,
    ),
    uniqueIndex('contract_model_decisions_version_unique').on(
      t.workspaceId,
      t.companyId,
      t.modelId,
      t.versionId,
    ),
    foreignKey({
      name: 'contract_model_decisions_version_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.modelId,
        t.versionId,
        t.versionNumber,
      ],
      foreignColumns: [
        contractModelVersions.workspaceId,
        contractModelVersions.companyId,
        contractModelVersions.modelId,
        contractModelVersions.id,
        contractModelVersions.versionNumber,
      ],
    }),
    foreignKey({
      name: 'contract_model_decisions_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId, t.actorInternalUserId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'contract_model_decisions_outcome_check',
      sql`${t.outcome} IN ('APPROVE', 'REJECT') AND length(btrim(${t.basis})) > 0 AND length(${t.basis}) <= 2000`,
    ),
  ],
);

export const contractModelWithdrawals = pgTable(
  'contract_model_withdrawals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ...scope(),
    modelId: uuid('model_id').notNull(),
    versionId: uuid('version_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    reason: text('reason').notNull(),
    ...attribution(),
  },
  (t) => [
    uniqueIndex('contract_model_withdrawals_version_unique').on(
      t.workspaceId,
      t.companyId,
      t.modelId,
      t.versionId,
    ),
    foreignKey({
      name: 'contract_model_withdrawals_version_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.modelId,
        t.versionId,
        t.versionNumber,
      ],
      foreignColumns: [
        contractModelVersions.workspaceId,
        contractModelVersions.companyId,
        contractModelVersions.modelId,
        contractModelVersions.id,
        contractModelVersions.versionNumber,
      ],
    }),
    foreignKey({
      name: 'contract_model_withdrawals_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId, t.actorInternalUserId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'contract_model_withdrawals_reason_check',
      sql`length(btrim(${t.reason})) > 0 AND length(${t.reason}) <= 2000`,
    ),
  ],
);

export const contractModelCommands = pgTable(
  'contract_model_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ...scope(),
    modelId: uuid('model_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    key: text('key').notNull(),
    kind: text('kind', { enum: ['SUBMIT', 'DECIDE', 'WITHDRAW'] }).notNull(),
    fingerprint: text('fingerprint').notNull(),
    result: jsonb('result').$type<unknown>().notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('contract_model_commands_actor_key_unique').on(
      t.workspaceId,
      t.companyId,
      t.actorMembershipId,
      t.key,
    ),
    foreignKey({
      name: 'contract_model_commands_model_fk',
      columns: [t.workspaceId, t.companyId, t.modelId],
      foreignColumns: [
        contractModels.workspaceId,
        contractModels.companyId,
        contractModels.id,
      ],
    }),
    foreignKey({
      name: 'contract_model_commands_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId, t.actorInternalUserId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'contract_model_commands_intent_check',
      sql`${t.kind} IN ('SUBMIT', 'DECIDE', 'WITHDRAW') AND ${t.fingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'contract_model_commands_result_check',
      sql`jsonb_typeof(${t.result}) = 'object' AND (${t.result}#>'{model,revision}') IS NOT NULL AND jsonb_typeof(${t.result}#>'{model,revision}') = 'number'`,
    ),
  ],
);

/** Restricted business events: deliberately absent from public Activity queries. */
export const contractModelEvents = pgTable(
  'contract_model_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ...scope(),
    modelId: uuid('model_id').notNull(),
    modelCode: text('model_code').notNull(),
    versionId: uuid('version_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    revision: integer('revision').notNull(),
    action: text('action', {
      enum: [
        'contract_model.version.created',
        'contract_model.version.approved',
        'contract_model.version.rejected',
        'contract_model.version.withdrawn',
      ],
    }).notNull(),
    ...attribution(),
  },
  (t) => [
    uniqueIndex('contract_model_events_revision_unique').on(
      t.workspaceId,
      t.companyId,
      t.modelId,
      t.revision,
    ),
    foreignKey({
      name: 'contract_model_events_version_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.modelId,
        t.versionId,
        t.versionNumber,
      ],
      foreignColumns: [
        contractModelVersions.workspaceId,
        contractModelVersions.companyId,
        contractModelVersions.modelId,
        contractModelVersions.id,
        contractModelVersions.versionNumber,
      ],
    }),
    foreignKey({
      name: 'contract_model_events_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId, t.actorInternalUserId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'contract_model_events_code_check',
      sql`${t.modelCode} = 'INTEGRATED_MANAGEMENT_CONSULTING_CONTRACT_RO'`,
    ),
    check(
      'contract_model_events_action_check',
      sql`${t.revision} > 0 AND ${t.action} IN ('contract_model.version.created', 'contract_model.version.approved', 'contract_model.version.rejected', 'contract_model.version.withdrawn')`,
    ),
  ],
);
