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
import { clientAccounts, workspaceMemberships } from './core.js';
import { workingDocuments } from './documents.js';

/** Original immutable source identity, independent of every later live party correction. */
export const paymentEvidenceDocumentSources = pgTable(
  'payment_evidence_document_sources',
  {
    documentId: uuid('document_id').primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    originalClientAccountId: uuid('original_client_account_id').notNull(),
    originalClientVersion: integer('original_client_version').notNull(),
    payerKind: text('payer_kind', {
      enum: ['PRIMARY', 'ADDITIONAL'],
    }).notNull(),
    payerLegalEntityId: uuid('payer_legal_entity_id'),
    payerLegalName: text('payer_legal_name').notNull(),
    payerTaxId: text('payer_tax_id'),
    payerLegalAddress: text('payer_legal_address'),
    receivingCompanyLabel: text('receiving_company_label').notNull(),
    sourceDescription: text('source_description').notNull(),
    receivedOn: date('received_on', { mode: 'string' }),
    initialTitle: text('initial_title').notNull(),
    initialPurpose: text('initial_purpose').notNull(),
    registeredByMembershipId: uuid('registered_by_membership_id').notNull(),
    registeredByInternalUserId: uuid(
      'registered_by_internal_user_id',
    ).notNull(),
    registeredAt: timestamp('registered_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    foreignKey({
      name: 'payment_evidence_document_scope_fk',
      columns: [t.workspaceId, t.companyId, t.documentId],
      foreignColumns: [
        workingDocuments.workspaceId,
        workingDocuments.companyId,
        workingDocuments.id,
      ],
    }),
    foreignKey({
      name: 'payment_evidence_original_client_fk',
      columns: [t.workspaceId, t.originalClientAccountId],
      foreignColumns: [clientAccounts.workspaceId, clientAccounts.id],
    }),
    foreignKey({
      name: 'payment_evidence_registrar_scope_fk',
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
      'payment_evidence_source_values_check',
      sql`${t.originalClientVersion} BETWEEN 1 AND 2147483646 AND length(trim(${t.sourceDescription})) BETWEEN 1 AND 2000 AND ${t.sourceDescription}=trim(${t.sourceDescription}) AND length(trim(${t.initialTitle})) BETWEEN 1 AND 200 AND length(trim(${t.initialPurpose})) BETWEEN 1 AND 2000 AND ((${t.payerKind}='PRIMARY' AND ${t.payerLegalEntityId} IS NULL) OR (${t.payerKind}='ADDITIONAL' AND ${t.payerLegalEntityId} IS NOT NULL))`,
    ),
  ],
);
