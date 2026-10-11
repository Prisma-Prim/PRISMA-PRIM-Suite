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
import { clientLegalEntities } from './client-legal-entity.js';
import { clientRequests, opportunities } from './commercial-intake.js';
import { clientAccounts, companies, workspaceMemberships } from './core.js';
import { pricingSnapshots } from './pricing-configuration.js';

export const OFFER_PROVENANCE = 'ILLUSTRATIVE' as const;
export const OFFER_TEMPLATE_CODE = 'OFFER_ILLUSTRATIVE' as const;

/** The durable commercial identity. O1 permits exactly one per Opportunity. */
export const offers = pgTable(
  'offers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    opportunityId: uuid('opportunity_id').notNull(),
    clientRequestId: uuid('client_request_id').notNull(),
    originalClientAccountId: uuid('original_client_account_id').notNull(),
    illustrativeReference: integer('illustrative_reference').notNull(),
    revision: integer('revision').default(1).notNull(),
    createdByInternalUserId: uuid('created_by_internal_user_id').notNull(),
    createdByWorkspaceMembershipId: uuid(
      'created_by_workspace_membership_id',
    ).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('offers_scope_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
    ),
    uniqueIndex('offers_complete_identity_unique').on(
      table.workspaceId,
      table.companyId,
      table.opportunityId,
      table.clientRequestId,
      table.originalClientAccountId,
      table.id,
    ),
    uniqueIndex('offers_opportunity_unique').on(
      table.workspaceId,
      table.companyId,
      table.opportunityId,
    ),
    uniqueIndex('offers_company_reference_unique').on(
      table.workspaceId,
      table.companyId,
      table.illustrativeReference,
    ),
    foreignKey({
      name: 'offers_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'offers_opportunity_fk',
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
      name: 'offers_request_client_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.clientRequestId,
        table.originalClientAccountId,
      ],
      foreignColumns: [
        clientRequests.workspaceId,
        clientRequests.companyId,
        clientRequests.id,
        clientRequests.clientAccountId,
      ],
    }),
    foreignKey({
      name: 'offers_original_client_fk',
      columns: [table.workspaceId, table.originalClientAccountId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    foreignKey({
      name: 'offers_creator_fk',
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
      'offers_initial_state_check',
      sql`${table.illustrativeReference} > 0 AND ${table.revision} > 0`,
    ),
  ],
);

/** Immutable complete content of the first illustrative Offer Version. */
export const offerVersions = pgTable(
  'offer_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    offerId: uuid('offer_id').notNull(),
    opportunityId: uuid('opportunity_id').notNull(),
    clientRequestId: uuid('client_request_id').notNull(),
    originalClientAccountId: uuid('original_client_account_id').notNull(),
    versionNumber: integer('version_number').default(1).notNull(),
    predecessorVersionId: uuid('predecessor_version_id'),
    supersededByVersionId: uuid('superseded_by_version_id'),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    pricingSnapshotId: uuid('pricing_snapshot_id').notNull(),
    recipientClientAccountId: uuid('recipient_client_account_id').notNull(),
    recipientKind: text('recipient_kind', {
      enum: ['PRIMARY', 'ADDITIONAL'],
    }).notNull(),
    recipientAdditionalLegalEntityId: uuid(
      'recipient_additional_legal_entity_id',
    ),
    recipientLegalName: text('recipient_legal_name').notNull(),
    recipientTaxId: text('recipient_tax_id'),
    recipientLegalAddress: text('recipient_legal_address'),
    issuingCompanyLabel: text('issuing_company_label').notNull(),
    validityDays: integer('validity_days').notNull(),
    validUntil: timestamp('valid_until', { withTimezone: true }).notNull(),
    scopeNote: text('scope_note'),
    commercialConditions: text('commercial_conditions'),
    templateCode: text('template_code', {
      enum: [OFFER_TEMPLATE_CODE],
    }).notNull(),
    templateVersion: integer('template_version').notNull(),
    decisionState: text('decision_state', { enum: ['PENDING'] })
      .default('PENDING')
      .notNull(),
    transmissionState: text('transmission_state', {
      enum: ['NOT_TRANSMITTED'],
    })
      .default('NOT_TRANSMITTED')
      .notNull(),
    clientResponseState: text('client_response_state', { enum: ['NONE'] })
      .default('NONE')
      .notNull(),
    provenance: text('provenance', { enum: [OFFER_PROVENANCE] })
      .default(OFFER_PROVENANCE)
      .notNull(),
    createdByInternalUserId: uuid('created_by_internal_user_id').notNull(),
    createdByWorkspaceMembershipId: uuid(
      'created_by_workspace_membership_id',
    ).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('offer_versions_scope_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
    ),
    uniqueIndex('offer_versions_offer_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.offerId,
      table.id,
    ),
    uniqueIndex('offer_versions_number_unique').on(
      table.workspaceId,
      table.companyId,
      table.offerId,
      table.versionNumber,
    ),
    foreignKey({
      name: 'offer_versions_offer_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.opportunityId,
        table.clientRequestId,
        table.originalClientAccountId,
        table.offerId,
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
      name: 'offer_versions_snapshot_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.opportunityId,
        table.pricingSnapshotId,
      ],
      foreignColumns: [
        pricingSnapshots.workspaceId,
        pricingSnapshots.companyId,
        pricingSnapshots.opportunityId,
        pricingSnapshots.id,
      ],
    }),
    foreignKey({
      name: 'offer_versions_recipient_client_fk',
      columns: [table.workspaceId, table.recipientClientAccountId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    foreignKey({
      name: 'offer_versions_additional_entity_fk',
      columns: [
        table.workspaceId,
        table.recipientClientAccountId,
        table.recipientAdditionalLegalEntityId,
      ],
      foreignColumns: [
        clientLegalEntities.workspaceId,
        clientLegalEntities.clientAccountId,
        clientLegalEntities.id,
      ],
    }),
    foreignKey({
      name: 'offer_versions_creator_fk',
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
      'offer_versions_initial_state_check',
      sql`${table.versionNumber} >= 1
        AND ${table.decisionState} = 'PENDING'
        AND ${table.transmissionState} = 'NOT_TRANSMITTED'
        AND ${table.clientResponseState} = 'NONE'
        AND ${table.provenance} = 'ILLUSTRATIVE'`,
    ),
    check(
      'offer_versions_lineage_check',
      sql`((${table.versionNumber} = 1 AND ${table.predecessorVersionId} IS NULL) OR (${table.versionNumber} > 1 AND ${table.predecessorVersionId} IS NOT NULL)) AND ((${table.supersededByVersionId} IS NULL AND ${table.supersededAt} IS NULL) OR (${table.supersededByVersionId} IS NOT NULL AND ${table.supersededAt} IS NOT NULL))`,
    ),
    foreignKey({
      name: 'offer_versions_predecessor_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.offerId,
        table.predecessorVersionId,
      ],
      foreignColumns: [
        table.workspaceId,
        table.companyId,
        table.offerId,
        table.id,
      ],
    }),
    foreignKey({
      name: 'offer_versions_successor_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.offerId,
        table.supersededByVersionId,
      ],
      foreignColumns: [
        table.workspaceId,
        table.companyId,
        table.offerId,
        table.id,
      ],
    }),
    uniqueIndex('offer_versions_predecessor_unique').on(
      table.workspaceId,
      table.companyId,
      table.predecessorVersionId,
    ),
    check(
      'offer_versions_recipient_kind_check',
      sql`(${table.recipientKind} = 'PRIMARY' AND ${table.recipientAdditionalLegalEntityId} IS NULL)
        OR (${table.recipientKind} = 'ADDITIONAL' AND ${table.recipientAdditionalLegalEntityId} IS NOT NULL)`,
    ),
    check(
      'offer_versions_content_check',
      sql`char_length(${table.recipientLegalName}) BETWEEN 1 AND 200
        AND (${table.recipientTaxId} IS NULL OR char_length(${table.recipientTaxId}) BETWEEN 1 AND 500)
        AND (${table.recipientLegalAddress} IS NULL OR char_length(${table.recipientLegalAddress}) BETWEEN 1 AND 2000)
        AND char_length(${table.issuingCompanyLabel}) > 0
        AND ${table.validityDays} BETWEEN 1 AND 365
        AND ${table.validUntil} = ${table.createdAt} + (${table.validityDays} * interval '24 hours')
        AND (${table.scopeNote} IS NULL OR char_length(${table.scopeNote}) <= 2000)
        AND (${table.commercialConditions} IS NULL OR char_length(${table.commercialConditions}) <= 4000)`,
    ),
    check(
      'offer_versions_template_check',
      sql`${table.templateCode} = 'OFFER_ILLUSTRATIVE'
        AND ${table.templateVersion} IN (1, 2)`,
    ),
  ],
);

/** Atomic, monotone and independent illustrative references per Company. */
export const offerReferenceCounters = pgTable(
  'offer_reference_counters',
  {
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    currentReference: integer('current_reference').notNull(),
  },
  (table) => [
    uniqueIndex('offer_reference_counters_company_unique').on(
      table.workspaceId,
      table.companyId,
    ),
    foreignKey({
      name: 'offer_reference_counters_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    check(
      'offer_reference_counters_positive_check',
      sql`${table.currentReference} > 0`,
    ),
  ],
);

/** Immutable results; sequence orders runs even when the server clock ties. */
export const offerQualityRuns = pgTable(
  'offer_quality_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sequence: integer('sequence').generatedAlwaysAsIdentity(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    offerId: uuid('offer_id').notNull(),
    offerVersionId: uuid('offer_version_id').notNull(),
    ruleSet: text('rule_set').default('OFFER_QUALITY_ILLUSTRATIVE').notNull(),
    ruleSetVersion: integer('rule_set_version').default(1).notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).notNull(),
    results: jsonb('results').$type<unknown>().notNull(),
  },
  (table) => [
    uniqueIndex('offer_quality_runs_scope_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.offerId,
      table.id,
    ),
    uniqueIndex('offer_quality_runs_version_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.offerId,
      table.offerVersionId,
      table.id,
    ),
    foreignKey({
      name: 'offer_quality_runs_version_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.offerId,
        table.offerVersionId,
      ],
      foreignColumns: [
        offerVersions.workspaceId,
        offerVersions.companyId,
        offerVersions.offerId,
        offerVersions.id,
      ],
    }),
    foreignKey({
      name: 'offer_quality_runs_actor_fk',
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
    check(
      'offer_quality_runs_rule_set_check',
      sql`${table.ruleSet} = 'OFFER_QUALITY_ILLUSTRATIVE' AND ${table.ruleSetVersion} IN (1, 2)`,
    ),
    check(
      'offer_quality_runs_results_check',
      sql`(CASE WHEN jsonb_typeof(${table.results}) <> 'array' THEN false ELSE
    jsonb_array_length(${table.results}) = 8
    AND ${table.results}->0->>'code' = 'PRICING_SNAPSHOT_COHERENT' AND ${table.results}->0->>'status' IN ('PASS','ERROR')
    AND ${table.results}->1->>'code' = 'CURRENCY_UNCHANGED' AND ${table.results}->1->>'status' IN ('PASS','WARNING')
    AND ${table.results}->2->>'code' = 'VALIDITY_OPEN' AND ${table.results}->2->>'status' IN ('PASS','ERROR')
    AND ${table.results}->3->>'code' = 'RECIPIENT_AVAILABLE' AND ${table.results}->3->>'status' IN ('PASS','ERROR')
    AND ${table.results}->4->>'code' = 'RECIPIENT_IDENTITY_CURRENT' AND ${table.results}->4->>'status' IN ('PASS','WARNING')
    AND ${table.results}->5->>'code' = 'RECIPIENT_TAX_ID_RECORDED' AND ${table.results}->5->>'status' IN ('PASS','WARNING')
    AND ${table.results}->6->>'code' = 'PRICING_CLIENT_CONTEXT_COHERENT' AND ${table.results}->6->>'status' IN ('PASS','WARNING')
    AND ${table.results}->7->>'code' = 'PROVISIONAL_MARKER_PRESENT' AND ${table.results}->7->>'status' IN ('PASS','ERROR') END) IS TRUE`,
    ),
  ],
);

/** Durable Offer receipts share one actor/Company key namespace. */
export const offerCommands = pgTable(
  'offer_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    opportunityId: uuid('opportunity_id').notNull(),
    resultOfferId: uuid('result_offer_id').notNull(),
    kind: text('kind', {
      enum: [
        'CREATE_OFFER',
        'CREATE_OFFER_VERSION',
        'RUN_QUALITY_CHECKS',
        'APPROVE',
        'REJECT',
        'RECORD_TRANSMISSION',
        'RECORD_CLIENT_RESPONSE',
      ],
    })
      .default('CREATE_OFFER')
      .notNull(),
    resultQualityRunId: uuid('result_quality_run_id'),
    resultDecisionId: uuid('result_decision_id'),
    resultTransmissionId: uuid('result_transmission_id'),
    resultClientResponseId: uuid('result_client_response_id'),
    resultVersionId: uuid('result_version_id'),
    resultOfferRevision: integer('result_offer_revision'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('offer_commands_actor_key_unique').on(
      table.workspaceId,
      table.companyId,
      table.actorWorkspaceMembershipId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: 'offer_commands_actor_fk',
      columns: [table.workspaceId, table.actorWorkspaceMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    foreignKey({
      name: 'offer_commands_opportunity_fk',
      columns: [table.workspaceId, table.companyId, table.opportunityId],
      foreignColumns: [
        opportunities.workspaceId,
        opportunities.companyId,
        opportunities.id,
      ],
    }),
    foreignKey({
      name: 'offer_commands_result_fk',
      columns: [table.workspaceId, table.companyId, table.resultOfferId],
      foreignColumns: [offers.workspaceId, offers.companyId, offers.id],
    }),
    foreignKey({
      name: 'offer_commands_quality_result_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.resultOfferId,
        table.resultQualityRunId,
      ],
      foreignColumns: [
        offerQualityRuns.workspaceId,
        offerQualityRuns.companyId,
        offerQualityRuns.offerId,
        offerQualityRuns.id,
      ],
    }),
    check(
      'offer_commands_kind_result_check',
      sql`((${table.kind} = 'CREATE_OFFER_VERSION' AND ${table.resultVersionId} IS NOT NULL AND ${table.resultOfferRevision} IS NOT NULL AND ${table.resultOfferRevision} > 1) OR (${table.kind} <> 'CREATE_OFFER_VERSION' AND ${table.resultVersionId} IS NULL AND ${table.resultOfferRevision} IS NULL)) AND ((${table.kind} IN ('CREATE_OFFER', 'CREATE_OFFER_VERSION') AND ${table.resultQualityRunId} IS NULL AND ${table.resultDecisionId} IS NULL AND ${table.resultTransmissionId} IS NULL AND ${table.resultClientResponseId} IS NULL)
      OR (${table.kind} = 'RUN_QUALITY_CHECKS' AND ${table.resultQualityRunId} IS NOT NULL AND ${table.resultDecisionId} IS NULL AND ${table.resultTransmissionId} IS NULL AND ${table.resultClientResponseId} IS NULL)
      OR (${table.kind} IN ('APPROVE','REJECT') AND ${table.resultQualityRunId} IS NULL AND ${table.resultDecisionId} IS NOT NULL AND ${table.resultTransmissionId} IS NULL AND ${table.resultClientResponseId} IS NULL)
      OR (${table.kind} = 'RECORD_TRANSMISSION' AND ${table.resultQualityRunId} IS NULL AND ${table.resultDecisionId} IS NULL AND ${table.resultTransmissionId} IS NOT NULL AND ${table.resultClientResponseId} IS NULL)
      OR (${table.kind} = 'RECORD_CLIENT_RESPONSE' AND ${table.resultQualityRunId} IS NULL AND ${table.resultDecisionId} IS NULL AND ${table.resultTransmissionId} IS NULL AND ${table.resultClientResponseId} IS NOT NULL))`,
    ),
    foreignKey({
      name: 'offer_commands_version_result_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.resultOfferId,
        table.resultVersionId,
      ],
      foreignColumns: [
        offerVersions.workspaceId,
        offerVersions.companyId,
        offerVersions.offerId,
        offerVersions.id,
      ],
    }),
    foreignKey({
      name: 'offer_commands_decision_result_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.resultOfferId,
        table.resultDecisionId,
      ],
      foreignColumns: [
        offerDecisions.workspaceId,
        offerDecisions.companyId,
        offerDecisions.offerId,
        offerDecisions.id,
      ],
    }),
    foreignKey({
      name: 'offer_commands_response_result_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.resultOfferId,
        table.resultClientResponseId,
      ],
      foreignColumns: [
        offerClientResponses.workspaceId,
        offerClientResponses.companyId,
        offerClientResponses.offerId,
        offerClientResponses.id,
      ],
    }),
    foreignKey({
      name: 'offer_commands_transmission_result_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.resultOfferId,
        table.resultTransmissionId,
      ],
      foreignColumns: [
        offerTransmissions.workspaceId,
        offerTransmissions.companyId,
        offerTransmissions.offerId,
        offerTransmissions.id,
      ],
    }),
  ],
);

