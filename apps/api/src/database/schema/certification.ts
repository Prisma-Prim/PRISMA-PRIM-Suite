import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { clientAccounts, companies, workspaceMemberships } from './core.js';
import { clientLegalEntities } from './client-legal-entity.js';
import { projects } from './project.js';
import { documentPdfs } from './document-pdfs.js';

export const CERTIFICATION_CASE_STATUSES = [
  'open',
  'rejected',
  'refused',
  'certified',
] as const;
export const CERTIFICATION_STEPS = [
  'application',
  'application_review',
  'duration',
  'agreement',
  'team',
  'team_decision',
  'stage_1_plan',
  'stage_1_report',
  'stage_2_plan',
  'stage_2_report',
  'recommendation',
  'dossier_review',
  'decision',
  'certificate_data',
  'certificate_draft',
  'client_opinion',
  'certificate_draft_approval',
] as const;
export const CERTIFICATION_DOCUMENT_ROLES = [
  'questionnaire',
  'iso22000_annex',
  'agreement',
  'plan',
  'participant_list',
  'report',
  'evidence',
  'certificate',
  'certificate_data',
  'decision_form',
  'correspondence',
  'certificate_draft',
  'client_opinion',
  'other',
] as const;
export const CERTIFICATION_EVENT_ACTIONS = [
  'certification_case.opened',
  'certification_case.application_recorded',
  'certification_case.application_reviewed',
  'certification_case.duration_confirmed',
  'certification_case.document_attached',
  'certification_case.agreement_recorded',
  'certification_case.team_proposed',
  'certification_case.team_decided',
  'certification_case.stage_planned',
  'certification_case.stage_reported',
  'certification_case.finding_recorded',
  'certification_case.finding_corrected',
  'certification_case.finding_reclassified',
  'certification_case.nonconformity_response_recorded',
  'certification_case.nonconformity_plan_judged',
  'certification_case.nonconformity_verified',
  'certification_case.recommendation_recorded',
  'certification_case.dossier_reviewed',
  'certification_case.decision_recorded',
  'certification_case.certificate_data_agreed',
  'certification_case.certificate_recorded',
  'certification_case.certificate_draft_recorded',
  'certification_case.client_opinion_recorded',
  'certification_case.certificate_draft_approved',
  'certification_case.discrepancy_recorded',
  'certification_case.discrepancy_resolved',
  'certification_case.exchange_recorded',
  'certification_case.reverification_item_added',
  'certification_case.reverification_item_withdrawn',
] as const;
export const CERTIFICATION_COMMAND_KINDS = [
  'open',
  'application',
  'application_review',
  'duration',
  'document',
  'agreement',
  'team',
  'team_decision',
  'stage_plan',
  'stage_report',
  'finding',
  'finding_record',
  'recommendation',
  'dossier_review',
  'decision',
  'certificate_data',
  'certificate',
  'certificate_draft',
  'client_opinion',
  'certificate_draft_approval',
  'discrepancy',
  'discrepancy_resolution',
  'exchange',
  'reverification_item',
  'reverification_withdrawal',
] as const;

