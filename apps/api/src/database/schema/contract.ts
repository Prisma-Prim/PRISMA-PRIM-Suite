import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies, clientAccounts, workspaceMemberships } from './core.js';
import { opportunities } from './commercial-intake.js';
import { offers, offerVersions } from './offer.js';
import { pricingSnapshots } from './pricing-configuration.js';
import { clientLegalEntities } from './client-legal-entity.js';

export const contracts = pgTable(
  'contracts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    opportunityId: uuid('opportunity_id').notNull(),
    clientRequestId: uuid('client_request_id').notNull(),
    originalClientAccountId: uuid('original_client_account_id').notNull(),
    kind: text('kind').default('CONTRACT').notNull(),
    origin: text('origin').default('ACCEPTED_OFFER').notNull(),
    sourceOfferId: uuid('source_offer_id').notNull(),
    sourceOfferVersionId: uuid('source_offer_version_id').notNull(),
    illustrativeReference: integer('illustrative_reference').notNull(),
    revision: integer('revision').default(1).notNull(),
    createdByInternalUserId: uuid('created_by_internal_user_id').notNull(),
    createdByWorkspaceMembershipId: uuid(
      'created_by_workspace_membership_id',
    ).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('contracts_scope_unique').on(t.workspaceId, t.companyId, t.id),
    uniqueIndex('contracts_opportunity_identity_unique').on(
      t.workspaceId,
      t.companyId,
      t.opportunityId,
      t.id,
    ),
    uniqueIndex('contracts_opportunity_unique').on(
      t.workspaceId,
      t.companyId,
      t.opportunityId,
    ),
    uniqueIndex('contracts_reference_unique').on(
      t.workspaceId,
      t.companyId,
      t.kind,
      t.illustrativeReference,
    ),
    foreignKey({
      name: 'contracts_company_fk',
      columns: [t.workspaceId, t.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'contracts_opportunity_fk',
      columns: [t.workspaceId, t.companyId, t.clientRequestId, t.opportunityId],
      foreignColumns: [
        opportunities.workspaceId,
        opportunities.companyId,
        opportunities.clientRequestId,
        opportunities.id,
      ],
    }),
    foreignKey({
      name: 'contracts_offer_identity_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.opportunityId,
        t.clientRequestId,
        t.originalClientAccountId,
        t.sourceOfferId,
      ],
      foreignColumns: [
        offers.workspaceId,
        offers.companyId,
        offers.opportunityId,
        offers.clientRequestId,
        offers.originalClientAccountId,
        offers.id,
      ],
    }),
    foreignKey({
      name: 'contracts_offer_version_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.sourceOfferId,
        t.sourceOfferVersionId,
      ],
      foreignColumns: [
        offerVersions.workspaceId,
        offerVersions.companyId,
        offerVersions.offerId,
        offerVersions.id,
      ],
    }),
    foreignKey({
      name: 'contracts_creator_fk',
      columns: [
        t.workspaceId,
        t.createdByWorkspaceMembershipId,
        t.createdByInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'contracts_initial_check',
      sql`${t.kind} = 'CONTRACT' AND ${t.origin} = 'ACCEPTED_OFFER' AND ${t.revision} = 1 AND ${t.illustrativeReference} > 0`,
    ),
  ],
);