/** O1 events stay recorded and deliberately have no public projection. */
export const offerEvents = pgTable(
  'offer_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    action: text('action', {
      enum: [
        'offer.created',
        'offer_version.created',
        'offer_version.approved',
        'offer_version.rejected',
        'offer_version.transmission_recorded',
        'offer_version.client_response_recorded',
      ],
    }).notNull(),
    offerId: uuid('offer_id').notNull(),
    offerVersionId: uuid('offer_version_id'),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull(),
  },
  (table) => [
    uniqueIndex('offer_events_offer_created_unique')
      .on(table.workspaceId, table.offerId)
      .where(sql`${table.action} = 'offer.created'`),
    uniqueIndex('offer_events_version_created_unique')
      .on(table.workspaceId, table.offerVersionId)
      .where(sql`${table.action} = 'offer_version.created'`),
    uniqueIndex('offer_events_version_decision_unique')
      .on(table.workspaceId, table.offerVersionId)
      .where(
        sql`${table.action} IN ('offer_version.approved','offer_version.rejected')`,
      ),
    foreignKey({
      name: 'offer_events_offer_fk',
      columns: [table.workspaceId, table.companyId, table.offerId],
      foreignColumns: [offers.workspaceId, offers.companyId, offers.id],
    }),
    foreignKey({
      name: 'offer_events_version_fk',
      columns: [table.workspaceId, table.companyId, table.offerVersionId],
      foreignColumns: [
        offerVersions.workspaceId,
        offerVersions.companyId,
        offerVersions.id,
      ],
    }),
    foreignKey({
      name: 'offer_events_actor_fk',
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
    check(
      'offer_events_target_check',
      sql`(${table.action} = 'offer.created' AND ${table.offerVersionId} IS NULL)
        OR (${table.action} IN ('offer_version.created','offer_version.approved','offer_version.rejected','offer_version.transmission_recorded','offer_version.client_response_recorded') AND ${table.offerVersionId} IS NOT NULL)`,
    ),
    check(
      'offer_events_metadata_check',
      sql`(CASE
        WHEN jsonb_typeof(${table.metadata}) <> 'object' THEN false
        WHEN ${table.action} = 'offer.created' THEN
          ${table.metadata} ?& ARRAY['offerId', 'illustrativeReference', 'provenance']
          AND (${table.metadata} - ARRAY['offerId', 'illustrativeReference', 'provenance']::text[]) = '{}'::jsonb
          AND ${table.metadata}->>'offerId' = ${table.offerId}::text
          AND jsonb_typeof(${table.metadata}->'illustrativeReference') = 'number'
          AND ${table.metadata}->>'illustrativeReference' ~ '^[1-9][0-9]*$'
          AND ${table.metadata}->>'provenance' = 'ILLUSTRATIVE'
        WHEN ${table.action} = 'offer_version.created' THEN
          ${table.metadata} ?& ARRAY['offerId', 'offerVersionId', 'versionNumber', 'pricingSnapshotId', 'recipientKind', 'provenance']
          AND (${table.metadata} - ARRAY['offerId', 'offerVersionId', 'versionNumber', 'predecessorVersionNumber', 'pricingSnapshotId', 'recipientKind', 'provenance']::text[]) = '{}'::jsonb
          AND ${table.metadata}->>'offerId' = ${table.offerId}::text
          AND ${table.metadata}->>'offerVersionId' = ${table.offerVersionId}::text
          AND jsonb_typeof(${table.metadata}->'versionNumber') = 'number'
          AND ${table.metadata}->>'versionNumber' ~ '^[1-9][0-9]*$'
          AND ((${table.metadata}->>'versionNumber' = '1' AND NOT (${table.metadata} ? 'predecessorVersionNumber')) OR ((${table.metadata}->>'versionNumber')::numeric > 1 AND jsonb_typeof(${table.metadata}->'predecessorVersionNumber') = 'number' AND (${table.metadata}->>'predecessorVersionNumber')::numeric = (${table.metadata}->>'versionNumber')::numeric - 1))
          AND jsonb_typeof(${table.metadata}->'pricingSnapshotId') = 'string'
          AND ${table.metadata}->>'pricingSnapshotId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          AND ${table.metadata}->>'recipientKind' IN ('PRIMARY', 'ADDITIONAL')
          AND ${table.metadata}->>'provenance' = 'ILLUSTRATIVE'
        WHEN ${table.action} IN ('offer_version.approved','offer_version.rejected') THEN
          ${table.metadata} ?& ARRAY['offerId','offerVersionId','versionNumber','outcome','provenance']
          AND (${table.metadata} - ARRAY['offerId','offerVersionId','versionNumber','outcome','provenance','ruleSetVersion','acknowledgedWarningCodes']::text[]) = '{}'::jsonb
          AND ${table.metadata}->>'offerId' = ${table.offerId}::text
          AND ${table.metadata}->>'offerVersionId' = ${table.offerVersionId}::text
          AND jsonb_typeof(${table.metadata}->'versionNumber') = 'number' AND ${table.metadata}->>'versionNumber' ~ '^[1-9][0-9]*$'
          AND ${table.metadata}->>'provenance' = 'ILLUSTRATIVE'
          AND ((${table.action} = 'offer_version.approved' AND ${table.metadata}->>'outcome' = 'APPROVED' AND jsonb_typeof(${table.metadata}->'ruleSetVersion') = 'number' AND ${table.metadata}->>'ruleSetVersion' IN ('1','2') AND jsonb_typeof(${table.metadata}->'acknowledgedWarningCodes') = 'array')
          OR (${table.action} = 'offer_version.rejected' AND ${table.metadata}->>'outcome' = 'REJECTED' AND NOT (${table.metadata} ?| ARRAY['ruleSetVersion','acknowledgedWarningCodes'])))
        WHEN ${table.action} = 'offer_version.transmission_recorded' THEN
          ${table.metadata} ?& ARRAY['offerId','offerVersionId','versionNumber','channel','provenance','ruleSetVersion','acknowledgedWarningCodes']
          AND (${table.metadata} - ARRAY['offerId','offerVersionId','versionNumber','channel','provenance','ruleSetVersion','acknowledgedWarningCodes']::text[]) = '{}'::jsonb
          AND ${table.metadata}->>'offerId' = ${table.offerId}::text
          AND ${table.metadata}->>'offerVersionId' = ${table.offerVersionId}::text
          AND jsonb_typeof(${table.metadata}->'versionNumber') = 'number' AND ${table.metadata}->>'versionNumber' ~ '^[1-9][0-9]*$'
          AND ${table.metadata}->>'channel' = 'SIMULATED'
          AND ${table.metadata}->>'provenance' = 'ILLUSTRATIVE'
          AND jsonb_typeof(${table.metadata}->'ruleSetVersion') = 'number' AND ${table.metadata}->>'ruleSetVersion' IN ('1','2')
          AND jsonb_typeof(${table.metadata}->'acknowledgedWarningCodes') = 'array'
        WHEN ${table.action} = 'offer_version.client_response_recorded' THEN
          ${table.metadata} ?& ARRAY['offerId','offerVersionId','versionNumber','evidenceKind','outcome','provenance']
          AND (${table.metadata} - ARRAY['offerId','offerVersionId','versionNumber','evidenceKind','outcome','provenance']::text[]) = '{}'::jsonb
          AND ${table.metadata}->>'offerId' = ${table.offerId}::text
          AND ${table.metadata}->>'offerVersionId' = ${table.offerVersionId}::text
          AND jsonb_typeof(${table.metadata}->'versionNumber') = 'number'
          AND ${table.metadata}->>'versionNumber' ~ '^[1-9][0-9]*$'
          AND ${table.metadata}->>'evidenceKind' = 'SIMULATED'
          AND ${table.metadata}->>'outcome' IN ('ACCEPTED','REJECTED','EXPIRED')
          AND ${table.metadata}->>'provenance' = 'ILLUSTRATIVE'
        ELSE false
      END) IS TRUE`,
    ),
  ],
);

/** One immutable attributed decision; version content stays untouched. */
export const offerDecisions = pgTable(
  'offer_decisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    offerId: uuid('offer_id').notNull(),
    offerVersionId: uuid('offer_version_id').notNull(),
    state: text('state', { enum: ['APPROVED', 'REJECTED'] }).notNull(),
    offerRevision: integer('offer_revision').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull(),
    qualityRunId: uuid('quality_run_id'),
    acknowledgedWarningCodes: jsonb(
      'acknowledged_warning_codes',
    ).$type<unknown>(),
    representationSha256: text('representation_sha256'),
    reason: text('reason'),
  },
  (table) => [
    uniqueIndex('offer_decisions_version_unique').on(
      table.workspaceId,
      table.companyId,
      table.offerVersionId,
    ),
    uniqueIndex('offer_decisions_scope_unique').on(
      table.workspaceId,
      table.companyId,
      table.offerId,
      table.id,
    ),
    foreignKey({
      name: 'offer_decisions_version_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.offerId,
        table.offerVersionId,
      ],
      foreignColumns: [
        offerVersions.workspaceId,
        offerVersions.companyId,
        offerVersions.offerId,
        offerVersions.id,
      ],
    }),
    foreignKey({
      name: 'offer_decisions_run_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.offerId,
        table.offerVersionId,
        table.qualityRunId,
      ],
      foreignColumns: [
        offerQualityRuns.workspaceId,
        offerQualityRuns.companyId,
        offerQualityRuns.offerId,
        offerQualityRuns.offerVersionId,
        offerQualityRuns.id,
      ],
    }),
    foreignKey({
      name: 'offer_decisions_actor_fk',
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
    check(
      'offer_decisions_state_check',
      sql`${table.offerRevision} > 1 AND ((${table.state} = 'APPROVED' AND ${table.qualityRunId} IS NOT NULL AND ${table.acknowledgedWarningCodes} IS NOT NULL AND jsonb_typeof(${table.acknowledgedWarningCodes}) = 'array' AND ${table.representationSha256} IS NOT NULL AND ${table.representationSha256} ~ '^[0-9a-f]{64}$' AND ${table.reason} IS NULL) OR (${table.state} = 'REJECTED' AND ${table.qualityRunId} IS NULL AND ${table.acknowledgedWarningCodes} IS NULL AND ${table.representationSha256} IS NULL AND ${table.reason} IS NOT NULL AND char_length(${table.reason}) BETWEEN 1 AND 500))`,
    ),
  ],
);