/** One initial certification of one Client Legal Entity, carried out under one Project. */
export const certificationCases = pgTable(
  'certification_cases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id').notNull(),
    clientAccountId: uuid('client_account_id').notNull(),
    clientLegalEntityId: uuid('client_legal_entity_id').notNull(),
    orderReference: text('order_reference').notNull(),
    standard: text('standard', { enum: ['iso_22000_2018'] }).notNull(),
    auditType: text('audit_type', {
      enum: ['initial_certification'],
    }).notNull(),
    status: text('status', { enum: CERTIFICATION_CASE_STATUSES }).notNull(),
    revision: integer('revision').notNull(),
    openedByMembershipId: uuid('opened_by_membership_id').notNull(),
    openedByInternalUserId: uuid('opened_by_internal_user_id').notNull(),
    openedByDisplayName: text('opened_by_display_name').notNull(),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('certification_cases_scope_id_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
    ),
    uniqueIndex('certification_cases_order_reference_unique').on(
      table.workspaceId,
      table.companyId,
      table.orderReference,
    ),
    index('certification_cases_project_idx').on(
      table.workspaceId,
      table.companyId,
      table.projectId,
      table.openedAt,
      table.id,
    ),
    foreignKey({
      name: 'certification_cases_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'certification_cases_project_fk',
      columns: [table.workspaceId, table.companyId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.companyId, projects.id],
    }),
    foreignKey({
      name: 'certification_cases_client_fk',
      columns: [table.workspaceId, table.clientAccountId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    foreignKey({
      name: 'certification_cases_legal_entity_fk',
      columns: [
        table.workspaceId,
        table.clientAccountId,
        table.clientLegalEntityId,
      ],
      foreignColumns: [
        clientLegalEntities.workspaceId,
        clientLegalEntities.clientAccountId,
        clientLegalEntities.id,
      ],
    }),
    foreignKey({
      name: 'certification_cases_opener_fk',
      columns: [
        table.workspaceId,
        table.openedByMembershipId,
        table.openedByInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check('certification_cases_revision_check', sql`${table.revision} > 0`),
    check(
      'certification_cases_kind_check',
      sql`${table.standard} = 'iso_22000_2018' AND ${table.auditType} = 'initial_certification' AND ${table.status} IN ('open', 'rejected', 'refused', 'certified')`,
    ),
    check(
      'certification_cases_order_reference_check',
      sql`length(btrim(${table.orderReference})) BETWEEN 1 AND 64`,
    ),
  ],
);

/** Immutable versions of each recorded step; a later version needs a reason. */
export const certificationStepVersions = pgTable(
  'certification_step_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    caseId: uuid('case_id').notNull(),
    step: text('step', { enum: CERTIFICATION_STEPS }).notNull(),
    version: integer('version').notNull(),
    caseRevision: integer('case_revision').notNull(),
    payload: jsonb('payload').$type<unknown>().notNull(),
    reason: text('reason'),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('certification_step_versions_scope_unique').on(
      table.workspaceId,
      table.companyId,
      table.caseId,
      table.id,
    ),
    uniqueIndex('certification_step_versions_number_unique').on(
      table.workspaceId,
      table.companyId,
      table.caseId,
      table.step,
      table.version,
    ),
    uniqueIndex('certification_step_versions_case_revision_unique').on(
      table.workspaceId,
      table.companyId,
      table.caseId,
      table.caseRevision,
    ),
    foreignKey({
      name: 'certification_step_versions_case_fk',
      columns: [table.workspaceId, table.companyId, table.caseId],
      foreignColumns: [
        certificationCases.workspaceId,
        certificationCases.companyId,
        certificationCases.id,
      ],
    }),
    foreignKey({
      name: 'certification_step_versions_actor_fk',
      columns: [
        table.workspaceId,
        table.actorMembershipId,
        table.actorInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'certification_step_versions_reason_check',
      sql`(${table.step} = 'team_decision' AND ${table.reason} IS NULL) OR (${table.step} <> 'team_decision' AND ((${table.version} = 1 AND ${table.reason} IS NULL) OR (${table.version} > 1 AND length(btrim(${table.reason})) > 0)))`,
    ),
    check(
      'certification_step_versions_step_check',
      sql`${table.step} IN ('application', 'application_review', 'duration', 'agreement', 'team', 'team_decision', 'stage_1_plan', 'stage_1_report', 'stage_2_plan', 'stage_2_report', 'recommendation', 'dossier_review', 'decision', 'certificate_data', 'certificate_draft', 'client_opinion', 'certificate_draft_approval') AND ${table.version} > 0 AND ${table.caseRevision} > 1`,
    ),
    check(
      'certification_step_versions_payload_check',
      sql`jsonb_typeof(${table.payload}) = 'object'`,
    ),
  ],
);

export const certificationReceipts = pgTable(
  'certification_receipts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    commandKind: text('command_kind', {
      enum: CERTIFICATION_COMMAND_KINDS,
    }).notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    caseId: uuid('case_id').notNull(),
    response: jsonb('response').$type<unknown>().notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('certification_receipts_actor_key_unique').on(
      table.workspaceId,
      table.companyId,
      table.actorMembershipId,
      table.commandKind,
      table.idempotencyKey,
    ),
    check(
      'certification_receipts_kind_check',
      sql`${table.commandKind} IN ('open', 'application', 'application_review', 'duration', 'document', 'agreement', 'team', 'team_decision', 'stage_plan', 'stage_report', 'finding', 'finding_record', 'recommendation', 'dossier_review', 'decision', 'certificate_data', 'certificate', 'certificate_draft', 'client_opinion', 'certificate_draft_approval', 'discrepancy', 'discrepancy_resolution', 'exchange', 'reverification_item', 'reverification_withdrawal')`,
    ),
    foreignKey({
      name: 'certification_receipts_case_fk',
      columns: [table.workspaceId, table.companyId, table.caseId],
      foreignColumns: [
        certificationCases.workspaceId,
        certificationCases.companyId,
        certificationCases.id,
      ],
    }),
    foreignKey({
      name: 'certification_receipts_actor_fk',
      columns: [table.workspaceId, table.actorMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
  ],
);

// Case-scoped Activity: read back only through the Case timeline.
export const certificationEvents = pgTable(
  'certification_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    caseId: uuid('case_id').notNull(),
    revision: integer('revision').notNull(),
    action: text('action', { enum: CERTIFICATION_EVENT_ACTIONS }).notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    metadata: jsonb('metadata').$type<unknown>().notNull(),
  },
  (table) => [
    uniqueIndex('certification_events_revision_unique').on(
      table.workspaceId,
      table.companyId,
      table.caseId,
      table.revision,
    ),
    check(
      'certification_events_action_check',
      sql`${table.action} IN ('certification_case.opened', 'certification_case.application_recorded', 'certification_case.application_reviewed', 'certification_case.duration_confirmed', 'certification_case.document_attached', 'certification_case.agreement_recorded', 'certification_case.team_proposed', 'certification_case.team_decided', 'certification_case.stage_planned', 'certification_case.stage_reported', 'certification_case.finding_recorded', 'certification_case.finding_corrected', 'certification_case.finding_reclassified', 'certification_case.nonconformity_response_recorded', 'certification_case.nonconformity_plan_judged', 'certification_case.nonconformity_verified', 'certification_case.recommendation_recorded', 'certification_case.dossier_reviewed', 'certification_case.decision_recorded', 'certification_case.certificate_data_agreed', 'certification_case.certificate_recorded', 'certification_case.certificate_draft_recorded', 'certification_case.client_opinion_recorded', 'certification_case.certificate_draft_approved', 'certification_case.discrepancy_recorded', 'certification_case.discrepancy_resolved', 'certification_case.exchange_recorded', 'certification_case.reverification_item_added', 'certification_case.reverification_item_withdrawn') AND ${table.revision} > 0 AND jsonb_typeof(${table.metadata}) = 'object'`,
    ),
    foreignKey({
      name: 'certification_events_case_fk',
      columns: [table.workspaceId, table.companyId, table.caseId],
      foreignColumns: [
        certificationCases.workspaceId,
        certificationCases.companyId,
        certificationCases.id,
      ],
    }),
    foreignKey({
      name: 'certification_events_actor_fk',
      columns: [
        table.workspaceId,
        table.actorMembershipId,
        table.actorInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
  ],
);

/** One exact preserved PDF of the Case's Client, attached with its role; append-only. */
export const certificationCaseDocuments = pgTable(
  'certification_case_documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    caseId: uuid('case_id').notNull(),
    caseRevision: integer('case_revision').notNull(),
    role: text('role', { enum: CERTIFICATION_DOCUMENT_ROLES }).notNull(),
    documentId: uuid('document_id').notNull(),
    versionId: uuid('version_id').notNull(),
    representationId: uuid('representation_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    sourceTitle: text('source_title').notNull(),
    fileName: text('file_name').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sha256: text('sha256').notNull(),
    note: text('note'),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    attachedAt: timestamp('attached_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('certification_case_documents_scope_unique').on(
      table.workspaceId,
      table.companyId,
      table.caseId,
      table.id,
    ),
    uniqueIndex('certification_case_documents_tuple_unique').on(
      table.workspaceId,
      table.companyId,
      table.caseId,
      table.documentId,
      table.versionId,
      table.representationId,
    ),
    foreignKey({
      name: 'certification_case_documents_case_fk',
      columns: [table.workspaceId, table.companyId, table.caseId],
      foreignColumns: [
        certificationCases.workspaceId,
        certificationCases.companyId,
        certificationCases.id,
      ],
    }),
    foreignKey({
      name: 'certification_case_documents_pdf_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.documentId,
        table.versionId,
        table.representationId,
      ],
      foreignColumns: [
        documentPdfs.workspaceId,
        documentPdfs.companyId,
        documentPdfs.documentId,
        documentPdfs.versionId,
        documentPdfs.id,
      ],
    }),
    foreignKey({
      name: 'certification_case_documents_actor_fk',
      columns: [
        table.workspaceId,
        table.actorMembershipId,
        table.actorInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'certification_case_documents_role_check',
      sql`${table.role} IN ('questionnaire', 'iso22000_annex', 'agreement', 'plan', 'participant_list', 'report', 'evidence', 'certificate', 'certificate_data', 'decision_form', 'correspondence', 'certificate_draft', 'client_opinion', 'other') AND ${table.caseRevision} > 1 AND ${table.versionNumber} > 0 AND ${table.sizeBytes} > 0 AND ${table.sha256} ~ '^[a-f0-9]{64}$'`,
    ),
    check(
      'certification_case_documents_note_check',
      sql`${table.note} IS NULL OR length(btrim(${table.note})) BETWEEN 1 AND 1000`,
    ),
  ],
);

/** The identity of one Finding of one Stage; its content lives in immutable records. */
export const certificationFindings = pgTable(
  'certification_findings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    caseId: uuid('case_id').notNull(),
    stage: text('stage', { enum: ['stage_1', 'stage_2'] }).notNull(),
    sequence: integer('sequence').notNull(),
    caseRevision: integer('case_revision').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('certification_findings_scope_unique').on(
      table.workspaceId,
      table.companyId,
      table.caseId,
      table.id,
    ),
    uniqueIndex('certification_findings_sequence_unique').on(
      table.workspaceId,
      table.companyId,
      table.caseId,
      table.sequence,
    ),
    foreignKey({
      name: 'certification_findings_case_fk',
      columns: [table.workspaceId, table.companyId, table.caseId],
      foreignColumns: [
        certificationCases.workspaceId,
        certificationCases.companyId,
        certificationCases.id,
      ],
    }),
    check(
      'certification_findings_values_check',
      sql`${table.stage} IN ('stage_1', 'stage_2') AND ${table.sequence} > 0 AND ${table.caseRevision} > 1`,
    ),
  ],
);

export const CERTIFICATION_FINDING_RECORD_KINDS = [
  'statement',
  'classification',
  'response',
  'plan_judgment',
  'verification',
] as const;

/** Statement, classification and follow-up versions of a Finding; append-only. */
export const certificationFindingRecords = pgTable(
  'certification_finding_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    caseId: uuid('case_id').notNull(),
    findingId: uuid('finding_id').notNull(),
    kind: text('kind', { enum: CERTIFICATION_FINDING_RECORD_KINDS }).notNull(),
    version: integer('version').notNull(),
    caseRevision: integer('case_revision').notNull(),
    payload: jsonb('payload').$type<unknown>().notNull(),
    reason: text('reason'),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('certification_finding_records_number_unique').on(
      table.workspaceId,
      table.companyId,
      table.caseId,
      table.findingId,
      table.kind,
      table.version,
    ),
    foreignKey({
      name: 'certification_finding_records_finding_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.caseId,
        table.findingId,
      ],
      foreignColumns: [
        certificationFindings.workspaceId,
        certificationFindings.companyId,
        certificationFindings.caseId,
        certificationFindings.id,
      ],
    }),
    foreignKey({
      name: 'certification_finding_records_actor_fk',
      columns: [
        table.workspaceId,
        table.actorMembershipId,
        table.actorInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'certification_finding_records_values_check',
      sql`${table.kind} IN ('statement', 'classification', 'response', 'plan_judgment', 'verification') AND ${table.version} > 0 AND ${table.caseRevision} > 1 AND jsonb_typeof(${table.payload}) = 'object'`,
    ),
    check(
      'certification_finding_records_reason_check',
      sql`(${table.kind} IN ('statement', 'classification') AND ((${table.version} = 1 AND ${table.reason} IS NULL) OR (${table.version} > 1 AND length(btrim(${table.reason})) > 0))) OR (${table.kind} NOT IN ('statement', 'classification') AND ${table.reason} IS NULL)`,
    ),
  ],
);

/** The Certificate issued for a Case after a granting decision; one per Case. */
export const certificationCertificates = pgTable(
  'certification_certificates',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    caseId: uuid('case_id').notNull(),
    caseRevision: integer('case_revision').notNull(),
    number: text('number').notNull(),
    issuedOn: date('issued_on', { mode: 'string' }),
    approvedDraftVersionId: uuid('approved_draft_version_id'),
    validFrom: date('valid_from', { mode: 'string' }).notNull(),
    validUntil: date('valid_until', { mode: 'string' }).notNull(),
    firstSurveillanceBy: date('first_surveillance_by', {
      mode: 'string',
    }).notNull(),
    texts: jsonb('texts').$type<unknown>().notNull(),
    signedBy: text('signed_by'),
    signedByFunction: text('signed_by_function'),
    /** False only in Certificates recorded before the attestation was stored. */
    independenceAttested: boolean('independence_attested').notNull(),
    attachmentId: uuid('attachment_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('certification_certificates_case_unique').on(
      table.workspaceId,
      table.companyId,
      table.caseId,
    ),
    uniqueIndex('certification_certificates_number_unique').on(
      table.workspaceId,
      table.companyId,
      table.number,
    ),
    foreignKey({
      name: 'certification_certificates_case_fk',
      columns: [table.workspaceId, table.companyId, table.caseId],
      foreignColumns: [
        certificationCases.workspaceId,
        certificationCases.companyId,
        certificationCases.id,
      ],
    }),
    foreignKey({
      name: 'certification_certificates_attachment_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.caseId,
        table.attachmentId,
      ],
      foreignColumns: [
        certificationCaseDocuments.workspaceId,
        certificationCaseDocuments.companyId,
        certificationCaseDocuments.caseId,
        certificationCaseDocuments.id,
      ],
    }),
    foreignKey({
      name: 'certification_certificates_actor_fk',
      columns: [
        table.workspaceId,
        table.actorMembershipId,
        table.actorInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    foreignKey({
      name: 'certification_certificates_approved_draft_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.caseId,
        table.approvedDraftVersionId,
      ],
      foreignColumns: [
        certificationStepVersions.workspaceId,
        certificationStepVersions.companyId,
        certificationStepVersions.caseId,
        certificationStepVersions.id,
      ],
    }),
    check(
      'certification_certificates_release_check',
      sql`(${table.issuedOn} IS NULL AND ${table.approvedDraftVersionId} IS NULL) OR (${table.issuedOn} IS NOT NULL AND ${table.approvedDraftVersionId} IS NOT NULL AND ${table.issuedOn} >= ${table.validFrom})`,
    ),
    check(
      'certification_certificates_values_check',
      sql`length(btrim(${table.number})) BETWEEN 1 AND 64 AND ${table.validFrom} < ${table.validUntil} AND ${table.validFrom} < ${table.firstSurveillanceBy} AND ${table.caseRevision} > 1 AND jsonb_typeof(${table.texts}) = 'array'`,
    ),
  ],
);

export const CERTIFICATION_DISCREPANCY_VERDICTS = [
  'critical',
  'error',
  'to_clarify',
] as const;
/** The rule codes of the dossier consistency rule set, and manual Discrepancies. */
export const CERTIFICATION_DISCREPANCY_RULE_CODES = [
  'R01',
  'R02',
  'R03',
  'R04',
  'R05',
  'R06',
  'R07',
  'R08',
  'R09',
  'R10',
  'R11',
  'R12',
  'R13',
  'R14',
  'R15',
  'R16',
  'manual',
] as const;

/** A Discrepancy a member found by reading the Case's documents; append-only. */
export const certificationManualDiscrepancies = pgTable(
  'certification_manual_discrepancies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    caseId: uuid('case_id').notNull(),
    caseRevision: integer('case_revision').notNull(),
    sequence: integer('sequence').notNull(),
    verdict: text('verdict', {
      enum: CERTIFICATION_DISCREPANCY_VERDICTS,
    }).notNull(),
    subject: text('subject').notNull(),
    leftValue: text('left_value').notNull(),
    leftAttachmentId: uuid('left_attachment_id').notNull(),
    leftLocation: text('left_location'),
    rightValue: text('right_value').notNull(),
    rightAttachmentId: uuid('right_attachment_id').notNull(),
    rightLocation: text('right_location'),
    note: text('note'),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('certification_manual_discrepancies_scope_unique').on(
      table.workspaceId,
      table.companyId,
      table.caseId,
      table.id,
    ),
    uniqueIndex('certification_manual_discrepancies_sequence_unique').on(
      table.workspaceId,
      table.companyId,
      table.caseId,
      table.sequence,
    ),
    foreignKey({
      name: 'certification_manual_discrepancies_case_fk',
      columns: [table.workspaceId, table.companyId, table.caseId],
      foreignColumns: [
        certificationCases.workspaceId,
        certificationCases.companyId,
        certificationCases.id,
      ],
    }),
    foreignKey({
      name: 'certification_manual_discrepancies_left_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.caseId,
        table.leftAttachmentId,
      ],
      foreignColumns: [
        certificationCaseDocuments.workspaceId,
        certificationCaseDocuments.companyId,
        certificationCaseDocuments.caseId,
        certificationCaseDocuments.id,
      ],
    }),
    foreignKey({
      name: 'certification_manual_discrepancies_right_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.caseId,
        table.rightAttachmentId,
      ],
      foreignColumns: [
        certificationCaseDocuments.workspaceId,
        certificationCaseDocuments.companyId,
        certificationCaseDocuments.caseId,
        certificationCaseDocuments.id,
      ],
    }),
    foreignKey({
      name: 'certification_manual_discrepancies_actor_fk',
      columns: [
        table.workspaceId,
        table.actorMembershipId,
        table.actorInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'certification_manual_discrepancies_values_check',
      sql`${table.verdict} IN ('critical', 'error', 'to_clarify') AND ${table.sequence} > 0 AND ${table.caseRevision} > 1 AND length(btrim(${table.subject})) BETWEEN 1 AND 200 AND length(btrim(${table.leftValue})) BETWEEN 1 AND 1000 AND length(btrim(${table.rightValue})) BETWEEN 1 AND 1000 AND (${table.leftLocation} IS NULL OR length(btrim(${table.leftLocation})) BETWEEN 1 AND 200) AND (${table.rightLocation} IS NULL OR length(btrim(${table.rightLocation})) BETWEEN 1 AND 200) AND (${table.note} IS NULL OR length(btrim(${table.note})) BETWEEN 1 AND 2000)`,
    ),
  ],
);

/**
 * A human resolution of one Discrepancy: an acceptance with its reason,
 * bound to the rule, subject and exact compared values it accepted, or the
 * correction of a manual Discrepancy naming what corrected it. Append-only;
 * at most one per Discrepancy identity.
 */
export const certificationDiscrepancyResolutions = pgTable(
  'certification_discrepancy_resolutions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    caseId: uuid('case_id').notNull(),
    caseRevision: integer('case_revision').notNull(),
    discrepancyId: text('discrepancy_id').notNull(),
    ruleCode: text('rule_code', {
      enum: CERTIFICATION_DISCREPANCY_RULE_CODES,
    }).notNull(),
    manualDiscrepancyId: uuid('manual_discrepancy_id'),
    kind: text('kind', { enum: ['accepted', 'corrected'] }).notNull(),
    verdict: text('verdict', {
      enum: CERTIFICATION_DISCREPANCY_VERDICTS,
    }).notNull(),
    reason: text('reason').notNull(),
    /** The subject and values accepted, kept as compared at that time. */
    comparedValues: jsonb('compared_values').$type<unknown>().notNull(),
    correctedByAttachmentId: uuid('corrected_by_attachment_id'),
    correctedByStepVersionId: uuid('corrected_by_step_version_id'),
    ruleSetVersion: text('rule_set_version').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('certification_discrepancy_resolutions_identity_unique').on(
      table.workspaceId,
      table.companyId,
      table.caseId,
      table.discrepancyId,
    ),
    foreignKey({
      name: 'certification_discrepancy_resolutions_case_fk',
      columns: [table.workspaceId, table.companyId, table.caseId],
      foreignColumns: [
        certificationCases.workspaceId,
        certificationCases.companyId,
        certificationCases.id,
      ],
    }),
    foreignKey({
      name: 'certification_discrepancy_resolutions_manual_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.caseId,
        table.manualDiscrepancyId,
      ],
      foreignColumns: [
        certificationManualDiscrepancies.workspaceId,
        certificationManualDiscrepancies.companyId,
        certificationManualDiscrepancies.caseId,
        certificationManualDiscrepancies.id,
      ],
    }),
    foreignKey({
      name: 'certification_discrepancy_resolutions_attachment_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.caseId,
        table.correctedByAttachmentId,
      ],
      foreignColumns: [
        certificationCaseDocuments.workspaceId,
        certificationCaseDocuments.companyId,
        certificationCaseDocuments.caseId,
        certificationCaseDocuments.id,
      ],
    }),
    foreignKey({
      name: 'certification_discrepancy_resolutions_step_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.caseId,
        table.correctedByStepVersionId,
      ],
      foreignColumns: [
        certificationStepVersions.workspaceId,
        certificationStepVersions.companyId,
        certificationStepVersions.caseId,
        certificationStepVersions.id,
      ],
    }),
    foreignKey({
      name: 'certification_discrepancy_resolutions_actor_fk',
      columns: [
        table.workspaceId,
        table.actorMembershipId,
        table.actorInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'certification_discrepancy_resolutions_values_check',
      sql`${table.ruleCode} IN ('R01', 'R02', 'R03', 'R04', 'R05', 'R06', 'R07', 'R08', 'R09', 'R10', 'R11', 'R12', 'R13', 'R14', 'R15', 'R16', 'manual') AND ${table.kind} IN ('accepted', 'corrected') AND ${table.verdict} IN ('critical', 'error', 'to_clarify') AND ${table.caseRevision} > 1 AND length(btrim(${table.reason})) BETWEEN 1 AND 2000 AND length(btrim(${table.ruleSetVersion})) BETWEEN 1 AND 64 AND jsonb_typeof(${table.comparedValues}) = 'object' AND ${table.discrepancyId} ~ '^(R[0-9]{2}:[0-9a-f]{32}|manual:[0-9a-f-]{36})$'`,
    ),
    check(
      'certification_discrepancy_resolutions_kind_check',
      sql`((${table.ruleCode} = 'manual') = (${table.manualDiscrepancyId} IS NOT NULL)) AND (${table.kind} = 'accepted' OR (${table.ruleCode} = 'manual' AND num_nonnulls(${table.correctedByAttachmentId}, ${table.correctedByStepVersionId}) = 1)) AND (${table.kind} = 'corrected' OR num_nonnulls(${table.correctedByAttachmentId}, ${table.correctedByStepVersionId}) = 0) AND (${table.kind} = 'corrected' OR ${table.verdict} <> 'critical')`,
    ),
  ],
);

export const CERTIFICATION_EXCHANGE_DIRECTIONS = ['received', 'sent'] as const;
export const CERTIFICATION_EXCHANGE_ITEM_KINDS = [
  'application',
  'agreement',
  'team_notice',
  'stage_plan',
  'stage_report',
  'participant_list',
  'nonconformity_response',
  'client_data_confirmation',
  'audit_dossier',
  'certificate_data_form',
  'certificate_draft',
  'client_opinion',
  'decision_form',
  'certificate',
  'other',
] as const;
export const CERTIFICATION_EXCHANGE_COUNTERPART_KINDS = [
  'client',
  'certification_body',
  'audit_team_member',
  'other',
] as const;
export const CERTIFICATION_EXCHANGE_CHANNELS = [
  'email',
  'platform',
  'courier',
  'hand_delivery',
  'other',
] as const;

/**
 * One version of an Exchange Record: a human declaration of what was
 * received or sent, with the exact attached Document Versions exchanged.
 * A correction appends the next version with its reason; append-only.
 */
export const certificationExchangeRecords = pgTable(
  'certification_exchange_records',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    caseId: uuid('case_id').notNull(),
    sequence: integer('sequence').notNull(),
    version: integer('version').notNull(),
    caseRevision: integer('case_revision').notNull(),
    direction: text('direction', {
      enum: CERTIFICATION_EXCHANGE_DIRECTIONS,
    }).notNull(),
    itemKind: text('item_kind', {
      enum: CERTIFICATION_EXCHANGE_ITEM_KINDS,
    }).notNull(),
    counterpartKind: text('counterpart_kind', {
      enum: CERTIFICATION_EXCHANGE_COUNTERPART_KINDS,
    }).notNull(),
    counterpartName: text('counterpart_name').notNull(),
    businessDate: date('business_date', { mode: 'string' }).notNull(),
    channel: text('channel', {
      enum: CERTIFICATION_EXCHANGE_CHANNELS,
    }).notNull(),
    reference: text('reference'),
    note: text('note'),
    /** The exchanged attachments of this Case, validated by the command. */
    attachmentIds: jsonb('attachment_ids').$type<unknown>().notNull(),
    reason: text('reason'),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('certification_exchange_records_scope_unique').on(
      table.workspaceId,
      table.companyId,
      table.caseId,
      table.id,
    ),
    uniqueIndex('certification_exchange_records_number_unique').on(
      table.workspaceId,
      table.companyId,
      table.caseId,
      table.sequence,
      table.version,
    ),
    foreignKey({
      name: 'certification_exchange_records_case_fk',
      columns: [table.workspaceId, table.companyId, table.caseId],
      foreignColumns: [
        certificationCases.workspaceId,
        certificationCases.companyId,
        certificationCases.id,
      ],
    }),
    foreignKey({
      name: 'certification_exchange_records_actor_fk',
      columns: [
        table.workspaceId,
        table.actorMembershipId,
        table.actorInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'certification_exchange_records_values_check',
      sql`${table.direction} IN ('received', 'sent') AND ${table.itemKind} IN ('application', 'agreement', 'team_notice', 'stage_plan', 'stage_report', 'participant_list', 'nonconformity_response', 'client_data_confirmation', 'audit_dossier', 'certificate_data_form', 'certificate_draft', 'client_opinion', 'decision_form', 'certificate', 'other') AND ${table.counterpartKind} IN ('client', 'certification_body', 'audit_team_member', 'other') AND ${table.channel} IN ('email', 'platform', 'courier', 'hand_delivery', 'other') AND ${table.sequence} > 0 AND ${table.version} > 0 AND ${table.caseRevision} > 1 AND length(btrim(${table.counterpartName})) BETWEEN 1 AND 200 AND (${table.reference} IS NULL OR length(btrim(${table.reference})) BETWEEN 1 AND 64) AND (${table.note} IS NULL OR length(btrim(${table.note})) BETWEEN 1 AND 2000) AND (${table.channel} <> 'other' OR ${table.note} IS NOT NULL) AND jsonb_typeof(${table.attachmentIds}) = 'array' AND jsonb_array_length(${table.attachmentIds}) BETWEEN 1 AND 20`,
    ),
    check(
      'certification_exchange_records_reason_check',
      sql`(${table.version} = 1 AND ${table.reason} IS NULL) OR (${table.version} > 1 AND length(btrim(${table.reason})) BETWEEN 1 AND 2000)`,
    ),
  ],
);

/**
 * A manual Re-verification Item: what to verify at the next Audit, added by
 * a member or by an acceptance with the re-verification flag. Automatic
 * items (minor nonconformities with an adequate plan) are derived on read.
 */
export const certificationReverificationItems = pgTable(
  'certification_reverification_items',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    caseId: uuid('case_id').notNull(),
    caseRevision: integer('case_revision').notNull(),
    sequence: integer('sequence').notNull(),
    origin: text('origin', { enum: ['manual', 'discrepancy'] }).notNull(),
    text: text('text').notNull(),
    sourceKind: text('source_kind', {
      enum: ['finding', 'discrepancy', 'exchange', 'attachment'],
    }),
    sourceFindingId: uuid('source_finding_id'),
    sourceDiscrepancyId: text('source_discrepancy_id'),
    sourceExchangeSequence: integer('source_exchange_sequence'),
    sourceAttachmentId: uuid('source_attachment_id'),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('certification_reverification_items_scope_unique').on(
      table.workspaceId,
      table.companyId,
      table.caseId,
      table.id,
    ),
    uniqueIndex('certification_reverification_items_sequence_unique').on(
      table.workspaceId,
      table.companyId,
      table.caseId,
      table.sequence,
    ),
    foreignKey({
      name: 'certification_reverification_items_case_fk',
      columns: [table.workspaceId, table.companyId, table.caseId],
      foreignColumns: [
        certificationCases.workspaceId,
        certificationCases.companyId,
        certificationCases.id,
      ],
    }),
    foreignKey({
      name: 'certification_reverification_items_finding_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.caseId,
        table.sourceFindingId,
      ],
      foreignColumns: [
        certificationFindings.workspaceId,
        certificationFindings.companyId,
        certificationFindings.caseId,
        certificationFindings.id,
      ],
    }),
    foreignKey({
      name: 'certification_reverification_items_attachment_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.caseId,
        table.sourceAttachmentId,
      ],
      foreignColumns: [
        certificationCaseDocuments.workspaceId,
        certificationCaseDocuments.companyId,
        certificationCaseDocuments.caseId,
        certificationCaseDocuments.id,
      ],
    }),
    foreignKey({
      name: 'certification_reverification_items_actor_fk',
      columns: [
        table.workspaceId,
        table.actorMembershipId,
        table.actorInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'certification_reverification_items_values_check',
      sql`${table.origin} IN ('manual', 'discrepancy') AND ${table.sequence} > 0 AND ${table.caseRevision} > 1 AND length(btrim(${table.text})) BETWEEN 1 AND 2000 AND (${table.sourceExchangeSequence} IS NULL OR ${table.sourceExchangeSequence} > 0) AND (${table.sourceDiscrepancyId} IS NULL OR ${table.sourceDiscrepancyId} ~ '^(R[0-9]{2}:[0-9a-f]{32}|manual:[0-9a-f-]{36})$')`,
    ),
    check(
      'certification_reverification_items_source_check',
      sql`num_nonnulls(${table.sourceFindingId}, ${table.sourceDiscrepancyId}, ${table.sourceExchangeSequence}, ${table.sourceAttachmentId}) = (CASE WHEN ${table.sourceKind} IS NULL THEN 0 ELSE 1 END) AND (${table.sourceKind} IS NULL OR (${table.sourceKind} = 'finding' AND ${table.sourceFindingId} IS NOT NULL) OR (${table.sourceKind} = 'discrepancy' AND ${table.sourceDiscrepancyId} IS NOT NULL) OR (${table.sourceKind} = 'exchange' AND ${table.sourceExchangeSequence} IS NOT NULL) OR (${table.sourceKind} = 'attachment' AND ${table.sourceAttachmentId} IS NOT NULL)) AND (${table.origin} = 'manual' OR ${table.sourceKind} = 'discrepancy')`,
    ),
  ],
);

/** The withdrawal of one manual Re-verification Item, with its reason; append-only. */
export const certificationReverificationWithdrawals = pgTable(
  'certification_reverification_withdrawals',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    caseId: uuid('case_id').notNull(),
    caseRevision: integer('case_revision').notNull(),
    itemId: uuid('item_id').notNull(),
    reason: text('reason').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('certification_reverification_withdrawals_item_unique').on(
      table.workspaceId,
      table.companyId,
      table.caseId,
      table.itemId,
    ),
    foreignKey({
      name: 'certification_reverification_withdrawals_case_fk',
      columns: [table.workspaceId, table.companyId, table.caseId],
      foreignColumns: [
        certificationCases.workspaceId,
        certificationCases.companyId,
        certificationCases.id,
      ],
    }),
    foreignKey({
      name: 'certification_reverification_withdrawals_item_fk',
      columns: [table.workspaceId, table.companyId, table.caseId, table.itemId],
      foreignColumns: [
        certificationReverificationItems.workspaceId,
        certificationReverificationItems.companyId,
        certificationReverificationItems.caseId,
        certificationReverificationItems.id,
      ],
    }),
    foreignKey({
      name: 'certification_reverification_withdrawals_actor_fk',
      columns: [
        table.workspaceId,
        table.actorMembershipId,
        table.actorInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'certification_reverification_withdrawals_values_check',
      sql`${table.caseRevision} > 1 AND length(btrim(${table.reason})) BETWEEN 1 AND 2000`,
    ),
  ],
);

/**
 * One version of a certifying Company's procedure deadline set: whole
 * calendar days per kind, or not configured. Nothing is seeded; the
 * command's idempotency key and fingerprint replay it. Append-only.
 */
export const certificationDeadlineSets = pgTable(
  'certification_deadline_sets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    version: integer('version').notNull(),
    stagePlanSentDays: integer('stage_plan_sent_days'),
    auditDossierTransmittedDays: integer('audit_dossier_transmitted_days'),
    stage2ReportReleasedDays: integer('stage_2_report_released_days'),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('certification_deadline_sets_version_unique').on(
      table.workspaceId,
      table.companyId,
      table.version,
    ),
    uniqueIndex('certification_deadline_sets_actor_key_unique').on(
      table.workspaceId,
      table.companyId,
      table.actorMembershipId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: 'certification_deadline_sets_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'certification_deadline_sets_actor_fk',
      columns: [
        table.workspaceId,
        table.actorMembershipId,
        table.actorInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'certification_deadline_sets_values_check',
      sql`${table.version} > 0 AND (${table.stagePlanSentDays} IS NULL OR ${table.stagePlanSentDays} BETWEEN 0 AND 365) AND (${table.auditDossierTransmittedDays} IS NULL OR ${table.auditDossierTransmittedDays} BETWEEN 0 AND 365) AND (${table.stage2ReportReleasedDays} IS NULL OR ${table.stage2ReportReleasedDays} BETWEEN 0 AND 365) AND length(${table.idempotencyKey}) BETWEEN 1 AND 255 AND ${table.fingerprint} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

export const CERTIFICATION_PROCEDURE_EVENT_ACTIONS = [
  'certification_procedure.deadlines_configured',
] as const;

// Company-scoped certification Activity: one event per deadline set version.
export const certificationProcedureEvents = pgTable(
  'certification_procedure_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    version: integer('version').notNull(),
    action: text('action', {
      enum: CERTIFICATION_PROCEDURE_EVENT_ACTIONS,
    }).notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    metadata: jsonb('metadata').$type<unknown>().notNull(),
  },
  (table) => [
    uniqueIndex('certification_procedure_events_version_unique').on(
      table.workspaceId,
      table.companyId,
      table.version,
    ),
    foreignKey({
      name: 'certification_procedure_events_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'certification_procedure_events_actor_fk',
      columns: [
        table.workspaceId,
        table.actorMembershipId,
        table.actorInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    check(
      'certification_procedure_events_values_check',
      sql`${table.action} IN ('certification_procedure.deadlines_configured') AND ${table.version} > 0 AND jsonb_typeof(${table.metadata}) = 'object'`,
    ),
  ],
);

/** Immutable R13 source observations at successful Case revisions; never rule results. */
export const certificationNumberObservations = pgTable(
  'certification_number_observations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    caseId: uuid('case_id').notNull(),
    caseRevision: integer('case_revision').notNull(),
    numbers: jsonb('numbers').$type<unknown>().notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('certification_number_observations_revision_unique').on(
      table.workspaceId,
      table.companyId,
      table.caseId,
      table.caseRevision,
    ),
    foreignKey({
      name: 'certification_number_observations_case_fk',
      columns: [table.workspaceId, table.companyId, table.caseId],
      foreignColumns: [
        certificationCases.workspaceId,
        certificationCases.companyId,
        certificationCases.id,
      ],
    }),
    check(
      'certification_number_observations_values_check',
      sql`${table.caseRevision} > 1 AND jsonb_typeof(${table.numbers}) = 'array'`,
    ),
  ],
);
