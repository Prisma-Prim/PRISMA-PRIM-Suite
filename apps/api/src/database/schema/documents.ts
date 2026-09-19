import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { projects } from './project.js';
import { clientAccounts, companies, workspaceMemberships } from './core.js';
export const workingDocuments = pgTable(
  'working_documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    clientId: uuid('client_id').notNull(),
    projectId: uuid('project_id'),
    projectRevision: integer('project_revision').notNull().default(0),
    workingRevision: integer('working_revision').notNull().default(1),
    title: text('title').notNull(),
    purpose: text('purpose').notNull(),
    type: text('type').notNull().default('questionnaire'),
    confidentiality: text('confidentiality')
      .notNull()
      .default('company-confidential'),
    createdByMembershipId: uuid('created_by_membership_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
  },
  (table) => [
    check(
      'working_documents_project_revision_check',
      sql`${table.projectRevision} >= 0`,
    ),
    check(
      'working_documents_working_revision_check',
      sql`${table.workingRevision} >= 1`,
    ),
    foreignKey({
      name: 'working_documents_project_fk',
      columns: [table.workspaceId, table.companyId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.companyId, projects.id],
    }),
    uniqueIndex('working_documents_scope_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
    ),
    uniqueIndex('working_documents_command_unique').on(
      table.workspaceId,
      table.createdByMembershipId,
      table.idempotencyKey,
    ),
    foreignKey({
      name: 'working_documents_company_fk',
      columns: [table.workspaceId, table.companyId],
      foreignColumns: [companies.workspaceId, companies.id],
    }),
    foreignKey({
      name: 'working_documents_client_fk',
      columns: [table.workspaceId, table.clientId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    foreignKey({
      name: 'working_documents_creator_fk',
      columns: [table.workspaceId, table.createdByMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'working_documents_state_check',
      sql`${table.type} = 'questionnaire' AND ${table.confidentiality} = 'company-confidential' AND length(trim(${table.title})) BETWEEN 1 AND 200 AND length(trim(${table.purpose})) BETWEEN 1 AND 2000`,
    ),
  ],
);
export const documentVersions = pgTable(
  'document_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    documentId: uuid('document_id').notNull(),
    status: text('status').notNull().default('draft'),
  },
  (table) => [
    uniqueIndex('document_versions_document_unique').on(
      table.workspaceId,
      table.companyId,
      table.documentId,
    ),
    uniqueIndex('document_versions_scope_unique').on(
      table.workspaceId,
      table.companyId,
      table.id,
    ),
    foreignKey({
      name: 'document_versions_document_fk',
      columns: [table.workspaceId, table.companyId, table.documentId],
      foreignColumns: [
        workingDocuments.workspaceId,
        workingDocuments.companyId,
        workingDocuments.id,
      ],
    }),
    check('document_versions_draft_check', sql`${table.status} = 'draft'`),
  ],
);
export const documentRepresentations = pgTable(
  'document_representations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    versionId: uuid('version_id').notNull(),
    url: text('url').notNull(),
    kind: text('kind').notNull().default('external-reference'),
    verification: text('verification').notNull().default('unverified'),
  },
  (table) => [
    uniqueIndex('document_representations_version_unique').on(
      table.workspaceId,
      table.companyId,
      table.versionId,
    ),
    foreignKey({
      name: 'document_representations_version_fk',
      columns: [table.workspaceId, table.companyId, table.versionId],
      foreignColumns: [
        documentVersions.workspaceId,
        documentVersions.companyId,
        documentVersions.id,
      ],
    }),
    check(
      'document_representations_state_check',
      sql`${table.kind} = 'external-reference' AND ${table.verification} = 'unverified' AND ${table.url} LIKE 'https://%'`,
    ),
  ],
);
export const documentRegistrationEvents = pgTable(
  'document_registration_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    documentId: uuid('document_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('document_registration_events_document_unique').on(
      table.workspaceId,
      table.companyId,
      table.documentId,
    ),
    foreignKey({
      name: 'document_registration_events_document_fk',
      columns: [table.workspaceId, table.companyId, table.documentId],
      foreignColumns: [
        workingDocuments.workspaceId,
        workingDocuments.companyId,
        workingDocuments.id,
      ],
    }),
    foreignKey({
      name: 'document_registration_events_actor_fk',
      columns: [table.workspaceId, table.actorMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
  ],
);

export const documentCorrectionCommands = pgTable(
  'document_correction_commands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    documentId: uuid('document_id').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    requestFingerprint: text('request_fingerprint').notNull(),
    expectedRevision: integer('expected_revision').notNull(),
    revision: integer('revision').notNull(),
    outcome: text('outcome', { enum: ['corrected', 'unchanged'] }).notNull(),
    beforeTitle: text('before_title').notNull(),
    beforePurpose: text('before_purpose').notNull(),
    beforeUrl: text('before_url').notNull(),
    afterTitle: text('after_title').notNull(),
    afterPurpose: text('after_purpose').notNull(),
    afterUrl: text('after_url').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('document_correction_commands_actor_key_unique').on(
      table.workspaceId,
      table.actorMembershipId,
      table.idempotencyKey,
    ),
    uniqueIndex('document_correction_commands_revision_unique')
      .on(table.workspaceId, table.companyId, table.documentId, table.revision)
      .where(sql`${table.outcome} = 'corrected'`),
    foreignKey({
      name: 'document_correction_commands_document_fk',
      columns: [table.workspaceId, table.companyId, table.documentId],
      foreignColumns: [
        workingDocuments.workspaceId,
        workingDocuments.companyId,
        workingDocuments.id,
      ],
    }),
    foreignKey({
      name: 'document_correction_commands_actor_fk',
      columns: [table.workspaceId, table.actorMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'document_correction_commands_state_check',
      sql`${table.expectedRevision} >= 1 AND ((${table.outcome} = 'corrected' AND ${table.revision} = ${table.expectedRevision} + 1) OR (${table.outcome} = 'unchanged' AND ${table.revision} = ${table.expectedRevision}))`,
    ),
  ],
);

// Each committed command is the append-only relationship event and its receipt.
export const documentProjectEvents = pgTable(
  'document_project_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    documentId: uuid('document_id').notNull(),
    projectId: uuid('project_id').notNull(),
    action: text('action', { enum: ['link', 'unlink'] }).notNull(),
    expectedRevision: integer('expected_revision').notNull(),
    revision: integer('revision').notNull(),
    actorMembershipId: uuid('actor_membership_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('document_project_events_actor_key_unique').on(
      table.workspaceId,
      table.actorMembershipId,
      table.idempotencyKey,
    ),
    uniqueIndex('document_project_events_revision_unique').on(
      table.workspaceId,
      table.companyId,
      table.documentId,
      table.revision,
    ),
    check(
      'document_project_events_state_check',
      sql`${table.action} IN ('link', 'unlink') AND ${table.expectedRevision} >= 0 AND ${table.revision} = ${table.expectedRevision} + 1`,
    ),
    foreignKey({
      name: 'document_project_events_document_fk',
      columns: [table.workspaceId, table.companyId, table.documentId],
      foreignColumns: [
        workingDocuments.workspaceId,
        workingDocuments.companyId,
        workingDocuments.id,
      ],
    }),
    foreignKey({
      name: 'document_project_events_project_fk',
      columns: [table.workspaceId, table.companyId, table.projectId],
      foreignColumns: [projects.workspaceId, projects.companyId, projects.id],
    }),
    foreignKey({
      name: 'document_project_events_actor_fk',
      columns: [table.workspaceId, table.actorMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
  ],
);
