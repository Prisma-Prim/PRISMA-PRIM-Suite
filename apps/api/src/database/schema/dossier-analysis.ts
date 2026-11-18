import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  foreignKey,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { projects } from './project.js';
import { documentPdfs } from './document-pdfs.js';
import { certificationCaseDocuments } from './certification.js';
import { documentVersions } from './documents.js';
import { workspaceMemberships } from './core.js';

/** Foreground orchestration only: native owners retain bytes and command receipts. */
export const dossierIntakeBatches = pgTable(
  'dossier_intake_batches',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id').notNull(),
    clientId: uuid('client_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    revision: integer('revision').notNull().default(1),
    phase: text('phase', {
      enum: ['paused', 'active', 'stopped', 'completed'],
    }).notNull(),
    manifest: jsonb('manifest').$type<unknown>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('dossier_intake_batches_actor_key_unique').on(
      t.workspaceId,
      t.actorMembershipId,
      t.idempotencyKey,
    ),
    foreignKey({
      name: 'dossier_intake_batches_project_fk',
      columns: [t.workspaceId, t.companyId, t.clientId, t.projectId],
      foreignColumns: [
        projects.workspaceId,
        projects.companyId,
        projects.clientAccountId,
        projects.id,
      ],
    }),
    foreignKey({
      name: 'dossier_intake_batches_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'dossier_intake_batches_state_check',
      sql`(${t.revision} > 0 AND ${t.phase} IN ('paused','active','stopped','completed') AND ${t.fingerprint} ~ '^[a-f0-9]{64}$' AND length(${t.idempotencyKey}) BETWEEN 1 AND 200 AND jsonb_typeof(${t.manifest}) = 'object' AND ${t.manifest}->>'format' = 'DOCUMENT_INTAKE_STATE/1' AND jsonb_typeof(${t.manifest}->'items') = 'array' AND jsonb_array_length(${t.manifest}->'items') BETWEEN 1 AND 25 AND octet_length(${t.manifest}::text) <= 131072) IS TRUE`,
    ),
  ],
);

const bytes = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

/** Immutable source identity and original; removal only changes selection. */
export const dossierAnalysisSources = pgTable(
  'dossier_analysis_sources',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id').notNull(),
    documentId: uuid('document_id').notNull(),
    versionId: uuid('version_id').notNull(),
    representationId: uuid('representation_id'),
    caseId: uuid('case_id'),
    attachmentId: uuid('attachment_id'),
    kind: text('kind', { enum: ['pdf', 'docx'] }).notNull(),
    fileName: text('file_name').notNull(),
    language: text('language', { enum: ['ro', 'ru', 'fr', 'en'] }).notNull(),
    sha256: text('sha256').notNull(),
    size: integer('size').notNull(),
    original: bytes('original'),
    scanEngine: text('scan_engine'),
    scannedAt: timestamp('scanned_at', { withTimezone: true }),
    createdByMembershipId: uuid('created_by_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    removedAt: timestamp('removed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('dossier_analysis_sources_scope_unique').on(
      t.workspaceId,
      t.companyId,
      t.projectId,
      t.id,
    ),
    foreignKey({
      name: 'dossier_analysis_sources_project_fk',
      columns: [t.workspaceId, t.companyId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.companyId, projects.id],
    }),
    foreignKey({
      name: 'dossier_analysis_sources_version_fk',
      columns: [t.workspaceId, t.companyId, t.documentId, t.versionId],
      foreignColumns: [
        documentVersions.workspaceId,
        documentVersions.companyId,
        documentVersions.documentId,
        documentVersions.id,
      ],
    }),
    foreignKey({
      name: 'dossier_analysis_sources_pdf_fk',
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
    foreignKey({
      name: 'dossier_analysis_sources_attachment_fk',
      columns: [t.workspaceId, t.companyId, t.caseId, t.attachmentId],
      foreignColumns: [
        certificationCaseDocuments.workspaceId,
        certificationCaseDocuments.companyId,
        certificationCaseDocuments.caseId,
        certificationCaseDocuments.id,
      ],
    }),
    foreignKey({
      name: 'dossier_analysis_sources_actor_fk',
      columns: [t.workspaceId, t.createdByMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'dossier_analysis_sources_identity_check',
      sql`${t.sha256} ~ '^[a-f0-9]{64}$' AND ${t.size} BETWEEN 1 AND 5242880 AND length(${t.fileName}) BETWEEN 1 AND 120 AND ${t.language} IN ('ro','ru','fr','en') AND ((${t.caseId} IS NULL AND ${t.attachmentId} IS NULL) OR (${t.caseId} IS NOT NULL AND ${t.attachmentId} IS NOT NULL)) AND ((${t.kind} = 'pdf' AND ${t.representationId} IS NOT NULL AND ${t.original} IS NULL AND ${t.scanEngine} IS NULL AND ${t.scannedAt} IS NULL) OR (${t.kind} = 'docx' AND ${t.representationId} IS NULL AND ${t.original} IS NOT NULL AND octet_length(${t.original}) = ${t.size} AND ${t.scanEngine} IS NOT NULL AND ${t.scannedAt} IS NOT NULL))`,
    ),
  ],
);

/** Frozen inputs and outputs are versioned JSON, never rewritten by a rerun. */
export const dossierAnalysisRuns = pgTable(
  'dossier_analysis_runs',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id').notNull(),
    snapshotHash: text('snapshot_hash').notNull(),
    cursorKey: uuid('cursor_key').defaultRandom().notNull(),
    snapshot: jsonb('snapshot').$type<unknown>().notNull(),
    result: jsonb('result').$type<unknown>().notNull(),
    createdByMembershipId: uuid('created_by_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('dossier_analysis_runs_scope_unique').on(
      t.workspaceId,
      t.companyId,
      t.projectId,
      t.id,
    ),
    foreignKey({
      name: 'dossier_analysis_runs_project_fk',
      columns: [t.workspaceId, t.companyId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.companyId, projects.id],
    }),
    foreignKey({
      name: 'dossier_analysis_runs_actor_fk',
      columns: [t.workspaceId, t.createdByMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'dossier_analysis_runs_hash_check',
      sql`${t.snapshotHash} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

export const dossierAnalysisSuggestions = pgTable(
  'dossier_analysis_suggestions',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id').notNull(),
    runId: uuid('run_id').notNull(),
    proposal: jsonb('proposal').$type<unknown>().notNull(),
    revision: integer('revision').notNull().default(0),
    createdByMembershipId: uuid('created_by_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('dossier_analysis_suggestions_scope_unique').on(
      t.workspaceId,
      t.companyId,
      t.projectId,
      t.id,
    ),
    foreignKey({
      name: 'dossier_analysis_suggestions_run_fk',
      columns: [t.workspaceId, t.companyId, t.projectId, t.runId],
      foreignColumns: [
        dossierAnalysisRuns.workspaceId,
        dossierAnalysisRuns.companyId,
        dossierAnalysisRuns.projectId,
        dossierAnalysisRuns.id,
      ],
    }),
    foreignKey({
      name: 'dossier_analysis_suggestions_actor_fk',
      columns: [t.workspaceId, t.createdByMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'dossier_analysis_suggestions_revision_check',
      sql`${t.revision} >= 0`,
    ),
  ],
);

export const dossierAnalysisReviews = pgTable(
  'dossier_analysis_reviews',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id').notNull(),
    suggestionId: uuid('suggestion_id').notNull(),
    revision: integer('revision').notNull(),
    decision: text('decision', {
      enum: ['confirm', 'reject', 'correct'],
    }).notNull(),
    replacementValue: text('replacement_value'),
    actorDisplayName: text('actor_display_name').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('dossier_analysis_reviews_revision_unique').on(
      t.workspaceId,
      t.companyId,
      t.projectId,
      t.suggestionId,
      t.revision,
    ),
    foreignKey({
      name: 'dossier_analysis_reviews_suggestion_fk',
      columns: [t.workspaceId, t.companyId, t.projectId, t.suggestionId],
      foreignColumns: [
        dossierAnalysisSuggestions.workspaceId,
        dossierAnalysisSuggestions.companyId,
        dossierAnalysisSuggestions.projectId,
        dossierAnalysisSuggestions.id,
      ],
    }),
    foreignKey({
      name: 'dossier_analysis_reviews_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'dossier_analysis_reviews_decision_check',
      sql`${t.revision} > 0 AND ((${t.decision} IN ('confirm','reject') AND ${t.replacementValue} IS NULL) OR (${t.decision} = 'correct' AND ${t.replacementValue} IS NOT NULL AND length(btrim(${t.replacementValue})) BETWEEN 1 AND 2000))`,
    ),
  ],
);

/** Private, append-only success receipts double as minimal command history. */
export const dossierAnalysisEvents = pgTable(
  'dossier_analysis_events',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    projectId: uuid('project_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    action: text('action').notNull(),
    targetId: uuid('target_id').notNull(),
    receipt: jsonb('receipt').$type<unknown>().notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('dossier_analysis_events_command_unique').on(
      t.workspaceId,
      t.actorMembershipId,
      t.idempotencyKey,
    ),
    foreignKey({
      name: 'dossier_analysis_events_project_fk',
      columns: [t.workspaceId, t.companyId, t.projectId],
      foreignColumns: [projects.workspaceId, projects.companyId, projects.id],
    }),
    foreignKey({
      name: 'dossier_analysis_events_actor_fk',
      columns: [t.workspaceId, t.actorMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'dossier_analysis_events_shape_check',
      sql`${t.fingerprint} ~ '^[a-f0-9]{64}$' AND ${t.action} IN ('source.added','source.removed','run.created','suggestions.imported','suggestion.reviewed')`,
    ),
  ],
);
