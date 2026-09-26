import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { companyServiceOfferings } from './commercial-catalogue.js';
import { companies, workspaceMemberships } from './core.js';

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
      enum: ['pricing_rule_version.publish', 'tariff_version.publish'],
    }).notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    outcome: text('outcome', { enum: ['PUBLISHED', 'UNCHANGED'] }).notNull(),
    resultPricingRuleVersionId: uuid('result_pricing_rule_version_id'),
    resultTariffVersionId: uuid('result_tariff_version_id'),
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
    // Exactly one result reference, of the kind the command publishes.
    check(
      'pricing_configuration_commands_result_check',
      sql`(
        (${table.command} = 'pricing_rule_version.publish'
          AND ${table.resultPricingRuleVersionId} IS NOT NULL
          AND ${table.resultTariffVersionId} IS NULL)
        OR
        (${table.command} = 'tariff_version.publish'
          AND ${table.resultTariffVersionId} IS NOT NULL
          AND ${table.resultPricingRuleVersionId} IS NULL)
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
      enum: ['pricing_rule_version.published', 'tariff_version.published'],
    }).notNull(),
    pricingRuleVersionId: uuid('pricing_rule_version_id'),
    tariffVersionId: uuid('tariff_version_id'),
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
          AND ${table.tariffVersionId} IS NULL)
        OR
        (${table.action} = 'tariff_version.published'
          AND ${table.tariffVersionId} IS NOT NULL
          AND ${table.pricingRuleVersionId} IS NULL)
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
      ) IS TRUE`,
    ),
  ],
);
