import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { companies, clientAccounts, workspaceMemberships } from './core.js';
import { projects } from './project.js';
import { workingDocuments } from './documents.js';
import { documentPdfs } from './document-pdfs.js';

export const workingEvidenceCursorKeys = pgTable(
  'working_evidence_cursor_keys',
  {
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    key: text('key')
      .notNull()
      .default(sql`gen_random_uuid()::text || gen_random_uuid()::text`),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.companyId] }),
    foreignKey({
      name: 'working_evidence_cursor_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
  ],
);

const bytes = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});
export const receivedAuditSourceRegistrations = pgTable(
  'received_audit_source_registrations',
  {
    documentId: uuid('document_id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    originalClientId: uuid('original_client_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    registeredAt: timestamp('registered_at', { withTimezone: true }).notNull(),
    originalTitle: text('original_title').notNull(),
    originalPurpose: text('original_purpose').notNull(),
  },
  (t) => [
    foreignKey({
      name: 'received_audit_source_document_fk',
      columns: [t.workspaceId, t.companyId, t.documentId],
      foreignColumns: [
        workingDocuments.workspaceId,
        workingDocuments.companyId,
        workingDocuments.id,
      ],
    }),
  ],
);

export const workingEvidenceCases = pgTable(
  'working_evidence_cases',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id').notNull(),
    originalClientId: uuid('original_client_id').notNull(),
    revision: integer('revision').notNull(),
    currentRevisionId: uuid('current_revision_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('working_evidence_cases_scope_unique').on(
      t.workspaceId,
      t.companyId,
      t.id,
    ),
    foreignKey({
      name: 'working_evidence_cases_company_fk',
      columns: [t.workspaceId, t.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'working_evidence_cases_project_fk',
      columns: [t.workspaceId, t.companyId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.companyId, projects.id],
    }),
    foreignKey({
      name: 'working_evidence_cases_client_fk',
      columns: [t.workspaceId, t.originalClientId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    check(
      'working_evidence_cases_revision_check',
      sql`${t.revision} BETWEEN 1 AND 2147483647`,
    ),
  ],
);
export const workingEvidenceRevisions = pgTable(
  'working_evidence_revisions',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    caseId: uuid('case_id').notNull(),
    revisionNumber: integer('revision_number').notNull(),
    previousRevisionId: uuid('previous_revision_id'),
    action: text('action', { enum: ['RECORD', 'CORRECT'] }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    reason: text('reason'),
    title: text('title').notNull(),
    declaredContext: text('declared_context'),
    process: text('process').notNull(),
    statement: text('statement').notNull(),
    observationNote: text('observation_note'),
    clientVersionBefore: integer('client_version_before').notNull(),
  },
  (t) => [
    uniqueIndex('working_evidence_revisions_scope_unique').on(
      t.workspaceId,
      t.companyId,
      t.caseId,
      t.id,
    ),
    uniqueIndex('working_evidence_revisions_number_unique').on(
      t.workspaceId,
      t.companyId,
      t.caseId,
      t.revisionNumber,
    ),
    foreignKey({
      name: 'working_evidence_revisions_case_fk',
      columns: [t.workspaceId, t.companyId, t.caseId],
      foreignColumns: [
        workingEvidenceCases.workspaceId,
        workingEvidenceCases.companyId,
        workingEvidenceCases.id,
      ],
    }),
    foreignKey({
      name: 'working_evidence_revisions_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'working_evidence_revisions_action_check',
      sql`(${t.action}='RECORD' AND ${t.revisionNumber}=1 AND ${t.previousRevisionId} IS NULL AND ${t.reason} IS NULL) OR (${t.action}='CORRECT' AND ${t.revisionNumber}>1 AND ${t.previousRevisionId} IS NOT NULL AND ${t.reason} IS NOT NULL)`,
    ),
  ],
);
export const workingEvidenceSupports = pgTable(
  'working_evidence_supports',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    caseId: uuid('case_id').notNull(),
    revisionId: uuid('revision_id').notNull(),
    position: integer('position').notNull(),
    documentId: uuid('document_id').notNull(),
    versionId: uuid('version_id').notNull(),
    representationId: uuid('representation_id').notNull(),
    snapshot: jsonb('snapshot').$type<unknown>().notNull(),
  },
  (t) => [
    foreignKey({
      name: 'working_evidence_support_revision_fk',
      columns: [t.workspaceId, t.companyId, t.caseId, t.revisionId],
      foreignColumns: [
        workingEvidenceRevisions.workspaceId,
        workingEvidenceRevisions.companyId,
        workingEvidenceRevisions.caseId,
        workingEvidenceRevisions.id,
      ],
    }),
    foreignKey({
      name: 'working_evidence_support_pdf_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.documentId,
        t.versionId,
        t.representationId,
      ],
      foreignColumns: [
        documentPdfs.workspaceId,
        documentPdfs.companyId,
        documentPdfs.documentId,
        documentPdfs.versionId,
        documentPdfs.id,
      ],
    }),
    uniqueIndex('working_evidence_support_position_unique').on(
      t.revisionId,
      t.position,
    ),
    uniqueIndex('working_evidence_support_tuple_unique').on(
      t.revisionId,
      t.documentId,
      t.versionId,
      t.representationId,
    ),
    check(
      'working_evidence_support_position_check',
      sql`${t.position} BETWEEN 1 AND 3`,
    ),
  ],
);
export const workingEvidenceOutputs = pgTable(
  'working_evidence_outputs',
  {
    revisionId: uuid('revision_id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    caseId: uuid('case_id').notNull(),
    statement: bytes('statement').notNull(),
    statementSha256: text('statement_sha256').notNull(),
    annex: bytes('annex').notNull(),
    annexSha256: text('annex_sha256').notNull(),
  },
  (t) => [
    foreignKey({
      name: 'working_evidence_output_revision_fk',
      columns: [t.workspaceId, t.companyId, t.caseId, t.revisionId],
      foreignColumns: [
        workingEvidenceRevisions.workspaceId,
        workingEvidenceRevisions.companyId,
        workingEvidenceRevisions.caseId,
        workingEvidenceRevisions.id,
      ],
    }),
    check(
      'working_evidence_output_bounds_check',
      sql`octet_length(${t.statement}) BETWEEN 1 AND 262144 AND octet_length(${t.annex}) BETWEEN 1 AND 16777216 AND ${t.statementSha256}=encode(sha256(${t.statement}),'hex') AND ${t.annexSha256}=encode(sha256(${t.annex}),'hex')`,
    ),
  ],
);
export const workingEvidenceReceipts = pgTable(
  'working_evidence_receipts',
  {
    commandId: uuid('command_id').notNull(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    caseId: uuid('case_id').notNull(),
    revisionId: uuid('revision_id').notNull(),
    intent: jsonb('intent').$type<unknown>().notNull(),
    fingerprint: text('fingerprint').notNull(),
    receipt: jsonb('receipt').$type<unknown>().notNull(),
  },
  (t) => [
    uniqueIndex('working_evidence_receipt_key_unique').on(
      t.workspaceId,
      t.actorMembershipId,
      t.commandId,
    ),
    uniqueIndex('working_evidence_receipt_revision_unique').on(t.revisionId),
    foreignKey({
      name: 'working_evidence_receipt_revision_fk',
      columns: [t.workspaceId, t.companyId, t.caseId, t.revisionId],
      foreignColumns: [
        workingEvidenceRevisions.workspaceId,
        workingEvidenceRevisions.companyId,
        workingEvidenceRevisions.caseId,
        workingEvidenceRevisions.id,
      ],
    }),
  ],
);
export const workingEvidenceEvents = pgTable(
  'working_evidence_events',
  {
    revisionId: uuid('revision_id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    caseId: uuid('case_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    action: text('action', {
      enum: [
        'working_evidence_case.recorded',
        'working_evidence_case.corrected',
      ],
    }).notNull(),
    metadata: jsonb('metadata')
      .$type<{ caseId: string; revisionNumber: number }>()
      .notNull(),
  },
  (t) => [
    foreignKey({
      name: 'working_evidence_event_revision_fk',
      columns: [t.workspaceId, t.companyId, t.caseId, t.revisionId],
      foreignColumns: [
        workingEvidenceRevisions.workspaceId,
        workingEvidenceRevisions.companyId,
        workingEvidenceRevisions.caseId,
        workingEvidenceRevisions.id,
      ],
    }),
  ],
);
