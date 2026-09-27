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
} from 'drizzle-orm/pg-core';
import {
  clientAccounts,
  clientCompanyRelationships,
  workspaceMemberships,
} from './core.js';

/**
 * An additional Client Legal Entity or branch recorded in a shared Client
 * dossier. It is shared general identity: its identifier takes part in no
 * duplicate predicate, reservation, uniqueness rule or search.
 */
export const clientLegalEntities = pgTable(
  'client_legal_entities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    clientAccountId: uuid('client_account_id').notNull(),
    legalName: text('legal_name').notNull(),
    taxId: text('tax_id'),
    legalAddress: text('legal_address'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdByInternalUserId: uuid('created_by_internal_user_id').notNull(),
    createdByWorkspaceMembershipId: uuid(
      'created_by_workspace_membership_id',
    ).notNull(),
  },
  (table) => [
    uniqueIndex('client_legal_entities_client_unique').on(
      table.workspaceId,
      table.clientAccountId,
      table.id,
    ),
    foreignKey({
      name: 'client_legal_entities_client_fk',
      columns: [table.workspaceId, table.clientAccountId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    foreignKey({
      name: 'client_legal_entities_creator_membership_fk',
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
      'client_legal_entities_legal_name_check',
      sql`char_length(${table.legalName}) BETWEEN 1 AND 200`,
    ),
    check(
      'client_legal_entities_tax_id_check',
      sql`${table.taxId} IS NULL OR char_length(${table.taxId}) BETWEEN 1 AND 500`,
    ),
    check(
      'client_legal_entities_legal_address_check',
      sql`${table.legalAddress} IS NULL OR char_length(${table.legalAddress}) BETWEEN 1 AND 2000`,
    ),
  ],
);

/**
 * The durable receipt of one registration or correction, keyed by the acting
 * membership's idempotency key. `intent` holds the normalized request and
 * `result` the response returned to an exact replay.
 */
export const clientLegalEntityCommands = pgTable(
  'client_legal_entity_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    action: text('action').$type<'register' | 'correct'>().notNull(),
    clientAccountId: uuid('client_account_id').notNull(),
    companyId: uuid('company_id').notNull(),
    legalEntityId: uuid('legal_entity_id'),
    expectedClientVersion: integer('expected_client_version').notNull(),
    intent: jsonb('intent').$type<unknown>().notNull(),
    result: jsonb('result').$type<unknown>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('client_legal_entity_commands_actor_key_unique').on(
      table.workspaceId,
      table.actorWorkspaceMembershipId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: 'client_legal_entity_commands_actor_fk',
      columns: [table.workspaceId, table.actorWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'client_legal_entity_commands_client_fk',
      columns: [table.workspaceId, table.clientAccountId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    foreignKey({
      name: 'client_legal_entity_commands_relationship_fk',
      columns: [table.workspaceId, table.clientAccountId, table.companyId],
      foreignColumns: [
        clientCompanyRelationships.workspaceId,
        clientCompanyRelationships.clientAccountId,
        clientCompanyRelationships.companyId,
      ],
    }),
    foreignKey({
      name: 'client_legal_entity_commands_legal_entity_fk',
      columns: [table.workspaceId, table.clientAccountId, table.legalEntityId],
      foreignColumns: [
        clientLegalEntities.workspaceId,
        clientLegalEntities.clientAccountId,
        clientLegalEntities.id,
      ],
    }),
    check(
      'client_legal_entity_commands_action_check',
      sql`(${table.action} = 'register' AND ${table.legalEntityId} IS NULL)
        OR (${table.action} = 'correct' AND ${table.legalEntityId} IS NOT NULL)`,
    ),
    check(
      'client_legal_entity_commands_positive_version_check',
      sql`${table.expectedClientVersion} > 0`,
    ),
  ],
);
