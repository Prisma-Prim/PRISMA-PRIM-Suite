import { sql } from 'drizzle-orm';
import {
  boolean,
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
import { projects } from './project.js';

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
    origin: text('origin').default('ACCEPTED_OFFER'),
    directReason: text('direct_reason'),
    sourceOfferId: uuid('source_offer_id'),
    sourceOfferVersionId: uuid('source_offer_version_id'),
    parentContractId: uuid('parent_contract_id'),
    addendumOrdinal: integer('addendum_ordinal'),
    precontractId: uuid('precontract_id'),
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
    uniqueIndex('contracts_opportunity_unique')
      .on(t.workspaceId, t.companyId, t.opportunityId, t.kind)
      .where(sql`${t.kind} <> 'ADDENDUM'`),
    foreignKey({
      name: 'contracts_precontract_fk',
      columns: [t.workspaceId, t.companyId, t.opportunityId, t.precontractId],
      foreignColumns: [t.workspaceId, t.companyId, t.opportunityId, t.id],
    }),
    uniqueIndex('contracts_parent_ordinal_unique').on(
      t.workspaceId,
      t.companyId,
      t.parentContractId,
      t.addendumOrdinal,
    ),
    foreignKey({
      name: 'contracts_parent_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.opportunityId,
        t.parentContractId,
      ],
      foreignColumns: [t.workspaceId, t.companyId, t.opportunityId, t.id],
    }),
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
      sql`(${t.revision} > 0 AND ${t.illustrativeReference} > 0 AND ((${t.kind} IN ('CONTRACT','PRECONTRACT') AND ((${t.origin} = 'ACCEPTED_OFFER' AND ${t.sourceOfferId} IS NOT NULL AND ${t.sourceOfferVersionId} IS NOT NULL AND ${t.directReason} IS NULL) OR (${t.kind} = 'CONTRACT' AND ${t.origin} = 'DIRECT' AND ${t.sourceOfferId} IS NULL AND ${t.sourceOfferVersionId} IS NULL AND char_length(${t.directReason}) BETWEEN 1 AND 500 AND btrim(${t.directReason}) <> '')) AND ${t.parentContractId} IS NULL AND ${t.addendumOrdinal} IS NULL AND (${t.precontractId} IS NULL OR (${t.kind} = 'CONTRACT' AND ${t.precontractId} <> ${t.id}))) OR (${t.kind} = 'ADDENDUM' AND ${t.directReason} IS NULL AND ${t.origin} IS NULL AND ${t.sourceOfferId} IS NULL AND ${t.sourceOfferVersionId} IS NULL AND ${t.parentContractId} IS NOT NULL AND ${t.parentContractId} <> ${t.id} AND ${t.addendumOrdinal} > 0 AND ${t.precontractId} IS NULL))) IS TRUE`,
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
    createdContractRevision: integer('created_contract_revision')
      .default(1)
      .notNull(),
    predecessorVersionId: uuid('predecessor_version_id'),
    supersededByVersionId: uuid('superseded_by_version_id'),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    pricingSnapshotId: uuid('pricing_snapshot_id'),
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
    preliminaryWorkScope: text('preliminary_work_scope'),
    preliminaryFinancialConditions: text('preliminary_financial_conditions'),
    preliminaryLimits: text('preliminary_limits'),
    changeSummary: text('change_summary'),
    templateCode: text('template_code')
      .default('CONTRACT_ILLUSTRATIVE')
      .notNull(),
    templateVersion: integer('template_version').default(1).notNull(),
    clauseVersions: jsonb('clause_versions')
      .$type<unknown>()
      .default(
        sql`'[{"code":"CL_SUBJECT","version":1},{"code":"CL_PRICE","version":1},{"code":"CL_TERM","version":1},{"code":"CL_CONDITIONS","version":1},{"code":"CL_GENERAL","version":1}]'::jsonb`,
      )
      .notNull(),
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
    uniqueIndex('contract_versions_contract_identity_unique').on(
      t.workspaceId,
      t.companyId,
      t.contractId,
      t.id,
    ),
    check(
      'contract_versions_lineage_check',
      sql`${t.createdContractRevision} > 0 AND ((${t.versionNumber} = 1 AND ${t.predecessorVersionId} IS NULL AND ${t.createdContractRevision}=1) OR (${t.versionNumber}>1 AND ${t.predecessorVersionId} IS NOT NULL)) AND ((${t.supersededByVersionId} IS NULL AND ${t.supersededAt} IS NULL) OR (${t.supersededByVersionId} IS NOT NULL AND ${t.supersededAt} IS NOT NULL AND ${t.executionState}='NOT_EXECUTED'))`,
    ),
    foreignKey({
      name: 'contract_versions_predecessor_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.contractId,
        t.predecessorVersionId,
      ],
      foreignColumns: [t.workspaceId, t.companyId, t.contractId, t.id],
    }),
    foreignKey({
      name: 'contract_versions_successor_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.contractId,
        t.supersededByVersionId,
      ],
      foreignColumns: [t.workspaceId, t.companyId, t.contractId, t.id],
    }),
    uniqueIndex('contract_versions_predecessor_unique').on(
      t.workspaceId,
      t.companyId,
      t.contractId,
      t.predecessorVersionId,
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
      sql`${t.versionNumber} > 0 AND ${t.decisionState} IN ('PENDING', 'APPROVED', 'REJECTED') AND ${t.executionState} IN ('NOT_EXECUTED','EXECUTED') AND (${t.executionState} <> 'EXECUTED' OR ${t.decisionState} = 'APPROVED') AND ${t.provenance} = 'ILLUSTRATIVE'`,
    ),
    check(
      'contract_versions_template_binding_check',
      sql`${t.templateVersion} = 1 AND ((${t.templateCode} = 'CONTRACT_ILLUSTRATIVE' AND ${t.clauseVersions} = '[{"code":"CL_SUBJECT","version":1},{"code":"CL_PRICE","version":1},{"code":"CL_TERM","version":1},{"code":"CL_CONDITIONS","version":1},{"code":"CL_GENERAL","version":1}]'::jsonb AND ${t.pricingSnapshotId} IS NOT NULL AND ${t.changeSummary} IS NULL AND ${t.preliminaryWorkScope} IS NULL AND ${t.preliminaryFinancialConditions} IS NULL AND ${t.preliminaryLimits} IS NULL) OR (${t.templateCode} = 'PRECONTRACT_ILLUSTRATIVE' AND ${t.clauseVersions} = '[{"code":"CL_SUBJECT","version":1},{"code":"CL_PRICE","version":1},{"code":"CL_TERM","version":1},{"code":"CL_CONDITIONS","version":1},{"code":"CL_PRELIMINARY_WORK","version":1},{"code":"CL_GENERAL","version":1}]'::jsonb AND ${t.pricingSnapshotId} IS NOT NULL AND ${t.changeSummary} IS NULL AND ${t.termEndsOn} IS NOT NULL AND char_length(${t.preliminaryWorkScope}) BETWEEN 1 AND 2000 AND btrim(${t.preliminaryWorkScope}) <> '' AND char_length(${t.preliminaryFinancialConditions}) BETWEEN 1 AND 2000 AND btrim(${t.preliminaryFinancialConditions}) <> '' AND char_length(${t.preliminaryLimits}) BETWEEN 1 AND 2000 AND btrim(${t.preliminaryLimits}) <> '') OR (${t.templateCode} = 'ADDENDUM_ILLUSTRATIVE' AND ${t.clauseVersions} = '[{"code":"CL_SUBJECT","version":1},{"code":"CL_PRICE","version":1},{"code":"CL_TERM","version":1},{"code":"CL_CONDITIONS","version":1},{"code":"CL_CHANGE","version":1},{"code":"CL_GENERAL","version":1}]'::jsonb AND char_length(${t.changeSummary}) BETWEEN 1 AND 4000 AND btrim(${t.changeSummary}) <> '' AND ${t.scopeNote} IS NULL AND ${t.commercialConditions} IS NULL AND ${t.specialConditions} IS NULL AND ${t.termStartsOn} IS NULL AND ${t.preliminaryWorkScope} IS NULL AND ${t.preliminaryFinancialConditions} IS NULL AND ${t.preliminaryLimits} IS NULL)) IS TRUE`,
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
      sql`${t.kind} IN ('CONTRACT','PRECONTRACT','ADDENDUM') AND ${t.currentReference} > 0`,
    ),
  ],
);

