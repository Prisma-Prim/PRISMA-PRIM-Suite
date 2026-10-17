import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  foreignKey,
  integer,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { workspaceMemberships } from './core.js';
import { documentVersions } from './documents.js';

const bytes = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});
/** Private PostgreSQL storage adapter. No location becomes business identity. */
export const documentPdfs = pgTable(
  'document_pdfs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    workspaceId: uuid('workspace_id').notNull(),
    companyId: uuid('company_id').notNull(),
    documentId: uuid('document_id').notNull(),
    versionId: uuid('version_id').notNull(),
    uploadRevision: integer('upload_revision').notNull(),
    content: bytes('content').notNull(),
    fileName: text('file_name').notNull(),
    mediaType: text('media_type').notNull().default('application/pdf'),
    size: integer('size').notNull(),
    sha256: text('sha256').notNull(),
    scanOutcome: text('scan_outcome').notNull().default('clean'),
    scanEngine: text('scan_engine').notNull(),
    scannedAt: timestamp('scanned_at', { withTimezone: true }).notNull(),
    storedByMembershipId: uuid('stored_by_membership_id').notNull(),
    storedAt: timestamp('stored_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('document_pdfs_revision_unique').on(
      table.workspaceId,
      table.companyId,
      table.documentId,
      table.uploadRevision,
    ),
    index('document_pdfs_version_order').on(
      table.workspaceId,
      table.companyId,
      table.versionId,
      table.uploadRevision.desc(),
    ),
    foreignKey({
      name: 'document_pdfs_version_fk',
      columns: [
        table.workspaceId,
        table.companyId,
        table.documentId,
        table.versionId,
      ],
      foreignColumns: [
        documentVersions.workspaceId,
        documentVersions.companyId,
        documentVersions.documentId,
        documentVersions.id,
      ],
    }),
    foreignKey({
      name: 'document_pdfs_actor_fk',
      columns: [table.workspaceId, table.storedByMembershipId],
      foreignColumns: [
        workspaceMemberships.workspaceId,
        workspaceMemberships.id,
      ],
    }),
    check(
      'document_pdfs_content_check',
      sql`${table.uploadRevision} >= 2 AND ${table.size} BETWEEN 1 AND 5242880 AND octet_length(${table.content}) = ${table.size} AND ${table.sha256} ~ '^[a-f0-9]{64}$' AND ${table.mediaType} = 'application/pdf' AND ${table.scanOutcome} = 'clean' AND length(${table.scanEngine}) BETWEEN 1 AND 200 AND length(${table.fileName}) BETWEEN 1 AND 120`,
    ),
  ],
);