/** One immutable simulated transmission of the approved representation. */
export const offerTransmissions = pgTable(
  'offer_transmissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    offerId: uuid('offer_id').notNull(),
    offerVersionId: uuid('offer_version_id').notNull(),
    channel: text('channel', { enum: ['SIMULATED'] })
      .default('SIMULATED')
      .notNull(),
    offerRevision: integer('offer_revision').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    transmittedAt: timestamp('transmitted_at', {
      withTimezone: true,
    }).notNull(),
    qualityRunId: uuid('quality_run_id').notNull(),
    acknowledgedWarningCodes: jsonb('acknowledged_warning_codes')
      .$type<unknown>()
      .notNull(),
    representationSha256: text('representation_sha256').notNull(),
    note: text('note'),
  },
  (table) => [
    uniqueIndex('offer_transmissions_version_unique').on(
      table.workspaceId,
      table.companyId,
      table.offerVersionId,
    ),
    uniqueIndex('offer_transmissions_scope_unique').on(
      table.workspaceId,
      table.companyId,
      table.offerId,
      table.id,
    ),
    foreignKey({
      name: 'offer_transmissions_version_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.offerId,
        table.offerVersionId,
      ],
      foreignColumns: [
        offerVersions.workspaceId,
        offerVersions.companyId,
        offerVersions.offerId,
        offerVersions.id,
      ],
    }),
    foreignKey({
      name: 'offer_transmissions_run_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.offerId,
        table.offerVersionId,
        table.qualityRunId,
      ],
      foreignColumns: [
        offerQualityRuns.workspaceId,
        offerQualityRuns.companyId,
        offerQualityRuns.offerId,
        offerQualityRuns.offerVersionId,
        offerQualityRuns.id,
      ],
    }),
    foreignKey({
      name: 'offer_transmissions_actor_fk',
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
    check(
      'offer_transmissions_state_check',
      sql`${table.offerRevision} > 2 AND ${table.channel} = 'SIMULATED' AND jsonb_typeof(${table.acknowledgedWarningCodes}) = 'array' AND ${table.representationSha256} ~ '^[0-9a-f]{64}$' AND (${table.note} IS NULL OR char_length(${table.note}) <= 500)`,
    ),
  ],
);