export const contractQualityRuns = pgTable(
  'contract_quality_runs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sequence: integer('sequence').generatedAlwaysAsIdentity(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    contractId: uuid('contract_id').notNull(),
    contractVersionId: uuid('contract_version_id').notNull(),
    ruleSet: text('rule_set')
      .default('CONTRACT_QUALITY_ILLUSTRATIVE')
      .notNull(),
    ruleSetVersion: integer('rule_set_version').default(1).notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).notNull(),
    results: jsonb('results').$type<unknown>().notNull(),
  },
  (t) => [
    uniqueIndex('contract_quality_runs_scope_unique').on(
      t.workspaceId,
      t.companyId,
      t.contractId,
      t.id,
    ),
    foreignKey({
      name: 'contract_quality_runs_version_fk',
      columns: [t.workspaceId, t.companyId, t.contractId, t.contractVersionId],
      foreignColumns: [
        contractVersions.workspaceId,
        contractVersions.companyId,
        contractVersions.contractId,
        contractVersions.id,
      ],
    }),
    foreignKey({
      name: 'contract_quality_runs_actor_fk',
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
      'contract_quality_runs_ruleset_check',
      sql`${t.ruleSet} = 'CONTRACT_QUALITY_ILLUSTRATIVE' AND ${t.ruleSetVersion} = 1 AND jsonb_typeof(${t.results}) = 'array'`,
    ),
  ],
);

