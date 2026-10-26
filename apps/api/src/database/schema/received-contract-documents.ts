import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { contractVersions } from './contract.js';
import { workingDocuments } from './documents.js';
import { internalUsers, workspaceMemberships } from './core.js';

/** One immutable declared relation, never a signature or equivalence claim. */
export const receivedContractDocumentRelations = pgTable(
  'received_contract_document_relations',
  {
    documentId: uuid('document_id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    opportunityId: uuid('opportunity_id').notNull(),
    contractId: uuid('contract_id').notNull(),
    contractVersionId: uuid('contract_version_id').notNull(),
    contractVersionNumber: integer('contract_version_number').notNull(),
    illustrativeReference: integer('illustrative_reference').notNull(),
    sourceDescription: text('source_description').notNull(),
    receivedOn: date('received_on', { mode: 'string' }),
    registeredByMembershipId: uuid('registered_by_membership_id').notNull(),
    registeredByInternalUserId: uuid(
      'registered_by_internal_user_id',
    ).notNull(),
    registeredAt: timestamp('registered_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    foreignKey({
      name: 'received_contract_document_scope_fk',
      columns: [t.workspaceId, t.companyId, t.documentId],
      foreignColumns: [
        workingDocuments.workspaceId,
        workingDocuments.companyId,
        workingDocuments.id,
      ],
    }),
    foreignKey({
      name: 'received_contract_version_scope_fk',
      columns: [t.workspaceId, t.companyId, t.contractId, t.contractVersionId],
      foreignColumns: [
        contractVersions.workspaceId,
        contractVersions.companyId,
        contractVersions.contractId,
        contractVersions.id,
      ],
    }),
    foreignKey({
      name: 'received_contract_registrar_scope_fk',
      columns: [
        t.workspaceId,
        t.registeredByMembershipId,
        t.registeredByInternalUserId,
      ],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
        workspaceMemberships.internalUserId,
      ],
    }),
    foreignKey({
      name: 'received_contract_internal_user_fk',
      columns: [t.registeredByInternalUserId],
      foreignColumns: [internalUsers.id],
    }),
    check(
      'received_contract_relation_values_check',
      sql`${t.contractVersionNumber}>0 AND ${t.illustrativeReference}>0 AND length(trim(${t.sourceDescription})) BETWEEN 1 AND 2000 AND ${t.sourceDescription}=trim(${t.sourceDescription})`,
    ),
  ],
);
