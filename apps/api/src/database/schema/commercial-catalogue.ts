import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies, workspaceMemberships, workspaces } from './core.js';

// Every catalogue record is illustrative in this slice. The database pins the
// provenance so no later write can relabel an illustrative record as real.
export const CATALOGUE_PROVENANCE = 'ILLUSTRATIVE' as const;

export const serviceDefinitions = pgTable(
  'service_definitions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    provenance: text('provenance', { enum: [CATALOGUE_PROVENANCE] })
      .default(CATALOGUE_PROVENANCE)
      .notNull(),
    createdByInternalUserId: uuid('created_by_internal_user_id').notNull(),
    createdByWorkspaceMembershipId: uuid(
      'created_by_workspace_membership_id',
    ).notNull(),
    // Attribution only: the active Company of the creator at commit time. A
    // Service Definition is shared Workspace vocabulary and is never owned by
    // or scoped to this Company.
    createdInCompanyId: uuid('created_in_company_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('service_definitions_workspace_code_unique').on(
      table.workspaceId,
      table.code,
    ),
    uniqueIndex('service_definitions_workspace_id_id_unique').on(
      table.workspaceId,
      table.id,
    ),
    index('service_definitions_workspace_newest_index').on(
      table.workspaceId,
      table.createdAt,
      table.id,
    ),
    foreignKey({
      name: 'service_definitions_creator_fk',
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
    foreignKey({
      name: 'service_definitions_created_in_company_fk',
      columns: [table.workspaceId, table.createdInCompanyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    check(
      'service_definitions_code_check',
      sql`${table.code} ~ '^[A-Z0-9_-]{1,40}$'`,
    ),
    check(
      'service_definitions_name_check',
      sql`length(${table.name}) BETWEEN 1 AND 160 AND length(btrim(${table.name})) > 0`,
    ),
    check(
      'service_definitions_description_check',
      sql`${table.description} IS NULL OR length(${table.description}) <= 2000`,
    ),
    check(
      'service_definitions_provenance_check',
      sql`${table.provenance} = 'ILLUSTRATIVE'`,
    ),
  ],
);

export const companyServiceOfferings = pgTable(
  'company_service_offerings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    serviceDefinitionId: uuid('service_definition_id').notNull(),
    commercialLabel: text('commercial_label'),
    availability: text('availability', { enum: ['AVAILABLE'] })
      .default('AVAILABLE')
      .notNull(),
    provenance: text('provenance', { enum: [CATALOGUE_PROVENANCE] })
      .default(CATALOGUE_PROVENANCE)
      .notNull(),
    createdByInternalUserId: uuid('created_by_internal_user_id').notNull(),
    createdByWorkspaceMembershipId: uuid(
      'created_by_workspace_membership_id',
    ).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Uniqueness is scoped by provenance so a later governed real offering may
    // coexist with the illustrative one; every row here is still ILLUSTRATIVE.
    uniqueIndex('company_service_offerings_definition_unique').on(
      table.workspaceId,
      table.companyId,
      table.serviceDefinitionId,
      table.provenance,
    ),
    uniqueIndex('company_service_offerings_scope_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
    ),
    uniqueIndex('company_service_offerings_scope_id_definition_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
      table.serviceDefinitionId,
    ),
    index('company_service_offerings_company_newest_index').on(
      table.workspaceId,
      table.companyId,
      table.createdAt,
      table.id,
    ),
    foreignKey({
      name: 'company_service_offerings_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'company_service_offerings_definition_fk',
      columns: [table.workspaceId, table.serviceDefinitionId],
      foreignColumns: [serviceDefinitions.workspaceId, serviceDefinitions.id],
    }),
    foreignKey({
      name: 'company_service_offerings_creator_fk',
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
      'company_service_offerings_label_check',
      sql`${table.commercialLabel} IS NULL OR length(${table.commercialLabel}) <= 160`,
    ),
    check(
      'company_service_offerings_availability_check',
      sql`${table.availability} = 'AVAILABLE'`,
    ),
    check(
      'company_service_offerings_provenance_check',
      sql`${table.provenance} = 'ILLUSTRATIVE'`,
    ),
  ],
);

// One durable receipt per (actor, Company, key), including UNCHANGED no-ops
// that created no record and no event.
export const commercialCatalogueCommands = pgTable(
  'commercial_catalogue_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    command: text('command', {
      enum: ['service_definition.create', 'company_service_offering.create'],
    }).notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    outcome: text('outcome', { enum: ['CREATED', 'UNCHANGED'] }).notNull(),
    resultServiceDefinitionId: uuid('result_service_definition_id'),
    resultOfferingId: uuid('result_offering_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('commercial_catalogue_commands_actor_key_unique').on(
      table.workspaceId,
      table.companyId,
      table.actorWorkspaceMembershipId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: 'commercial_catalogue_commands_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'commercial_catalogue_commands_actor_fk',
      columns: [table.workspaceId, table.actorWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'commercial_catalogue_commands_definition_fk',
      columns: [table.workspaceId, table.resultServiceDefinitionId],
      foreignColumns: [serviceDefinitions.workspaceId, serviceDefinitions.id],
    }),
    foreignKey({
      name: 'commercial_catalogue_commands_offering_fk',
      columns: [table.workspaceId, table.companyId, table.resultOfferingId],
      foreignColumns: [
        companyServiceOfferings.workspaceId,
        companyServiceOfferings.companyId,
        companyServiceOfferings.id,
      ],
    }),
    check(
      'commercial_catalogue_commands_result_shape_check',
      sql`(
        (${table.command} = 'service_definition.create'
          AND ${table.resultServiceDefinitionId} IS NOT NULL
          AND ${table.resultOfferingId} IS NULL)
        OR
        (${table.command} = 'company_service_offering.create'
          AND ${table.resultServiceDefinitionId} IS NULL
          AND ${table.resultOfferingId} IS NOT NULL)
      )`,
    ),
  ],
);

// Recorded but projected nowhere: no Activity read surface returns these events
// in this slice, and the commercial Activity allowlist is owned elsewhere.
export const commercialCatalogueEvents = pgTable(
  'commercial_catalogue_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    action: text('action', {
      enum: ['service_definition.created', 'company_service_offering.created'],
    }).notNull(),
    serviceDefinitionId: uuid('service_definition_id').notNull(),
    offeringId: uuid('offering_id'),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    metadata: jsonb('metadata').$type<unknown>().notNull(),
  },
  (table) => [
    uniqueIndex('commercial_catalogue_events_definition_created_unique')
      .on(table.workspaceId, table.serviceDefinitionId)
      .where(sql`${table.action} = 'service_definition.created'`),
    uniqueIndex('commercial_catalogue_events_offering_created_unique')
      .on(table.workspaceId, table.offeringId)
      .where(sql`${table.action} = 'company_service_offering.created'`),
    foreignKey({
      name: 'commercial_catalogue_events_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'commercial_catalogue_events_definition_fk',
      columns: [table.workspaceId, table.serviceDefinitionId],
      foreignColumns: [serviceDefinitions.workspaceId, serviceDefinitions.id],
    }),
    foreignKey({
      name: 'commercial_catalogue_events_offering_fk',
      columns: [table.workspaceId, table.companyId, table.offeringId],
      foreignColumns: [
        companyServiceOfferings.workspaceId,
        companyServiceOfferings.companyId,
        companyServiceOfferings.id,
      ],
    }),
    foreignKey({
      name: 'commercial_catalogue_events_actor_fk',
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
    // Metadata is limited to identifiers, provenance and code: no label text.
    check(
      'commercial_catalogue_events_action_metadata_check',
      sql`(
        (${table.action} = 'service_definition.created'
          AND ${table.offeringId} IS NULL
          AND ${table.metadata} - 'serviceDefinitionId' - 'code' - 'provenance' = '{}'::jsonb
          AND ${table.metadata} ->> 'serviceDefinitionId' = ${table.serviceDefinitionId}::text
          AND ${table.metadata} ->> 'provenance' = 'ILLUSTRATIVE')
        OR
        (${table.action} = 'company_service_offering.created'
          AND ${table.offeringId} IS NOT NULL
          AND ${table.metadata} - 'serviceDefinitionId' - 'offeringId' - 'code' - 'provenance' = '{}'::jsonb
          AND ${table.metadata} ->> 'serviceDefinitionId' = ${table.serviceDefinitionId}::text
          AND ${table.metadata} ->> 'offeringId' = ${table.offeringId}::text
          AND ${table.metadata} ->> 'provenance' = 'ILLUSTRATIVE')
      )`,
    ),
  ],
);
