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
      sql`${table.step} IN ('application', 'application_review', 'duration', 'agreement', 'team', 'team_decision', 'stage_1_plan', 'stage_1_report', 'stage_2_plan', 'stage_2_report', 'recommendation', 'dossier_review', 'decision', 'certificate_data') AND ${table.version} > 0 AND ${table.caseRevision} > 1`,
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
      sql`${table.commandKind} IN ('open', 'application', 'application_review', 'duration', 'document', 'agreement', 'team', 'team_decision', 'stage_plan', 'stage_report', 'finding', 'finding_record', 'recommendation', 'dossier_review', 'decision', 'certificate_data', 'certificate')`,
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
      sql`${table.action} IN ('certification_case.opened', 'certification_case.application_recorded', 'certification_case.application_reviewed', 'certification_case.duration_confirmed', 'certification_case.document_attached', 'certification_case.agreement_recorded', 'certification_case.team_proposed', 'certification_case.team_decided', 'certification_case.stage_planned', 'certification_case.stage_reported', 'certification_case.finding_recorded', 'certification_case.finding_corrected', 'certification_case.finding_reclassified', 'certification_case.nonconformity_response_recorded', 'certification_case.nonconformity_plan_judged', 'certification_case.nonconformity_verified', 'certification_case.recommendation_recorded', 'certification_case.dossier_reviewed', 'certification_case.decision_recorded', 'certification_case.certificate_data_agreed', 'certification_case.certificate_recorded') AND ${table.revision} > 0 AND jsonb_typeof(${table.metadata}) = 'object'`,
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
      sql`${table.role} IN ('questionnaire', 'iso22000_annex', 'agreement', 'plan', 'participant_list', 'report', 'evidence', 'certificate', 'certificate_data', 'decision_form', 'other') AND ${table.caseRevision} > 1 AND ${table.versionNumber} > 0 AND ${table.sizeBytes} > 0 AND ${table.sha256} ~ '^[a-f0-9]{64}$'`,
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
    check(
      'certification_certificates_values_check',
      sql`length(btrim(${table.number})) BETWEEN 1 AND 64 AND ${table.validFrom} < ${table.validUntil} AND ${table.validFrom} < ${table.firstSurveillanceBy} AND ${table.caseRevision} > 1 AND jsonb_typeof(${table.texts}) = 'array'`,
    ),
  ],
);
