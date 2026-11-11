import { and, eq, sql } from 'drizzle-orm';
import type { PgSelect } from 'drizzle-orm/pg-core';
import {
  documentPdfs,
  documentVersions,
  workingDocuments,
} from '../database/schema/index.js';
import { MAXIMUM_DOCUMENT_PDF_BYTES } from './document-pdf.types.js';

/** Documents owns the scoped Version/PDF join; each consumer owns its filters and locks. */
export function documentVersionPdfQuery<Query extends PgSelect>(query: Query) {
  return query
    .innerJoin(
      documentVersions,
      and(
        eq(documentVersions.workspaceId, workingDocuments.workspaceId),
        eq(documentVersions.companyId, workingDocuments.companyId),
        eq(documentVersions.documentId, workingDocuments.id),
      ),
    )
    .innerJoin(
      documentPdfs,
      and(
        eq(documentPdfs.workspaceId, documentVersions.workspaceId),
        eq(documentPdfs.companyId, documentVersions.companyId),
        eq(documentPdfs.documentId, documentVersions.documentId),
        eq(documentPdfs.versionId, documentVersions.id),
      ),
    )
    .$dynamic();
}

/**
 * The same native predicate guards selectors and persisted new-use commands.
 * Exact Working Evidence reads may defer integrity to their mandatory bounded
 * storage/hash check, preserving the known-content outage response.
 */
export function frozenDocumentPdfPredicate(
  options: { integrity?: 'sql' | 'storage' } = {},
) {
  return sql<boolean>`documents_frozen_pdf(${documentVersions}, ${documentPdfs}, ${MAXIMUM_DOCUMENT_PDF_BYTES}, ${options.integrity !== 'storage'})`;
}
