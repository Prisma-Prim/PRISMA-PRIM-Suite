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
import {
  companyServiceOfferings,
  serviceDefinitions,
} from './commercial-catalogue.js';
import { clientRequests, opportunities } from './commercial-intake.js';
import { clientAccounts, companies, workspaceMemberships } from './core.js';

// Every pricing configuration record is illustrative in this slice, and the
// only rule shape is server-fixed. The database pins both so no later write
// can relabel an illustrative version as real or reinterpret its shape.
export const PRICING_PROVENANCE = 'ILLUSTRATIVE' as const;
export const PRICING_RULE_SHAPE = 'UNIT_PRICE_TIMES_QUANTITY' as const;
export const PRICING_ROUNDING_MODE = 'HALF_UP' as const;
export const PRICING_ROUNDING_SCALE = 2 as const;
export const PRICING_TAX_APPLICATION = 'PER_LINE' as const;
// The closed illustrative currency set (PRD section 13, row 8). A version
// declares one; nothing converts, combines or totals across currencies.
export const TARIFF_CURRENCIES = ['MDL', 'EUR', 'RON', 'USD'] as const;
export type TariffCurrency = (typeof TARIFF_CURRENCIES)[number];

// Immutable source content is set once at insert. Only the three selection
// columns are written, once, when a successor is published; the head of a
// Company is the one version without a successor.
export const pricingRuleVersions = pgTable(
  'pricing_rule_versions',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    label: text('label').notNull(),
    effectiveFrom: timestamp('effective_from', {
      withTimezone: true,
    }).notNull(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    ruleShape: text('rule_shape', { enum: [PRICING_RULE_SHAPE] })
      .default(PRICING_RULE_SHAPE)
      .notNull(),
    roundingMode: text('rounding_mode', { enum: [PRICING_ROUNDING_MODE] })
      .default(PRICING_ROUNDING_MODE)
      .notNull(),
    roundingScale: integer('rounding_scale')
      .$type<typeof PRICING_ROUNDING_SCALE>()
      .default(PRICING_ROUNDING_SCALE)
      .notNull(),
    taxApplication: text('tax_application', {
      enum: [PRICING_TAX_APPLICATION],
    })
      .default(PRICING_TAX_APPLICATION)
      .notNull(),
    provenance: text('provenance', { enum: [PRICING_PROVENANCE] })
      .default(PRICING_PROVENANCE)
      .notNull(),
    createdByInternalUserId: uuid('created_by_internal_user_id').notNull(),
    createdByWorkspaceMembershipId: uuid(
      'created_by_workspace_membership_id',
    ).notNull(),
    // The publication instant: the one server instant the publishing command
    // decided at, not the physical commit time, which is never stored.
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    supersededByVersionId: uuid('superseded_by_version_id'),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    supersededFrom: timestamp('superseded_from', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('pricing_rule_versions_scope_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
    ),
    uniqueIndex('pricing_rule_versions_scope_id_number_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
      table.versionNumber,
    ),
    uniqueIndex('pricing_rule_versions_number_unique').on(
      table.workspaceId,
      table.companyId,
      table.versionNumber,
    ),
    // At most one head per Company, even for concurrent first publications.
    uniqueIndex('pricing_rule_versions_head_unique')
      .on(table.workspaceId, table.companyId)
      .where(sql`${table.supersededByVersionId} IS NULL`),
    uniqueIndex('pricing_rule_versions_successor_unique')
      .on(table.workspaceId, table.companyId, table.supersededByVersionId)
      .where(sql`${table.supersededByVersionId} IS NOT NULL`),
    foreignKey({
      name: 'pricing_rule_versions_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'pricing_rule_versions_creator_fk',
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
    // The predecessor is taken over before its successor row exists, so the
    // migration declares this constraint DEFERRABLE INITIALLY DEFERRED and
    // PostgreSQL verifies it when the publishing transaction commits.
    foreignKey({
      name: 'pricing_rule_versions_successor_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.supersededByVersionId,
      ],
      foreignColumns: [table.workspaceId, table.companyId, table.id],
    }),
    check(
      'pricing_rule_versions_version_number_check',
      sql`${table.versionNumber} >= 1`,
    ),
    check(
      'pricing_rule_versions_label_check',
      sql`length(${table.label}) BETWEEN 1 AND 120 AND length(btrim(${table.label})) > 0`,
    ),
    check(
      'pricing_rule_versions_window_check',
      sql`${table.effectiveTo} IS NULL OR ${table.effectiveTo} > ${table.effectiveFrom}`,
    ),
    check(
      'pricing_rule_versions_rule_check',
      sql`${table.ruleShape} = 'UNIT_PRICE_TIMES_QUANTITY'
        AND ${table.roundingMode} = 'HALF_UP'
        AND ${table.roundingScale} = 2
        AND ${table.taxApplication} = 'PER_LINE'`,
    ),
    check(
      'pricing_rule_versions_provenance_check',
      sql`${table.provenance} = 'ILLUSTRATIVE'`,
    ),
    check(
      'pricing_rule_versions_supersession_check',
      sql`(
        (${table.supersededByVersionId} IS NULL
          AND ${table.supersededAt} IS NULL
          AND ${table.supersededFrom} IS NULL)
        OR
        (${table.supersededByVersionId} IS NOT NULL
          AND ${table.supersededAt} IS NOT NULL
          AND ${table.supersededFrom} IS NOT NULL
          AND ${table.supersededByVersionId} <> ${table.id}
          AND ${table.supersededFrom} > ${table.effectiveFrom})
      )`,
    ),
  ],
);

// One offering's illustrative Tariff Versions. Immutable content is set once
// at insert; only the three selection columns are written, once, when a
// successor of the same offering is published. The head of an offering is its
// one version without a successor.
export const tariffVersions = pgTable(
  'tariff_versions',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    offeringId: uuid('offering_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    unit: text('unit').notNull(),
    // Stored at the section 8.1 precision and read back at column scale.
    unitAmount: numeric('unit_amount', {
      precision: 11,
      scale: 4,
      mode: 'string',
    }).notNull(),
    currency: text('currency', { enum: TARIFF_CURRENCIES }).notNull(),
    taxRatePercent: numeric('tax_rate_percent', {
      precision: 5,
      scale: 2,
      mode: 'string',
    }).notNull(),
    taxLabel: text('tax_label').notNull(),
    effectiveFrom: timestamp('effective_from', {
      withTimezone: true,
    }).notNull(),
    effectiveTo: timestamp('effective_to', { withTimezone: true }),
    provenance: text('provenance', { enum: [PRICING_PROVENANCE] })
      .default(PRICING_PROVENANCE)
      .notNull(),
    createdByInternalUserId: uuid('created_by_internal_user_id').notNull(),
    createdByWorkspaceMembershipId: uuid(
      'created_by_workspace_membership_id',
    ).notNull(),
    // The publication instant: the one server instant the publishing command
    // decided at, not the physical commit time, which is never stored.
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    supersededByVersionId: uuid('superseded_by_version_id'),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    supersededFrom: timestamp('superseded_from', { withTimezone: true }),
  },
  (table) => [
    // Targets of the receipt and event references, which name the Company.
    uniqueIndex('tariff_versions_company_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
    ),
    // Target of the successor reference, which stays inside one offering.
    uniqueIndex('tariff_versions_offering_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.offeringId,
      table.id,
    ),
    uniqueIndex('tariff_versions_offering_id_number_unique').on(
      table.workspaceId,
      table.companyId,
      table.offeringId,
      table.id,
      table.versionNumber,
    ),
    uniqueIndex('tariff_versions_number_unique').on(
      table.workspaceId,
      table.companyId,
      table.offeringId,
      table.versionNumber,
    ),
    // At most one head per offering, even for concurrent first publications.
    uniqueIndex('tariff_versions_head_unique')
      .on(table.workspaceId, table.companyId, table.offeringId)
      .where(sql`${table.supersededByVersionId} IS NULL`),
    uniqueIndex('tariff_versions_successor_unique')
      .on(
        table.workspaceId,
        table.companyId,
        table.offeringId,
        table.supersededByVersionId,
      )
      .where(sql`${table.supersededByVersionId} IS NOT NULL`),
    // The offering belongs to the same Workspace and Company.
    foreignKey({
      name: 'tariff_versions_offering_fk',
      columns: [table.workspaceId, table.companyId, table.offeringId],
      foreignColumns: [
        companyServiceOfferings.workspaceId,
        companyServiceOfferings.companyId,
        companyServiceOfferings.id,
      ],
    }),
    foreignKey({
      name: 'tariff_versions_creator_fk',
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
    // The predecessor is taken over before its successor row exists, so the
    // migration declares this constraint DEFERRABLE INITIALLY DEFERRED and
    // PostgreSQL verifies it when the publishing transaction commits.
    foreignKey({
      name: 'tariff_versions_successor_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.offeringId,
        table.supersededByVersionId,
      ],
      foreignColumns: [
        table.workspaceId,
        table.companyId,
        table.offeringId,
        table.id,
      ],
    }),
    check(
      'tariff_versions_version_number_check',
      sql`${table.versionNumber} >= 1`,
    ),
    check(
      'tariff_versions_unit_check',
      sql`length(${table.unit}) BETWEEN 1 AND 24 AND length(btrim(${table.unit})) > 0`,
    ),
    check(
      'tariff_versions_tax_label_check',
      sql`length(${table.taxLabel}) BETWEEN 1 AND 60 AND length(btrim(${table.taxLabel})) > 0`,
    ),
    check('tariff_versions_unit_amount_check', sql`${table.unitAmount} > 0`),
    check(
      'tariff_versions_tax_rate_percent_check',
      sql`${table.taxRatePercent} BETWEEN 0 AND 100`,
    ),
    check(
      'tariff_versions_currency_check',
      sql`${table.currency} IN ('MDL', 'EUR', 'RON', 'USD')`,
    ),
    check(
      'tariff_versions_window_check',
      sql`${table.effectiveTo} IS NULL OR ${table.effectiveTo} > ${table.effectiveFrom}`,
    ),
    check(
      'tariff_versions_provenance_check',
      sql`${table.provenance} = 'ILLUSTRATIVE'`,
    ),
    check(
      'tariff_versions_supersession_check',
      sql`(
        (${table.supersededByVersionId} IS NULL
          AND ${table.supersededAt} IS NULL
          AND ${table.supersededFrom} IS NULL)
        OR
        (${table.supersededByVersionId} IS NOT NULL
          AND ${table.supersededAt} IS NOT NULL
          AND ${table.supersededFrom} IS NOT NULL
          AND ${table.supersededByVersionId} <> ${table.id}
          AND ${table.supersededFrom} > ${table.effectiveFrom})
      )`,
    ),
  ],
);

// One immutable calculation result. Configuration advances never update this
// row or its lines; a deliberate recalculation creates another snapshot.
export const pricingSnapshots = pgTable(
  'pricing_snapshots',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    opportunityId: uuid('opportunity_id').notNull(),
    clientRequestId: uuid('client_request_id').notNull(),
    originalClientAccountId: uuid('original_client_account_id'),
    pricingRuleVersionId: uuid('pricing_rule_version_id').notNull(),
    pricingRuleVersionNumber: integer('pricing_rule_version_number').notNull(),
    ruleShape: text('rule_shape', { enum: [PRICING_RULE_SHAPE] }).notNull(),
    roundingMode: text('rounding_mode', {
      enum: [PRICING_ROUNDING_MODE],
    }).notNull(),
    roundingScale: integer('rounding_scale')
      .$type<typeof PRICING_ROUNDING_SCALE>()
      .notNull(),
    taxApplication: text('tax_application', {
      enum: [PRICING_TAX_APPLICATION],
    }).notNull(),
    currency: text('currency', { enum: TARIFF_CURRENCIES }).notNull(),
    subtotal: numeric('subtotal', {
      precision: 24,
      scale: 2,
      mode: 'string',
    }).notNull(),
    taxTotal: numeric('tax_total', {
      precision: 24,
      scale: 2,
      mode: 'string',
    }).notNull(),
    total: numeric('total', {
      precision: 24,
      scale: 2,
      mode: 'string',
    }).notNull(),
    calculatedByInternalUserId: uuid(
      'calculated_by_internal_user_id',
    ).notNull(),
    calculatedByWorkspaceMembershipId: uuid(
      'calculated_by_workspace_membership_id',
    ).notNull(),
    calculatedAt: timestamp('calculated_at', { withTimezone: true }).notNull(),
    committedAt: timestamp('committed_at', { withTimezone: true }).notNull(),
    version: integer('version').default(1).notNull(),
    provenance: text('provenance', { enum: [PRICING_PROVENANCE] })
      .default(PRICING_PROVENANCE)
      .notNull(),
  },
  (table) => [
    uniqueIndex('pricing_snapshots_scope_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
    ),
    uniqueIndex('pricing_snapshots_line_trace_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
      table.currency,
      table.ruleShape,
    ),
    index('pricing_snapshots_opportunity_newest_index').on(
      table.workspaceId,
      table.companyId,
      table.opportunityId,
      table.calculatedAt,
      table.id,
    ),
    foreignKey({
      name: 'pricing_snapshots_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'pricing_snapshots_opportunity_fk',
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
      name: 'pricing_snapshots_request_fk',
      columns: [table.workspaceId, table.companyId, table.clientRequestId],
      foreignColumns: [
        clientRequests.workspaceId,
        clientRequests.companyId,
        clientRequests.id,
      ],
    }),
    foreignKey({
      name: 'pricing_snapshots_original_client_fk',
      columns: [table.workspaceId, table.originalClientAccountId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    foreignKey({
      name: 'pricing_snapshots_rule_version_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.pricingRuleVersionId,
        table.pricingRuleVersionNumber,
      ],
      foreignColumns: [
        pricingRuleVersions.workspaceId,
        pricingRuleVersions.companyId,
        pricingRuleVersions.id,
        pricingRuleVersions.versionNumber,
      ],
    }),
    foreignKey({
      name: 'pricing_snapshots_calculator_fk',
      columns: [
        table.workspaceId,
        table.calculatedByWorkspaceMembershipId,
        table.calculatedByInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'pricing_snapshots_trace_check',
      sql`${table.version} = 1
        AND ${table.provenance} = 'ILLUSTRATIVE'
        AND ${table.ruleShape} = 'UNIT_PRICE_TIMES_QUANTITY'
        AND ${table.roundingMode} = 'HALF_UP'
        AND ${table.roundingScale} = 2
        AND ${table.taxApplication} = 'PER_LINE'
        AND ${table.pricingRuleVersionNumber} >= 1
        AND ${table.committedAt} >= ${table.calculatedAt}
        AND ${table.subtotal} >= 0
        AND ${table.taxTotal} >= 0
        AND ${table.total} = ${table.subtotal} + ${table.taxTotal}`,
    ),
  ],
);

// Submitted order and every copied source value make each stored line a
// complete replayable trace, without consulting current configuration.
export const pricingSnapshotLines = pgTable(
  'pricing_snapshot_lines',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    snapshotId: uuid('snapshot_id').notNull(),
    lineNumber: integer('line_number').notNull(),
    serviceDefinitionId: uuid('service_definition_id').notNull(),
    serviceCode: text('service_code').notNull(),
    serviceName: text('service_name').notNull(),
    offeringId: uuid('offering_id').notNull(),
    commercialLabel: text('commercial_label'),
    tariffVersionId: uuid('tariff_version_id').notNull(),
    tariffVersionNumber: integer('tariff_version_number').notNull(),
    unit: text('unit').notNull(),
    unitAmount: numeric('unit_amount', {
      precision: 11,
      scale: 4,
      mode: 'string',
    }).notNull(),
    currency: text('currency', { enum: TARIFF_CURRENCIES }).notNull(),
    taxRatePercent: numeric('tax_rate_percent', {
      precision: 5,
      scale: 2,
      mode: 'string',
    }).notNull(),
    taxLabel: text('tax_label').notNull(),
    quantity: numeric('quantity', {
      precision: 12,
      scale: 3,
      mode: 'string',
    }).notNull(),
    quantityInput: text('quantity_input').notNull(),
    ruleShape: text('rule_shape', { enum: [PRICING_RULE_SHAPE] }).notNull(),
    rawLineAmount: numeric('raw_line_amount', {
      precision: 28,
      scale: 7,
      mode: 'string',
    }).notNull(),
    lineNet: numeric('line_net', {
      precision: 24,
      scale: 2,
      mode: 'string',
    }).notNull(),
    rawLineTax: numeric('raw_line_tax', {
      precision: 28,
      scale: 7,
      mode: 'string',
    }).notNull(),
    lineTax: numeric('line_tax', {
      precision: 24,
      scale: 2,
      mode: 'string',
    }).notNull(),
  },
  (table) => [
    uniqueIndex('pricing_snapshot_lines_order_unique').on(
      table.workspaceId,
      table.companyId,
      table.snapshotId,
      table.lineNumber,
    ),
    uniqueIndex('pricing_snapshot_lines_offering_unique').on(
      table.workspaceId,
      table.companyId,
      table.snapshotId,
      table.offeringId,
    ),
    foreignKey({
      name: 'pricing_snapshot_lines_snapshot_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.snapshotId,
        table.currency,
        table.ruleShape,
      ],
      foreignColumns: [
        pricingSnapshots.workspaceId,
        pricingSnapshots.companyId,
        pricingSnapshots.id,
        pricingSnapshots.currency,
        pricingSnapshots.ruleShape,
      ],
    }),
    foreignKey({
      name: 'pricing_snapshot_lines_definition_fk',
      columns: [table.workspaceId, table.serviceDefinitionId],
      foreignColumns: [serviceDefinitions.workspaceId, serviceDefinitions.id],
    }),
    foreignKey({
      name: 'pricing_snapshot_lines_offering_definition_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.offeringId,
        table.serviceDefinitionId,
      ],
      foreignColumns: [
        companyServiceOfferings.workspaceId,
        companyServiceOfferings.companyId,
        companyServiceOfferings.id,
        companyServiceOfferings.serviceDefinitionId,
      ],
    }),
    foreignKey({
      name: 'pricing_snapshot_lines_tariff_version_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.offeringId,
        table.tariffVersionId,
        table.tariffVersionNumber,
      ],
      foreignColumns: [
        tariffVersions.workspaceId,
        tariffVersions.companyId,
        tariffVersions.offeringId,
        tariffVersions.id,
        tariffVersions.versionNumber,
      ],
    }),
    check(
      'pricing_snapshot_lines_trace_check',
      sql`${table.lineNumber} BETWEEN 1 AND 20
        AND ${table.tariffVersionNumber} >= 1
        AND ${table.ruleShape} = 'UNIT_PRICE_TIMES_QUANTITY'
        AND ${table.unitAmount} > 0
        AND ${table.quantity} > 0
        AND ${table.quantityInput}::numeric = ${table.quantity}
        AND ${table.taxRatePercent} BETWEEN 0 AND 100
        AND ${table.rawLineAmount} >= 0
        AND ${table.lineNet} >= 0
        AND ${table.rawLineTax} >= 0
        AND ${table.lineTax} >= 0`,
    ),
  ],
);

// One durable receipt per (actor, Company, key), including UNCHANGED no-ops
// that allocated no version and recorded no event. Rule and tariff
// publications share this one key namespace; each receipt references exactly
// the version kind its command publishes.
export const pricingConfigurationCommands = pgTable(
  'pricing_configuration_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    command: text('command', {
      enum: [
        'pricing_rule_version.publish',
        'tariff_version.publish',
        'pricing_snapshot.calculate',
      ],
    }).notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    outcome: text('outcome', {
      enum: ['PUBLISHED', 'UNCHANGED', 'CREATED'],
    }).notNull(),
    resultPricingRuleVersionId: uuid('result_pricing_rule_version_id'),
    resultTariffVersionId: uuid('result_tariff_version_id'),
    resultPricingSnapshotId: uuid('result_pricing_snapshot_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('pricing_configuration_commands_actor_key_unique').on(
      table.workspaceId,
      table.companyId,
      table.actorWorkspaceMembershipId,
      table.idempotencyKey,
    ),
    // Exactly one receipt publishes a given version of either kind.
    uniqueIndex('pricing_configuration_commands_published_unique')
      .on(table.workspaceId, table.companyId, table.resultPricingRuleVersionId)
      .where(sql`${table.outcome} = 'PUBLISHED'`),
    uniqueIndex('pricing_configuration_commands_tariff_published_unique')
      .on(table.workspaceId, table.companyId, table.resultTariffVersionId)
      .where(sql`${table.outcome} = 'PUBLISHED'`),
    uniqueIndex('pricing_configuration_commands_snapshot_unique')
      .on(table.workspaceId, table.companyId, table.resultPricingSnapshotId)
      .where(sql`${table.command} = 'pricing_snapshot.calculate'`),
    foreignKey({
      name: 'pricing_configuration_commands_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'pricing_configuration_commands_actor_fk',
      columns: [table.workspaceId, table.actorWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'pricing_configuration_commands_rule_version_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.resultPricingRuleVersionId,
      ],
      foreignColumns: [
        pricingRuleVersions.workspaceId,
        pricingRuleVersions.companyId,
        pricingRuleVersions.id,
      ],
    }),
    foreignKey({
      name: 'pricing_configuration_commands_tariff_version_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.resultTariffVersionId,
      ],
      foreignColumns: [
        tariffVersions.workspaceId,
        tariffVersions.companyId,
        tariffVersions.id,
      ],
    }),
    foreignKey({
      name: 'pricing_configuration_commands_snapshot_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.resultPricingSnapshotId,
      ],
      foreignColumns: [
        pricingSnapshots.workspaceId,
        pricingSnapshots.companyId,
        pricingSnapshots.id,
      ],
    }),
    // Exactly one result reference, of the kind the command publishes.
    check(
      'pricing_configuration_commands_result_check',
      sql`(
        (${table.command} = 'pricing_rule_version.publish'
          AND ${table.outcome} IN ('PUBLISHED', 'UNCHANGED')
          AND ${table.resultPricingRuleVersionId} IS NOT NULL
          AND ${table.resultTariffVersionId} IS NULL
          AND ${table.resultPricingSnapshotId} IS NULL)
        OR
        (${table.command} = 'tariff_version.publish'
          AND ${table.outcome} IN ('PUBLISHED', 'UNCHANGED')
          AND ${table.resultTariffVersionId} IS NOT NULL
          AND ${table.resultPricingRuleVersionId} IS NULL
          AND ${table.resultPricingSnapshotId} IS NULL)
        OR
        (${table.command} = 'pricing_snapshot.calculate'
          AND ${table.outcome} = 'CREATED'
          AND ${table.resultPricingSnapshotId} IS NOT NULL
          AND ${table.resultPricingRuleVersionId} IS NULL
          AND ${table.resultTariffVersionId} IS NULL)
      )`,
    ),
  ],
);