export const contractDecisions = pgTable(
  'contract_decisions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    contractId: uuid('contract_id').notNull(),
    contractVersionId: uuid('contract_version_id').notNull(),
    kind: text('kind').notNull(),
    resultRevision: integer('result_revision').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    decidedAt: timestamp('decided_at', { withTimezone: true }).notNull(),
    reason: text('reason'),
    qualityRunId: uuid('quality_run_id'),
    representationChecksum: text('representation_checksum'),
    acknowledgedWarningCodes: jsonb(
      'acknowledged_warning_codes',
    ).$type<unknown>(),
  },
  (t) => [
    uniqueIndex('contract_decisions_version_unique').on(
      t.workspaceId,
      t.companyId,
      t.contractVersionId,
    ),
    uniqueIndex('contract_decisions_scope_unique').on(
      t.workspaceId,
      t.companyId,
      t.contractId,
      t.id,
    ),
    foreignKey({
      name: 'contract_decisions_version_fk',
      columns: [t.workspaceId, t.companyId, t.contractId, t.contractVersionId],
      foreignColumns: [
        contractVersions.workspaceId,
        contractVersions.companyId,
        contractVersions.contractId,
        contractVersions.id,
      ],
    }),
    foreignKey({
      name: 'contract_decisions_run_fk',
      columns: [t.workspaceId, t.companyId, t.contractId, t.qualityRunId],
      foreignColumns: [
        contractQualityRuns.workspaceId,
        contractQualityRuns.companyId,
        contractQualityRuns.contractId,
        contractQualityRuns.id,
      ],
    }),
    foreignKey({
      name: 'contract_decisions_actor_fk',
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
      'contract_decisions_result_check',
      sql`${t.resultRevision} > 1 AND ((${t.kind} = 'APPROVE' AND ${t.reason} IS NULL AND ${t.qualityRunId} IS NOT NULL AND ${t.representationChecksum} ~ '^[0-9a-f]{64}$' AND jsonb_typeof(${t.acknowledgedWarningCodes}) = 'array') OR (${t.kind} = 'REJECT' AND char_length(${t.reason}) BETWEEN 1 AND 500 AND btrim(${t.reason}) <> '' AND ${t.qualityRunId} IS NULL AND ${t.representationChecksum} IS NULL AND ${t.acknowledgedWarningCodes} IS NULL)) IS TRUE`,
    ),
  ],
);

