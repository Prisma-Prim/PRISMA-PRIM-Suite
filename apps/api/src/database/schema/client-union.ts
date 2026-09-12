import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  clientAccounts,
  clientCompanyRelationships,
  companies,
  workspaceMemberships,
} from './core.js';

type ClientUnionContacts = Array<{
  name: string;
  telephone?: string;
  email?: string;
}>;

export const clientUnionOperationStatus = pgEnum(
  'client_union_operation_status',
  ['confirmed', 'reversed'],
);

export const clientUnionParticipantRole = pgEnum(
  'client_union_participant_role',
  ['canonical', 'superseded'],
);

export const clientUnionProjectionAction = pgEnum(
  'client_union_projection_action',
  ['client.union_confirmed', 'client.union_reversed'],
);

export const clientUnionRelationshipOrigin = pgEnum(
  'client_union_relationship_origin',
  ['created', 'reused'],
);

/**
 * The internal operation record. Its identifier never leaves a redacted Company
 * projection; only a reader with complete resolver authority over every
 * affected Company may resolve it.
 */
export const clientUnionOperations = pgTable(
  'client_union_operations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    canonicalClientAccountId: uuid('canonical_client_account_id').notNull(),
    supersededClientAccountId: uuid('superseded_client_account_id').notNull(),
    normalizedIdentifier: text('normalized_identifier').notNull(),
    status: clientUnionOperationStatus('status').default('confirmed').notNull(),
    confirmedByInternalUserId: uuid('confirmed_by_internal_user_id').notNull(),
    confirmedByWorkspaceMembershipId: uuid(
      'confirmed_by_workspace_membership_id',
    ).notNull(),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    unionReason: text('union_reason').notNull(),
    reversedByInternalUserId: uuid('reversed_by_internal_user_id'),
    reversedByWorkspaceMembershipId: uuid(
      'reversed_by_workspace_membership_id',
    ),
    reversedAt: timestamp('reversed_at', { withTimezone: true }),
    reversalReason: text('reversal_reason'),
  },
  (table) => [
    uniqueIndex('client_union_operations_workspace_id_unique').on(
      table.workspaceId,
      table.id,
    ),
    // At most one unreversed union may hold either dossier, which keeps the
    // "already participates in another union" guard out of application code.
    uniqueIndex('client_union_operations_open_canonical_unique')
      .on(table.workspaceId, table.canonicalClientAccountId)
      .where(sql`${table.status} = 'confirmed'`),
    uniqueIndex('client_union_operations_open_superseded_unique')
      .on(table.workspaceId, table.supersededClientAccountId)
      .where(sql`${table.status} = 'confirmed'`),
    index('client_union_operations_identifier_lookup').on(
      table.workspaceId,
      table.normalizedIdentifier,
    ),
    foreignKey({
      name: 'client_union_operations_canonical_client_fk',
      columns: [table.workspaceId, table.canonicalClientAccountId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    foreignKey({
      name: 'client_union_operations_superseded_client_fk',
      columns: [table.workspaceId, table.supersededClientAccountId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    foreignKey({
      name: 'client_union_operations_confirmed_by_fk',
      columns: [
        table.workspaceId,
        table.confirmedByWorkspaceMembershipId,
        table.confirmedByInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    foreignKey({
      name: 'client_union_operations_reversed_by_fk',
      columns: [
        table.workspaceId,
        table.reversedByWorkspaceMembershipId,
        table.reversedByInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'client_union_operations_distinct_participants_check',
      sql`${table.canonicalClientAccountId} <> ${table.supersededClientAccountId}`,
    ),
    check(
      'client_union_operations_identifier_not_blank_check',
      sql`length(${table.normalizedIdentifier}) > 0
        AND ${table.normalizedIdentifier} = btrim(${table.normalizedIdentifier})`,
    ),
    check(
      'client_union_operations_reason_not_blank_check',
      sql`length(btrim(${table.unionReason})) > 0
        AND (${table.reversalReason} IS NULL
          OR length(btrim(${table.reversalReason})) > 0)`,
    ),
    check(
      'client_union_operations_reversal_shape_check',
      sql`(
        (${table.status} = 'confirmed'
          AND ${table.reversedAt} IS NULL
          AND ${table.reversedByInternalUserId} IS NULL
          AND ${table.reversedByWorkspaceMembershipId} IS NULL
          AND ${table.reversalReason} IS NULL)
        OR
        (${table.status} = 'reversed'
          AND ${table.reversedAt} IS NOT NULL
          AND ${table.reversedByInternalUserId} IS NOT NULL
          AND ${table.reversedByWorkspaceMembershipId} IS NOT NULL
          AND ${table.reversalReason} IS NOT NULL)
      )`,
    ),
  ],
);

/** The complete affected-Company set captured at union time. */
export const clientUnionOperationCompanies = pgTable(
  'client_union_operation_companies',
  {
    workspaceId: uuid('workspace_id').notNull(),
    unionOperationId: uuid('union_operation_id').notNull(),
    companyId: uuid('company_id').notNull(),
  },
  (table) => [
    uniqueIndex('client_union_operation_companies_identity_unique').on(
      table.workspaceId,
      table.unionOperationId,
      table.companyId,
    ),
    foreignKey({
      name: 'client_union_operation_companies_operation_fk',
      columns: [table.workspaceId, table.unionOperationId],
      foreignColumns: [
        clientUnionOperations.workspaceId,
        clientUnionOperations.id,
      ],
    }),
    foreignKey({
      name: 'client_union_operation_companies_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
  ],
);

/** The immutable pre-union dossier of each participant. */
export const clientUnionOperationSnapshots = pgTable(
  'client_union_operation_snapshots',
  {
    workspaceId: uuid('workspace_id').notNull(),
    unionOperationId: uuid('union_operation_id').notNull(),
    clientAccountId: uuid('client_account_id').notNull(),
    role: clientUnionParticipantRole('role').notNull(),
    version: integer('version').notNull(),
    displayName: text('display_name').notNull(),
    taxId: text('tax_id'),
    address: text('address'),
    telephone: text('telephone'),
    generalEmail: text('general_email'),
    contacts: jsonb('contacts').$type<ClientUnionContacts>().notNull(),
    businessActivity: text('business_activity'),
  },
  (table) => [
    uniqueIndex('client_union_operation_snapshots_identity_unique').on(
      table.workspaceId,
      table.unionOperationId,
      table.clientAccountId,
    ),
    uniqueIndex('client_union_operation_snapshots_role_unique').on(
      table.workspaceId,
      table.unionOperationId,
      table.role,
    ),
    index('client_union_operation_snapshots_identifier_lookup')
      .on(table.workspaceId, table.taxId)
      .where(sql`${table.taxId} IS NOT NULL`),
    foreignKey({
      name: 'client_union_operation_snapshots_operation_fk',
      columns: [table.workspaceId, table.unionOperationId],
      foreignColumns: [
        clientUnionOperations.workspaceId,
        clientUnionOperations.id,
      ],
    }),
    foreignKey({
      name: 'client_union_operation_snapshots_client_fk',
      columns: [table.workspaceId, table.clientAccountId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    check(
      'client_union_operation_snapshots_positive_version_check',
      sql`${table.version} > 0`,
    ),
  ],
);

/**
 * The canonical Client-Company Relationship used for each affected Company.
 * Reversal removes exactly the projections this union created and leaves a
 * reused pre-existing canonical relationship intact.
 */
export const clientUnionOperationRelationships = pgTable(
  'client_union_operation_relationships',
  {
    workspaceId: uuid('workspace_id').notNull(),
    unionOperationId: uuid('union_operation_id').notNull(),
    companyId: uuid('company_id').notNull(),
    relationshipId: uuid('relationship_id').notNull(),
    clientAccountId: uuid('client_account_id').notNull(),
    origin: clientUnionRelationshipOrigin('origin').notNull(),
    sourceRelationshipId: uuid('source_relationship_id'),
  },
  (table) => [
    uniqueIndex('client_union_operation_relationships_identity_unique').on(
      table.workspaceId,
      table.unionOperationId,
      table.companyId,
    ),
    foreignKey({
      name: 'client_union_operation_relationships_operation_fk',
      columns: [table.workspaceId, table.unionOperationId],
      foreignColumns: [
        clientUnionOperations.workspaceId,
        clientUnionOperations.id,
      ],
    }),
    foreignKey({
      name: 'client_union_operation_relationships_relationship_fk',
      columns: [
        table.workspaceId,
        table.clientAccountId,
        table.companyId,
        table.relationshipId,
      ],
      foreignColumns: [
        clientCompanyRelationships.workspaceId,
        clientCompanyRelationships.clientAccountId,
        clientCompanyRelationships.companyId,
        clientCompanyRelationships.id,
      ],
    }),
    check(
      'client_union_operation_relationships_origin_shape_check',
      sql`(
        (${table.origin} = 'created' AND ${table.sourceRelationshipId} IS NOT NULL)
        OR
        (${table.origin} = 'reused' AND ${table.sourceRelationshipId} IS NULL)
      )`,
    ),
  ],
);

/**
 * One immutable projection per affected Company and per action. Its public
 * reference is unique across the deployment, so it is never reused in another
 * Company scope, and its list position is generated per Company scope rather
 * than derived from the internal action time.
 */
export const clientUnionOperationProjections = pgTable(
  'client_union_operation_projections',
  {
    publicReference: uuid('public_reference').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    unionOperationId: uuid('union_operation_id').notNull(),
    companyId: uuid('company_id').notNull(),
    action: clientUnionProjectionAction('action').notNull(),
    companyLocalPosition: integer('company_local_position').notNull(),
  },
  (table) => [
    uniqueIndex('client_union_operation_projections_action_unique').on(
      table.workspaceId,
      table.unionOperationId,
      table.companyId,
      table.action,
    ),
    uniqueIndex('client_union_operation_projections_position_unique').on(
      table.workspaceId,
      table.companyId,
      table.companyLocalPosition,
    ),
    foreignKey({
      name: 'client_union_operation_projections_operation_fk',
      columns: [table.workspaceId, table.unionOperationId],
      foreignColumns: [
        clientUnionOperations.workspaceId,
        clientUnionOperations.id,
      ],
    }),
    foreignKey({
      name: 'client_union_operation_projections_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    check(
      'client_union_operation_projections_positive_position_check',
      sql`${table.companyLocalPosition} > 0`,
    ),
  ],
);

/**
 * The server-owned comparison of exactly two persisted dossiers. A union
 * command must present a reference whose captured versions and relationships
 * still match the live state.
 */
export const clientUnionComparisons = pgTable(
  'client_union_comparisons',
  {
    reference: uuid('reference').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    selectedCompanyId: uuid('selected_company_id').notNull(),
    normalizedIdentifier: text('normalized_identifier').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('client_union_comparisons_workspace_reference_unique').on(
      table.workspaceId,
      table.reference,
    ),
    foreignKey({
      name: 'client_union_comparisons_actor_fk',
      columns: [table.workspaceId, table.actorWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'client_union_comparisons_selected_company_fk',
      columns: [table.workspaceId, table.selectedCompanyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    check(
      'client_union_comparisons_identifier_not_blank_check',
      sql`length(${table.normalizedIdentifier}) > 0
        AND ${table.normalizedIdentifier} = btrim(${table.normalizedIdentifier})`,
    ),
  ],
);

export const clientUnionComparisonParticipants = pgTable(
  'client_union_comparison_participants',
  {
    workspaceId: uuid('workspace_id').notNull(),
    comparisonReference: uuid('comparison_reference').notNull(),
    clientAccountId: uuid('client_account_id').notNull(),
    capturedVersion: integer('captured_version').notNull(),
  },
  (table) => [
    uniqueIndex('client_union_comparison_participants_identity_unique').on(
      table.workspaceId,
      table.comparisonReference,
      table.clientAccountId,
    ),
    foreignKey({
      name: 'client_union_comparison_participants_comparison_fk',
      columns: [table.workspaceId, table.comparisonReference],
      foreignColumns: [
        clientUnionComparisons.workspaceId,
        clientUnionComparisons.reference,
      ],
    }),
    foreignKey({
      name: 'client_union_comparison_participants_client_fk',
      columns: [table.workspaceId, table.clientAccountId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    check(
      'client_union_comparison_participants_positive_version_check',
      sql`${table.capturedVersion} > 0`,
    ),
  ],
);

export const clientUnionComparisonRelationships = pgTable(
  'client_union_comparison_relationships',
  {
    workspaceId: uuid('workspace_id').notNull(),
    comparisonReference: uuid('comparison_reference').notNull(),
    clientAccountId: uuid('client_account_id').notNull(),
    companyId: uuid('company_id').notNull(),
    relationshipId: uuid('relationship_id').notNull(),
  },
  (table) => [
    uniqueIndex('client_union_comparison_relationships_identity_unique').on(
      table.workspaceId,
      table.comparisonReference,
      table.relationshipId,
    ),
    foreignKey({
      name: 'client_union_comparison_relationships_comparison_fk',
      columns: [table.workspaceId, table.comparisonReference],
      foreignColumns: [
        clientUnionComparisons.workspaceId,
        clientUnionComparisons.reference,
      ],
    }),
    foreignKey({
      name: 'client_union_comparison_relationships_relationship_fk',
      columns: [
        table.workspaceId,
        table.clientAccountId,
        table.companyId,
        table.relationshipId,
      ],
      foreignColumns: [
        clientCompanyRelationships.workspaceId,
        clientCompanyRelationships.clientAccountId,
        clientCompanyRelationships.companyId,
        clientCompanyRelationships.id,
      ],
    }),
  ],
);

/** Union and reversal commands, scoped for idempotent replay. */
export const clientUnionCommands = pgTable(
  'client_union_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    intent: text('intent').notNull(),
    unionOperationId: uuid('union_operation_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('client_union_commands_actor_key_unique').on(
      table.workspaceId,
      table.actorWorkspaceMembershipId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: 'client_union_commands_actor_fk',
      columns: [table.workspaceId, table.actorWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'client_union_commands_operation_fk',
      columns: [table.workspaceId, table.unionOperationId],
      foreignColumns: [
        clientUnionOperations.workspaceId,
        clientUnionOperations.id,
      ],
    }),
    check(
      'client_union_commands_intent_not_blank_check',
      sql`length(${table.intent}) > 0`,
    ),
  ],
);
