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
import { workspaceMemberships } from './core.js';

/** Immutable native source relation; no invoice values or fiscal interpretation. */
export const externalInvoiceDocumentRelations = pgTable(
  'external_invoice_document_relations',
  {
    documentId: uuid('document_id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    opportunityId: uuid('opportunity_id').notNull(),
    contractId: uuid('contract_id').notNull(),
    contractVersionId: uuid('contract_version_id').notNull(),
    contractVersionNumber: integer('contract_version_number').notNull(),
    illustrativeReference: integer('illustrative_reference').notNull(),
    recipientKind: text('recipient_kind', {
      enum: ['PRIMARY', 'ADDITIONAL'],
    }).notNull(),
    recipientAdditionalLegalEntityId: uuid(
      'recipient_additional_legal_entity_id',
    ),
    recipientLegalName: text('recipient_legal_name').notNull(),
    recipientTaxId: text('recipient_tax_id'),
    recipientLegalAddress: text('recipient_legal_address'),
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
      name: 'external_invoice_document_scope_fk',
      columns: [t.workspaceId, t.companyId, t.documentId],
      foreignColumns: [
        workingDocuments.workspaceId,
        workingDocuments.companyId,
        workingDocuments.id,
      ],
    }),
    foreignKey({
      name: 'external_invoice_contract_version_scope_fk',
      columns: [t.workspaceId, t.companyId, t.contractId, t.contractVersionId],
      foreignColumns: [
        contractVersions.workspaceId,
        contractVersions.companyId,
        contractVersions.contractId,
        contractVersions.id,
      ],
    }),
    foreignKey({
      name: 'external_invoice_registrar_scope_fk',
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
    check(
      'external_invoice_relation_values_check',
      sql`${t.contractVersionNumber}>0 AND ${t.illustrativeReference}>0 AND length(trim(${t.sourceDescription})) BETWEEN 1 AND 2000 AND ${t.sourceDescription}=trim(${t.sourceDescription}) AND ((${t.recipientKind}='PRIMARY' AND ${t.recipientAdditionalLegalEntityId} IS NULL) OR (${t.recipientKind}='ADDITIONAL' AND ${t.recipientAdditionalLegalEntityId} IS NOT NULL))`,
    ),
  ],
);