export const contractSignatures = pgTable(
  'contract_signatures',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    contractId: uuid('contract_id').notNull(),
    contractVersionId: uuid('contract_version_id').notNull(),
    resultRevision: integer('result_revision').notNull(),
    evidenceKind: text('evidence_kind').default('SIMULATED').notNull(),
    provenance: text('provenance').default('ILLUSTRATIVE').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    providerSignatoryLabel: text('provider_signatory_label').notNull(),
    clientSignatoryLabel: text('client_signatory_label').notNull(),
    providerSignedOn: date('provider_signed_on').notNull(),
    clientSignedOn: date('client_signed_on').notNull(),
    note: text('note'),
    qualityRunId: uuid('quality_run_id').notNull(),
    representationChecksum: text('representation_checksum').notNull(),
    acknowledgedWarningCodes: jsonb('acknowledged_warning_codes')
      .$type<unknown>()
      .notNull(),
  },
  (t) => [
    uniqueIndex('contract_signatures_version_unique').on(
      t.workspaceId,
      t.companyId,
      t.contractVersionId,
    ),
    uniqueIndex('contract_signatures_scope_unique').on(
      t.workspaceId,
      t.companyId,
      t.contractId,
      t.id,
    ),
    foreignKey({
      name: 'contract_signatures_version_fk',
      columns: [t.workspaceId, t.companyId, t.contractId, t.contractVersionId],
      foreignColumns: [
        contractVersions.workspaceId,
        contractVersions.companyId,
        contractVersions.contractId,
        contractVersions.id,
      ],
    }),
    foreignKey({
      name: 'contract_signatures_run_fk',
      columns: [t.workspaceId, t.companyId, t.contractId, t.qualityRunId],
      foreignColumns: [
        contractQualityRuns.workspaceId,
        contractQualityRuns.companyId,
        contractQualityRuns.contractId,
        contractQualityRuns.id,
      ],
    }),
    foreignKey({
      name: 'contract_signatures_actor_fk',
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
      'contract_signatures_evidence_check',
      sql`${t.resultRevision} > 2 AND ${t.evidenceKind} = 'SIMULATED' AND ${t.provenance} = 'ILLUSTRATIVE' AND ${t.representationChecksum} ~ '^[0-9a-f]{64}$' AND jsonb_typeof(${t.acknowledgedWarningCodes}) = 'array'`,
    ),
    check(
      'contract_signatures_content_check',
      sql`char_length(${t.providerSignatoryLabel}) BETWEEN 1 AND 200 AND btrim(${t.providerSignatoryLabel}) <> '' AND char_length(${t.clientSignatoryLabel}) BETWEEN 1 AND 200 AND btrim(${t.clientSignatoryLabel}) <> '' AND (${t.note} IS NULL OR char_length(${t.note}) <= 500)`,
    ),
  ],
);