// Recorded but projected nowhere: no Activity read surface returns these
// events, and the commercial Activity allowlist is owned elsewhere.
export const pricingConfigurationEvents = pgTable(
  'pricing_configuration_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    action: text('action', {
      enum: [
        'pricing_rule_version.published',
        'tariff_version.published',
        'pricing_snapshot.created',
      ],
    }).notNull(),
    pricingRuleVersionId: uuid('pricing_rule_version_id'),
    tariffVersionId: uuid('tariff_version_id'),
    pricingSnapshotId: uuid('pricing_snapshot_id'),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    metadata: jsonb('metadata').$type<unknown>().notNull(),
  },
  (table) => [
    uniqueIndex('pricing_configuration_events_rule_published_unique')
      .on(table.workspaceId, table.pricingRuleVersionId)
      .where(sql`${table.action} = 'pricing_rule_version.published'`),
    uniqueIndex('pricing_configuration_events_tariff_published_unique')
      .on(table.workspaceId, table.tariffVersionId)
      .where(sql`${table.action} = 'tariff_version.published'`),
    uniqueIndex('pricing_configuration_events_snapshot_created_unique')
      .on(table.workspaceId, table.pricingSnapshotId)
      .where(sql`${table.action} = 'pricing_snapshot.created'`),
    foreignKey({
      name: 'pricing_configuration_events_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'pricing_configuration_events_rule_version_fk',
      columns: [table.workspaceId, table.companyId, table.pricingRuleVersionId],
      foreignColumns: [
        pricingRuleVersions.workspaceId,
        pricingRuleVersions.companyId,
        pricingRuleVersions.id,
      ],
    }),
    foreignKey({
      name: 'pricing_configuration_events_tariff_version_fk',
      columns: [table.workspaceId, table.companyId, table.tariffVersionId],
      foreignColumns: [
        tariffVersions.workspaceId,
        tariffVersions.companyId,
        tariffVersions.id,
      ],
    }),
    foreignKey({
      name: 'pricing_configuration_events_snapshot_fk',
      columns: [table.workspaceId, table.companyId, table.pricingSnapshotId],
      foreignColumns: [
        pricingSnapshots.workspaceId,
        pricingSnapshots.companyId,
        pricingSnapshots.id,
      ],
    }),
    foreignKey({
      name: 'pricing_configuration_events_actor_fk',
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
    // Exactly one version reference, of the kind the action records.
    check(
      'pricing_configuration_events_reference_check',
      sql`(
        (${table.action} = 'pricing_rule_version.published'
          AND ${table.pricingRuleVersionId} IS NOT NULL
          AND ${table.tariffVersionId} IS NULL
          AND ${table.pricingSnapshotId} IS NULL)
        OR
        (${table.action} = 'tariff_version.published'
          AND ${table.tariffVersionId} IS NOT NULL
          AND ${table.pricingRuleVersionId} IS NULL
          AND ${table.pricingSnapshotId} IS NULL)
        OR
        (${table.action} = 'pricing_snapshot.created'
          AND ${table.pricingSnapshotId} IS NOT NULL
          AND ${table.pricingRuleVersionId} IS NULL
          AND ${table.tariffVersionId} IS NULL)
      )`,
    ),
    // Metadata carries identifiers, the version number, provenance and, for a
    // tariff, its currency only: no amount, rate, unit, label or other text.
    // Each key is required with its JSON type. A missing key makes a
    // comparison unknown, which a CHECK alone accepts, so the condition of
    // the event's own action must hold outright.
    check(
      'pricing_configuration_events_action_metadata_check',
      sql`(
        ${table.action} = 'pricing_rule_version.published'
          AND ${table.metadata} - 'pricingRuleVersionId' - 'versionNumber' - 'provenance' = '{}'::jsonb
          AND jsonb_typeof(${table.metadata} -> 'pricingRuleVersionId') = 'string'
          AND ${table.metadata} ->> 'pricingRuleVersionId' = ${table.pricingRuleVersionId}::text
          AND jsonb_typeof(${table.metadata} -> 'versionNumber') = 'number'
          AND jsonb_typeof(${table.metadata} -> 'provenance') = 'string'
          AND ${table.metadata} ->> 'provenance' = 'ILLUSTRATIVE'
          AND ${table.pricingSnapshotId} IS NULL
      ) IS TRUE
      OR (
        ${table.action} = 'tariff_version.published'
          AND ${table.metadata} - 'tariffVersionId' - 'offeringId' - 'versionNumber' - 'provenance' - 'currency' = '{}'::jsonb
          AND jsonb_typeof(${table.metadata} -> 'tariffVersionId') = 'string'
          AND ${table.metadata} ->> 'tariffVersionId' = ${table.tariffVersionId}::text
          AND jsonb_typeof(${table.metadata} -> 'offeringId') = 'string'
          AND jsonb_typeof(${table.metadata} -> 'versionNumber') = 'number'
          AND jsonb_typeof(${table.metadata} -> 'provenance') = 'string'
          AND ${table.metadata} ->> 'provenance' = 'ILLUSTRATIVE'
          AND jsonb_typeof(${table.metadata} -> 'currency') = 'string'
          AND ${table.metadata} ->> 'currency' IN ('MDL', 'EUR', 'RON', 'USD')
          AND ${table.pricingSnapshotId} IS NULL
      ) IS TRUE
      OR (
        ${table.action} = 'pricing_snapshot.created'
          AND ${table.metadata} - 'pricingSnapshotId' - 'opportunityId' - 'lineCount' - 'provenance' - 'currency' = '{}'::jsonb
          AND jsonb_typeof(${table.metadata} -> 'pricingSnapshotId') = 'string'
          AND ${table.metadata} ->> 'pricingSnapshotId' = ${table.pricingSnapshotId}::text
          AND jsonb_typeof(${table.metadata} -> 'opportunityId') = 'string'
          AND jsonb_typeof(${table.metadata} -> 'lineCount') = 'number'
          AND (${table.metadata} ->> 'lineCount')::integer BETWEEN 1 AND 20
          AND jsonb_typeof(${table.metadata} -> 'provenance') = 'string'
          AND ${table.metadata} ->> 'provenance' = 'ILLUSTRATIVE'
          AND jsonb_typeof(${table.metadata} -> 'currency') = 'string'
          AND ${table.metadata} ->> 'currency' IN ('MDL', 'EUR', 'RON', 'USD')
      ) IS TRUE`,
    ),
  ],
);