/** Immutable simulated human confirmation against one transmitted version. */
export const offerClientResponses = pgTable(
  'offer_client_responses',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    offerId: uuid('offer_id').notNull(),
    offerVersionId: uuid('offer_version_id').notNull(),
    outcome: text('outcome', {
      enum: ['ACCEPTED', 'REJECTED', 'EXPIRED'],
    }).notNull(),
    evidenceKind: text('evidence_kind', { enum: ['SIMULATED'] })
      .default('SIMULATED')
      .notNull(),
    offerRevision: integer('offer_revision').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    reason: text('reason'),
  },
  (table) => [
    uniqueIndex('offer_client_responses_version_unique').on(
      table.workspaceId,
      table.companyId,
      table.offerVersionId,
    ),
    uniqueIndex('offer_client_responses_scope_unique').on(
      table.workspaceId,
      table.companyId,
      table.offerId,
      table.id,
    ),
    foreignKey({
      name: 'offer_client_responses_version_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.offerId,
        table.offerVersionId,
      ],
      foreignColumns: [
        offerVersions.workspaceId,
        offerVersions.companyId,
        offerVersions.offerId,
        offerVersions.id,
      ],
    }),
    foreignKey({
      name: 'offer_client_responses_actor_fk',
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
    check(
      'offer_client_responses_state_check',
      sql`${table.offerRevision} > 3 AND ${table.evidenceKind} = 'SIMULATED' AND ((${table.outcome} = 'EXPIRED' AND ${table.receivedAt} IS NULL AND ${table.reason} IS NULL) OR (${table.outcome} = 'ACCEPTED' AND ${table.receivedAt} IS NOT NULL AND ${table.receivedAt} <= ${table.decidedAt} AND ${table.reason} IS NULL) OR (${table.outcome} = 'REJECTED' AND ${table.receivedAt} IS NOT NULL AND ${table.receivedAt} <= ${table.decidedAt} AND ${table.reason} IS NOT NULL AND char_length(btrim(${table.reason})) BETWEEN 1 AND 500 AND char_length(${table.reason}) <= 500))`,
    ),
  ],
);
