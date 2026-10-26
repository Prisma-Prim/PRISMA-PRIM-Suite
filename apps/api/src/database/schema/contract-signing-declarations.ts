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
import { workspaceMemberships } from './core.js';
import {
  contractDecisions,
  contractQualityRuns,
  contractVersions,
} from './contract.js';
import { documentPdfs } from './document-pdfs.js';

export const contractSigningDeclarations = pgTable(
  'contract_signing_declarations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    contractId: uuid('contract_id').notNull(),
    contractVersionId: uuid('contract_version_id').notNull(),
    approvalDecisionId: uuid('approval_decision_id').notNull(),
    qualityRunId: uuid('quality_run_id').notNull(),
    representationChecksum: text('representation_checksum').notNull(),
    documentId: uuid('document_id').notNull(),
    documentVersionId: uuid('document_version_id').notNull(),
    representationId: uuid('representation_id').notNull(),
    resultRevision: integer('result_revision').notNull(),
    actorWorkspaceMembershipId: uuid('actor_workspace_membership_id').notNull(),
    actorInternalUserId: uuid('actor_internal_user_id').notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
    statement: jsonb('statement').$type<unknown>().notNull(),
    pdf: jsonb('pdf').$type<unknown>().notNull(),
  },
  (t) => [
    uniqueIndex('contract_signing_declarations_version_unique').on(
      t.workspaceId,
      t.companyId,
      t.contractVersionId,
    ),
    uniqueIndex('contract_signing_declarations_scope_unique').on(
      t.workspaceId,
      t.companyId,
      t.contractId,
      t.id,
    ),
    foreignKey({
      name: 'contract_signing_declarations_version_fk',
      columns: [t.workspaceId, t.companyId, t.contractId, t.contractVersionId],
      foreignColumns: [
        contractVersions.workspaceId,
        contractVersions.companyId,
        contractVersions.contractId,
        contractVersions.id,
      ],
    }),
    foreignKey({
      name: 'contract_signing_declarations_approval_fk',
      columns: [t.workspaceId, t.companyId, t.contractId, t.approvalDecisionId],
      foreignColumns: [
        contractDecisions.workspaceId,
        contractDecisions.companyId,
        contractDecisions.contractId,
        contractDecisions.id,
      ],
    }),
    foreignKey({
      name: 'contract_signing_declarations_quality_fk',
      columns: [t.workspaceId, t.companyId, t.contractId, t.qualityRunId],
      foreignColumns: [
        contractQualityRuns.workspaceId,
        contractQualityRuns.companyId,
        contractQualityRuns.contractId,
        contractQualityRuns.id,
      ],
    }),
    foreignKey({
      name: 'contract_signing_declarations_pdf_fk',
      columns: [
        t.workspaceId,
        t.companyId,
        t.documentId,
        t.documentVersionId,
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
      name: 'contract_signing_declarations_actor_fk',
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
      'contract_signing_declarations_values_check',
      sql`${t.resultRevision}>2 AND ${t.representationChecksum} ~ '^[a-f0-9]{64}$' AND jsonb_typeof(${t.statement})='object' AND jsonb_typeof(${t.pdf})='object'`,
    ),
  ],
);