export const contractVersions = pgTable(
  'contract_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    contractId: uuid('contract_id').notNull(),
    versionNumber: integer('version_number').default(1).notNull(),
    pricingSnapshotId: uuid('pricing_snapshot_id').notNull(),
    opportunityId: uuid('opportunity_id').notNull(),
    recipientClientAccountId: uuid('recipient_client_account_id').notNull(),
    recipientKind: text('recipient_kind').notNull(),
    recipientAdditionalLegalEntityId: uuid(
      'recipient_additional_legal_entity_id',
    ),
    recipientLegalName: text('recipient_legal_name').notNull(),
    recipientTaxId: text('recipient_tax_id'),
    recipientLegalAddress: text('recipient_legal_address'),
    issuingCompanyLabel: text('issuing_company_label').notNull(),
    scopeNote: text('scope_note'),
    commercialConditions: text('commercial_conditions'),
    termStartsOn: date('term_starts_on'),
    termEndsOn: date('term_ends_on'),
    specialConditions: text('special_conditions'),
    decisionState: text('decision_state').default('PENDING').notNull(),
    executionState: text('execution_state').default('NOT_EXECUTED').notNull(),
    provenance: text('provenance').default('ILLUSTRATIVE').notNull(),
    createdByInternalUserId: uuid('created_by_internal_user_id').notNull(),
    createdByWorkspaceMembershipId: uuid(
      'created_by_workspace_membership_id',
    ).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('contract_versions_scope_unique').on(
      t.workspaceId,
      t.companyId,
      t.id,
    ),
    uniqueIndex('contract_versions_number_unique').on(
      t.workspaceId,
      t.companyId,
      t.contractId,
      t.versionNumber,
    ),
    foreignKey({
      name: 'contract_versions_contract_fk',
      columns: [t.workspaceId, t.companyId, t.opportunityId, t.contractId],
      foreignColumns: [
        contracts.workspaceId,
        contracts.companyId,
        contracts.opportunityId,
        contracts.id,
      ],
    }),
    foreignKey({
      name: 'contract_versions_snapshot_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.opportunityId,
        t.pricingSnapshotId,
      ],
      foreignColumns: [
        pricingSnapshots.workspaceId,
        pricingSnapshots.companyId,
        pricingSnapshots.opportunityId,
        pricingSnapshots.id,
      ],
    }),
    foreignKey({
      name: 'contract_versions_client_fk',
      columns: [t.workspaceId, t.recipientClientAccountId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    foreignKey({
      name: 'contract_versions_entity_fk',
      columns: [
        t.workspaceId,
        t.recipientClientAccountId,
        t.recipientAdditionalLegalEntityId,
      ],
      foreignColumns: [
        clientLegalEntities.workspaceId,
        clientLegalEntities.clientAccountId,
        clientLegalEntities.id,
      ],
    }),
    foreignKey({
      name: 'contract_versions_creator_fk',
      columns: [
        t.workspaceId,
        t.createdByWorkspaceMembershipId,
        t.createdByInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'contract_versions_initial_check',
      sql`${t.versionNumber} = 1 AND ${t.decisionState} = 'PENDING' AND ${t.executionState} = 'NOT_EXECUTED' AND ${t.provenance} = 'ILLUSTRATIVE'`,
    ),
    check(
      'contract_versions_entity_check',
      sql`(${t.recipientKind} = 'PRIMARY' AND ${t.recipientAdditionalLegalEntityId} IS NULL) OR (${t.recipientKind} = 'ADDITIONAL' AND ${t.recipientAdditionalLegalEntityId} IS NOT NULL)`,
    ),
    check(
      'contract_versions_content_check',
      sql`char_length(${t.recipientLegalName}) BETWEEN 1 AND 200 AND char_length(${t.issuingCompanyLabel}) > 0 AND (${t.scopeNote} IS NULL OR char_length(${t.scopeNote}) <= 2000) AND (${t.commercialConditions} IS NULL OR char_length(${t.commercialConditions}) <= 4000) AND (${t.specialConditions} IS NULL OR char_length(${t.specialConditions}) <= 4000) AND (${t.termStartsOn} IS NULL OR ${t.termEndsOn} IS NULL OR ${t.termEndsOn} >= ${t.termStartsOn})`,
    ),
  ],
);

export const contractReferenceCounters = pgTable(
  'contract_reference_counters',
  {
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    kind: text('kind').notNull(),
    currentReference: integer('current_reference').notNull(),
  },
  (t) => [
    uniqueIndex('contract_reference_counters_scope_unique').on(
      t.workspaceId,
      t.companyId,
      t.kind,
    ),
    foreignKey({
      name: 'contract_reference_counters_company_fk',
      columns: [t.workspaceId, t.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    check(
      'contract_reference_counters_check',
      sql`${t.kind} = 'CONTRACT' AND ${t.currentReference} > 0`,
    ),
  ],
);

export const contractCommands = pgTable(
  'contract_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    opportunityId: uuid('opportunity_id').notNull(),
    resultContractId: uuid('result_contract_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('contract_commands_actor_key_unique').on(
      t.workspaceId,
      t.companyId,
      t.actorWorkspaceMembershipId,
      t.idempotencyKey,
    ),
    foreignKey({
      name: 'contract_commands_actor_fk',
      columns: [t.workspaceId, t.actorWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'contract_commands_result_fk',
      columns: [t.workspaceId, t.companyId, t.resultContractId],
      foreignColumns: [
        contracts.workspaceId,
        contracts.companyId,
        contracts.id,
      ],
    }),
    foreignKey({
      name: 'contract_commands_opportunity_fk',
      columns: [t.workspaceId, t.companyId, t.opportunityId],
      foreignColumns: [
        opportunities.workspaceId,
        opportunities.companyId,
        opportunities.id,
      ],
    }),
  ],
);

export const contractEvents = pgTable(
  'contract_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    action: text('action').notNull(),
    contractId: uuid('contract_id').notNull(),
    contractVersionId: uuid('contract_version_id'),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    metadata: jsonb('metadata')
      .$type<Record<string, string | number>>()
      .notNull(),
  },
  (t) => [
    uniqueIndex('contract_events_created_unique')
      .on(t.workspaceId, t.contractId)
      .where(sql`${t.action} = 'contract.created'`),
    uniqueIndex('contract_events_version_created_unique')
      .on(t.workspaceId, t.contractVersionId)
      .where(sql`${t.action} = 'contract_version.created'`),
    foreignKey({
      name: 'contract_events_contract_fk',
      columns: [t.workspaceId, t.companyId, t.contractId],
      foreignColumns: [
        contracts.workspaceId,
        contracts.companyId,
        contracts.id,
      ],
    }),
    foreignKey({
      name: 'contract_events_version_fk',
      columns: [t.workspaceId, t.companyId, t.contractVersionId],
      foreignColumns: [
        contractVersions.workspaceId,
        contractVersions.companyId,
        contractVersions.id,
      ],
    }),
    foreignKey({
      name: 'contract_events_actor_fk',
      columns: [
        t.workspaceId,
        t.actorWorkspaceMembershipId,
        t.actorInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'contract_events_target_check',
      sql`(${t.action} = 'contract.created' AND ${t.contractVersionId} IS NULL) OR (${t.action} = 'contract_version.created' AND ${t.contractVersionId} IS NOT NULL)`,
    ),
    check(
      'contract_events_metadata_check',
      sql`(jsonb_typeof(${t.metadata}) = 'object' AND (${t.metadata} - ARRAY['contractId','contractVersionId','versionNumber','illustrativeReference','kind','origin','offerVersionId','pricingSnapshotId','provenance']::text[]) = '{}'::jsonb AND ${t.metadata}->>'contractId' = ${t.contractId}::text AND ${t.metadata}->>'kind' = 'CONTRACT' AND ${t.metadata}->>'origin' = 'ACCEPTED_OFFER' AND ${t.metadata}->>'provenance' = 'ILLUSTRATIVE') IS TRUE`,
    ),
  ],
);
