import { sql } from 'drizzle-orm';
import {
  check,
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
import { companies, workspaceMemberships } from './core.js';
import { documentPdfs } from './document-pdfs.js';
import { documentVersions } from './documents.js';

export const knowledgeSources = pgTable(
  'knowledge_sources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    documentId: uuid('document_id').notNull(),
    documentVersionId: uuid('document_version_id').notNull(),
    representationId: uuid('representation_id').notNull(),
    revision: integer('revision').notNull().default(1),
    state: text('state', { enum: ['draft', 'admitted', 'revoked'] })
      .notNull()
      .default('draft'),
    sourceSha256: text('source_sha256').notNull(),
    projectionSha256: text('projection_sha256').notNull(),
    language: text('language', { enum: ['ro', 'ru', 'en'] }).notNull(),
    ownerReference: text('owner_reference').notNull(),
    provenance: text('provenance').notNull(),
    rightsEvidenceReference: text('rights_evidence_reference').notNull(),
    permittedPurpose: text('permitted_purpose').notNull(),
    confidentiality: text('confidentiality').notNull(),
    effectiveFrom: timestamp('effective_from', {
      withTimezone: true,
    }).notNull(),
    effectiveUntil: timestamp('effective_until', {
      withTimezone: true,
    }).notNull(),
    createdByMembershipId: uuid('created_by_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('knowledge_sources_scope_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
    ),
    index('knowledge_sources_company_page').on(
      table.workspaceId,
      table.companyId,
      table.id,
    ),
    foreignKey({
      name: 'knowledge_sources_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'knowledge_sources_version_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.documentId,
        table.documentVersionId,
      ],
      foreignColumns: [
        documentVersions.workspaceId,
        documentVersions.companyId,
        documentVersions.documentId,
        documentVersions.id,
      ],
    }),
    foreignKey({
      name: 'knowledge_sources_pdf_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.documentId,
        table.documentVersionId,
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
      name: 'knowledge_sources_actor_fk',
      columns: [table.workspaceId, table.createdByMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'knowledge_sources_state_check',
      sql`${table.revision} >= 1 AND ${table.state} IN ('draft', 'admitted', 'revoked') AND ${table.language} IN ('ro','ru','en') AND ${table.permittedPurpose} = 'cited-evidence' AND ${table.confidentiality} = 'company-confidential' AND ${table.effectiveUntil} > ${table.effectiveFrom} AND ${table.sourceSha256} ~ '^[a-f0-9]{64}$' AND ${table.projectionSha256} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

export const knowledgePassages = pgTable(
  'knowledge_passages',
  {
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    sourceId: uuid('source_id').notNull(),
    position: integer('position').notNull(),
    locator: text('locator').notNull(),
    text: text('text').notNull(),
    sha256: text('sha256').notNull(),
  },
  (table) => [
    uniqueIndex('knowledge_passages_position_unique').on(
      table.workspaceId,
      table.companyId,
      table.sourceId,
      table.position,
    ),
    uniqueIndex('knowledge_passages_identity_unique').on(
      table.workspaceId,
      table.companyId,
      table.sourceId,
      table.locator,
    ),
    foreignKey({
      name: 'knowledge_passages_source_fk',
      columns: [table.workspaceId, table.companyId, table.sourceId],
      foreignColumns: [
        knowledgeSources.workspaceId,
        knowledgeSources.companyId,
        knowledgeSources.id,
      ],
    }),
    check(
      'knowledge_passages_literal_check',
      sql`${table.position} BETWEEN 1 AND 20 AND length(${table.locator}) BETWEEN 1 AND 120 AND ${table.locator} NOT IN ('.','..') AND length(${table.text}) BETWEEN 1 AND 16384 AND ${table.sha256} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

export const knowledgeSourceEvents = pgTable(
  'knowledge_source_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    sourceId: uuid('source_id').notNull(),
    revision: integer('revision').notNull(),
    action: text('action', {
      enum: ['drafted', 'admitted', 'revoked'],
    }).notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    actorDisplayName: text('actor_display_name').notNull(),
    commandFingerprint: text('command_fingerprint').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    uniqueIndex('knowledge_source_events_revision_unique').on(
      table.workspaceId,
      table.companyId,
      table.sourceId,
      table.revision,
    ),
    foreignKey({
      name: 'knowledge_source_events_source_fk',
      columns: [table.workspaceId, table.companyId, table.sourceId],
      foreignColumns: [
        knowledgeSources.workspaceId,
        knowledgeSources.companyId,
        knowledgeSources.id,
      ],
    }),
    foreignKey({
      name: 'knowledge_source_events_actor_fk',
      columns: [table.workspaceId, table.actorMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'knowledge_source_events_revision_check',
      sql`${table.revision} >= 1 AND ${table.action} IN ('drafted','admitted','revoked') AND ${table.commandFingerprint} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);

export const knowledgeSourceCommands = pgTable(
  'knowledge_source_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    key: text('key').notNull(),
    fingerprint: text('fingerprint').notNull(),
    sourceId: uuid('source_id').notNull(),
    result: jsonb('result').$type<unknown>().notNull(),
  },
  (table) => [
    uniqueIndex('knowledge_source_commands_key_unique').on(
      table.workspaceId,
      table.actorMembershipId,
      table.key,
    ),
    foreignKey({
      name: 'knowledge_source_commands_source_fk',
      columns: [table.workspaceId, table.companyId, table.sourceId],
      foreignColumns: [
        knowledgeSources.workspaceId,
        knowledgeSources.companyId,
        knowledgeSources.id,
      ],
    }),
    foreignKey({
      name: 'knowledge_source_commands_actor_fk',
      columns: [table.workspaceId, table.actorMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
  ],
);

/** Sanitized material read attribution. It stores no question, source body or credential. */
export const knowledgeInteractions = pgTable(
  'knowledge_interactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    capabilityVersion: text('capability_version').notNull(),
    operation: text('operation', {
      enum: ['list', 'search', 'passage'],
    }).notNull(),
    sourceReferences: jsonb('source_references').$type<unknown>().notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    foreignKey({
      name: 'knowledge_interactions_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'knowledge_interactions_actor_fk',
      columns: [table.workspaceId, table.actorMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
  ],
);