export const contractProjectLinks = pgTable(
  'contract_project_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    contractId: uuid('contract_id').notNull(),
    projectId: uuid('project_id').notNull(),
    created: boolean('created').notNull().default(false),
    resultRevision: integer('result_revision').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('contract_project_links_pair_unique').on(
      t.workspaceId,
      t.companyId,
      t.contractId,
      t.projectId,
    ),
    uniqueIndex('contract_project_links_revision_unique').on(
      t.workspaceId,
      t.companyId,
      t.contractId,
      t.resultRevision,
    ),
    uniqueIndex('contract_project_links_scope_unique').on(
      t.workspaceId,
      t.companyId,
      t.contractId,
      t.id,
    ),
    foreignKey({
      name: 'contract_project_links_contract_fk',
      columns: [t.workspaceId, t.companyId, t.contractId],
      foreignColumns: [
        contracts.workspaceId,
        contracts.companyId,
        contracts.id,
      ],
    }),
    foreignKey({
      name: 'contract_project_links_project_fk',
      columns: [t.workspaceId, t.companyId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.companyId, projects.id],
    }),
    foreignKey({
      name: 'contract_project_links_actor_fk',
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
      'contract_project_links_revision_check',
      sql`${t.resultRevision} > 3`,
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
    kind: text('kind').default('CREATE').notNull(),
    resultQualityRunId: uuid('result_quality_run_id'),
    resultDecisionId: uuid('result_decision_id'),
    resultSignatureId: uuid('result_signature_id'),
    resultProjectLinkId: uuid('result_project_link_id'),
    resultVersionId: uuid('result_version_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('contract_commands_actor_key_unique').on(
      t.workspaceId,
      t.companyId,
      t.actorWorkspaceMembershipId,
      t.idempotencyKey,
    ),
    check(
      'contract_commands_kind_check',
      sql`((((((((${t.kind} = 'CREATE' AND ${t.resultQualityRunId} IS NULL) OR (${t.kind} = 'RUN_QUALITY_CHECKS' AND ${t.resultQualityRunId} IS NOT NULL)) AND ${t.resultDecisionId} IS NULL OR (${t.kind} IN ('APPROVE','REJECT') AND ${t.resultQualityRunId} IS NULL AND ${t.resultDecisionId} IS NOT NULL)) AND ${t.resultSignatureId} IS NULL) OR (${t.kind} = 'RECORD_SIGNATURE' AND ${t.resultQualityRunId} IS NULL AND ${t.resultDecisionId} IS NULL AND ${t.resultSignatureId} IS NOT NULL)) AND ${t.resultProjectLinkId} IS NULL) OR (${t.kind} IN ('LINK_PROJECT','CREATE_PROJECT') AND ${t.resultQualityRunId} IS NULL AND ${t.resultDecisionId} IS NULL AND ${t.resultSignatureId} IS NULL AND ${t.resultProjectLinkId} IS NOT NULL)) AND ${t.resultVersionId} IS NULL) OR (${t.kind}='CREATE_VERSION' AND ${t.resultVersionId} IS NOT NULL AND ${t.resultQualityRunId} IS NULL AND ${t.resultDecisionId} IS NULL AND ${t.resultSignatureId} IS NULL AND ${t.resultProjectLinkId} IS NULL)`,
    ),
    foreignKey({
      name: 'contract_commands_version_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.resultContractId,
        t.resultVersionId,
      ],
      foreignColumns: [
        contractVersions.workspaceId,
        contractVersions.companyId,
        contractVersions.contractId,
        contractVersions.id,
      ],
    }),
    foreignKey({
      name: 'contract_commands_project_link_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.resultContractId,
        t.resultProjectLinkId,
      ],
      foreignColumns: [
        contractProjectLinks.workspaceId,
        contractProjectLinks.companyId,
        contractProjectLinks.contractId,
        contractProjectLinks.id,
      ],
    }),
    foreignKey({
      name: 'contract_commands_signature_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.resultContractId,
        t.resultSignatureId,
      ],
      foreignColumns: [
        contractSignatures.workspaceId,
        contractSignatures.companyId,
        contractSignatures.contractId,
        contractSignatures.id,
      ],
    }),
    foreignKey({
      name: 'contract_commands_decision_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.resultContractId,
        t.resultDecisionId,
      ],
      foreignColumns: [
        contractDecisions.workspaceId,
        contractDecisions.companyId,
        contractDecisions.contractId,
        contractDecisions.id,
      ],
    }),
    foreignKey({
      name: 'contract_commands_run_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.resultContractId,
        t.resultQualityRunId,
      ],
      foreignColumns: [
        contractQualityRuns.workspaceId,
        contractQualityRuns.companyId,
        contractQualityRuns.contractId,
        contractQualityRuns.id,
      ],
    }),
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
      .$type<Record<string, string | number | boolean | readonly string[]>>()
      .notNull(),
  },
  (t) => [
    uniqueIndex('contract_events_created_unique')
      .on(t.workspaceId, t.contractId)
      .where(sql`${t.action} = 'contract.created'`),
    uniqueIndex('contract_events_version_created_unique')
      .on(t.workspaceId, t.contractVersionId)
      .where(sql`${t.action} = 'contract_version.created'`),
    uniqueIndex('contract_events_decision_unique')
      .on(t.workspaceId, t.companyId, t.contractVersionId)
      .where(
        sql`${t.action} IN ('contract_version.approved','contract_version.rejected')`,
      ),
    uniqueIndex('contract_events_signature_unique')
      .on(t.workspaceId, t.companyId, t.contractVersionId)
      .where(sql`${t.action} = 'contract_version.signature_recorded'`),
    uniqueIndex('contract_events_project_link_unique')
      .on(
        t.workspaceId,
        t.companyId,
        t.contractId,
        sql`(${t.metadata}->>'projectId')`,
      )
      .where(sql`${t.action} = 'contract_project.linked'`),
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
      sql`(${t.action} IN ('contract.created','contract_project.linked') AND ${t.contractVersionId} IS NULL) OR (${t.action} IN ('contract_version.created','contract_version.approved','contract_version.rejected','contract_version.signature_recorded') AND ${t.contractVersionId} IS NOT NULL)`,
    ),
    check(
      'contract_events_metadata_check',
      sql`(jsonb_typeof(${t.metadata}) = 'object' AND ${t.metadata}->>'contractId' = ${t.contractId}::text AND ((${t.action} = 'contract_project.linked' AND (${t.metadata} - ARRAY['contractId','projectId','created']::text[]) = '{}'::jsonb AND ${t.metadata}->'created' IN ('false'::jsonb,'true'::jsonb) AND jsonb_typeof(${t.metadata}->'projectId') = 'string') OR (${t.action} <> 'contract_project.linked' AND (${t.metadata} - ARRAY['contractId','contractVersionId','versionNumber','predecessorVersionNumber','illustrativeReference','kind','origin','offerVersionId','pricingSnapshotId','provenance','ruleSetVersion','acknowledgedWarningCodes','evidenceKind','parentContractId','addendumOrdinal']::text[]) = '{}'::jsonb AND ((${t.metadata}->>'kind' = 'CONTRACT' AND ${t.metadata}->>'origin' IN ('ACCEPTED_OFFER','DIRECT') AND ((${t.metadata}->>'origin' = 'DIRECT' AND NOT (${t.metadata} ? 'offerVersionId')) OR (${t.metadata}->>'origin' = 'ACCEPTED_OFFER' AND jsonb_typeof(${t.metadata}->'offerVersionId') = 'string')) AND NOT (${t.metadata} ?| ARRAY['parentContractId','addendumOrdinal'])) OR (${t.metadata}->>'kind' = 'PRECONTRACT' AND ${t.metadata}->>'origin' = 'ACCEPTED_OFFER' AND jsonb_typeof(${t.metadata}->'offerVersionId') = 'string' AND NOT (${t.metadata} ?| ARRAY['parentContractId','addendumOrdinal'])) OR (${t.metadata}->>'kind' = 'ADDENDUM' AND NOT (${t.metadata} ?| ARRAY['origin','offerVersionId']) AND jsonb_typeof(${t.metadata}->'parentContractId') = 'string' AND jsonb_typeof(${t.metadata}->'addendumOrdinal') = 'number')) AND ${t.metadata}->>'provenance' = 'ILLUSTRATIVE' AND (${t.action} <> 'contract_version.signature_recorded' OR ${t.metadata}->>'evidenceKind' = 'SIMULATED')))) IS TRUE`,
    ),
  ],
);
