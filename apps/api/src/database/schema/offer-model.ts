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

export const offerModels = pgTable(
  'offer_models',
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
    uniqueIndex('offer_models_scope_id_unique').on(
      t.workspaceId,
      t.companyId,
      t.id,
    ),
    uniqueIndex('offer_models_company_code_unique').on(
      t.workspaceId,
      t.companyId,
      t.code,
    ),
    foreignKey({
      name: 'offer_models_company_fk',
      columns: [t.workspaceId, t.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'offer_models_active_version_fk',
      columns: [t.workspaceId, t.companyId, t.id, t.activeVersionId],
      foreignColumns: [
        offerModelVersions.workspaceId,
        offerModelVersions.companyId,
        offerModelVersions.modelId,
        offerModelVersions.id,
      ],
    }),
    check(
      'offer_models_family_check',
      sql`${t.code} = 'INTEGRATED_MANAGEMENT_CONSULTING_RO' AND ${t.language} = 'ro' AND ${t.revision} > 0`,
    ),
  ],
);

export const offerModelVersions = pgTable(
  'offer_model_versions',
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
    uniqueIndex('offer_model_versions_scoped_id_unique').on(
      t.workspaceId,
      t.companyId,
      t.modelId,
      t.id,
    ),
    uniqueIndex('offer_model_versions_identity_unique').on(
      t.workspaceId,
      t.companyId,
      t.modelId,
      t.id,
      t.versionNumber,
    ),
    uniqueIndex('offer_model_versions_number_unique').on(
      t.workspaceId,
      t.companyId,
      t.modelId,
      t.versionNumber,
    ),
    uniqueIndex('offer_model_versions_successor_unique').on(
      t.workspaceId,
      t.companyId,
      t.modelId,
      t.predecessorVersionId,
    ),
    foreignKey({
      name: 'offer_model_versions_model_fk',
      columns: [t.workspaceId, t.companyId, t.modelId],
      foreignColumns: [
        offerModels.workspaceId,
        offerModels.companyId,
        offerModels.id,
      ],
    }),
    foreignKey({
      name: 'offer_model_versions_predecessor_fk',
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
      name: 'offer_model_versions_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId, t.actorInternalUserId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'offer_model_versions_lineage_check',
      sql`(${t.versionNumber} = 1 AND ${t.predecessorVersionId} IS NULL AND ${t.predecessorVersionNumber} IS NULL) OR (${t.versionNumber} > 1 AND ${t.predecessorVersionId} IS NOT NULL AND ${t.predecessorVersionNumber} IS NOT NULL AND ${t.predecessorVersionNumber} = ${t.versionNumber} - 1)`,
    ),
    check(
      'offer_model_versions_content_check',
      sql`jsonb_typeof(${t.content}) = 'object' AND ${t.content} ? 'sourceKind' AND ${t.content}->'sourceKind' IN ('"ILLUSTRATIVE"'::jsonb, '"COMPANY_SUPPLIED"'::jsonb)`,
    ),
  ],
);

export const offerModelDecisions = pgTable(
  'offer_model_decisions',
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
    uniqueIndex('offer_model_decisions_offer_source_unique').on(
      t.workspaceId,
      t.companyId,
      t.modelId,
      t.versionId,
      t.versionNumber,
      t.outcome,
      t.id,
    ),
    uniqueIndex('offer_model_decisions_version_unique').on(
      t.workspaceId,
      t.companyId,
      t.modelId,
      t.versionId,
    ),
    foreignKey({
      name: 'offer_model_decisions_version_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.modelId,
        t.versionId,
        t.versionNumber,
      ],
      foreignColumns: [
        offerModelVersions.workspaceId,
        offerModelVersions.companyId,
        offerModelVersions.modelId,
        offerModelVersions.id,
        offerModelVersions.versionNumber,
      ],
    }),
    foreignKey({
      name: 'offer_model_decisions_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId, t.actorInternalUserId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'offer_model_decisions_outcome_check',
      sql`${t.outcome} IN ('APPROVE', 'REJECT') AND length(btrim(${t.basis})) > 0 AND length(${t.basis}) <= 2000`,
    ),
  ],
);

export const offerModelWithdrawals = pgTable(
  'offer_model_withdrawals',
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
    uniqueIndex('offer_model_withdrawals_version_unique').on(
      t.workspaceId,
      t.companyId,
      t.modelId,
      t.versionId,
    ),
    foreignKey({
      name: 'offer_model_withdrawals_version_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.modelId,
        t.versionId,
        t.versionNumber,
      ],
      foreignColumns: [
        offerModelVersions.workspaceId,
        offerModelVersions.companyId,
        offerModelVersions.modelId,
        offerModelVersions.id,
        offerModelVersions.versionNumber,
      ],
    }),
    foreignKey({
      name: 'offer_model_withdrawals_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId, t.actorInternalUserId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'offer_model_withdrawals_reason_check',
      sql`length(btrim(${t.reason})) > 0 AND length(${t.reason}) <= 2000`,
    ),
  ],
);

export const offerModelCommands = pgTable(
  'offer_model_commands',
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
    uniqueIndex('offer_model_commands_actor_key_unique').on(
      t.workspaceId,
      t.companyId,
      t.actorMembershipId,
      t.key,
    ),
    foreignKey({
      name: 'offer_model_commands_model_fk',
      columns: [t.workspaceId, t.companyId, t.modelId],
      foreignColumns: [
        offerModels.workspaceId,
        offerModels.companyId,
        offerModels.id,
      ],
    }),
    foreignKey({
      name: 'offer_model_commands_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId, t.actorInternalUserId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'offer_model_commands_intent_check',
      sql`${t.kind} IN ('SUBMIT', 'DECIDE', 'WITHDRAW') AND ${t.fingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    check(
      'offer_model_commands_result_check',
      sql`jsonb_typeof(${t.result}) = 'object' AND (${t.result}#>'{model,revision}') IS NOT NULL AND jsonb_typeof(${t.result}#>'{model,revision}') = 'number'`,
    ),
  ],
);

/** Restricted business events: deliberately absent from public Activity queries. */
export const offerModelEvents = pgTable(
  'offer_model_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ...scope(),
    modelId: uuid('model_id').notNull(),
    versionId: uuid('version_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    revision: integer('revision').notNull(),
    action: text('action', {
      enum: [
        'offer_model.version.created',
        'offer_model.version.approved',
        'offer_model.version.rejected',
        'offer_model.version.withdrawn',
      ],
    }).notNull(),
    ...attribution(),
  },
  (t) => [
    uniqueIndex('offer_model_events_revision_unique').on(
      t.workspaceId,
      t.companyId,
      t.modelId,
      t.revision,
    ),
    foreignKey({
      name: 'offer_model_events_version_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.modelId,
        t.versionId,
        t.versionNumber,
      ],
      foreignColumns: [
        offerModelVersions.workspaceId,
        offerModelVersions.companyId,
        offerModelVersions.modelId,
        offerModelVersions.id,
        offerModelVersions.versionNumber,
      ],
    }),
    foreignKey({
      name: 'offer_model_events_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId, t.actorInternalUserId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'offer_model_events_action_check',
      sql`${t.revision} > 0 AND ${t.action} IN ('offer_model.version.created', 'offer_model.version.approved', 'offer_model.version.rejected', 'offer_model.version.withdrawn')`,
    ),
  ],
);
