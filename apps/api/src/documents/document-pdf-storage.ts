import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { and, asc, desc, eq, lt, sql } from 'drizzle-orm';
import { DatabaseContext } from '../database/database-context.js';
import {
  documentPdfs,
  internalUsers,
  workspaceMemberships,
} from '../database/schema/index.js';
import type { DocumentScope } from './document-versions.service.js';
import type {
  CleanDocumentScan,
  DocumentPdfContent,
  DocumentPdfUploadHistory,
  PreservedDocumentPdf,
  ValidatedDocumentPdf,
} from './document-pdf.types.js';

const HISTORY_PAGE_SIZE = 20;
const metadataColumns = {
  versionId: documentPdfs.versionId,
  id: documentPdfs.id,
  uploadRevision: documentPdfs.uploadRevision,
  fileName: documentPdfs.fileName,
  size: documentPdfs.size,
  sha256: documentPdfs.sha256,
  storedAt: documentPdfs.storedAt,
  scannedAt: documentPdfs.scannedAt,
  scanEngine: documentPdfs.scanEngine,
  displayName: internalUsers.displayName,
};
type PdfMetadataRow = Pick<
  typeof documentPdfs.$inferSelect,
  | 'id'
  | 'versionId'
  | 'uploadRevision'
  | 'fileName'
  | 'size'
  | 'sha256'
  | 'storedAt'
  | 'scannedAt'
  | 'scanEngine'
> & { displayName: string };

/** Private durable byte adapter; callers supply an already-authorized scope. */
@Injectable()
export class DocumentPdfStorage {
  constructor(private readonly database: DatabaseContext) {}

  async insert(input: {
    scope: DocumentScope;
    versionId: string;
    membershipId: string;
    uploadRevision: number;
    pdf: ValidatedDocumentPdf;
    scan: CleanDocumentScan;
  }): Promise<string> {
    const [stored] = await this.database.connection
      .insert(documentPdfs)
      .values({
        ...input.scope,
        versionId: input.versionId,
        uploadRevision: input.uploadRevision,
        content: input.pdf.bytes,
        fileName: input.pdf.fileName,
        size: input.pdf.size,
        sha256: input.pdf.sha256,
        scanOutcome: input.scan.outcome,
        scanEngine: input.scan.engine,
        scannedAt: input.scan.scannedAt,
        storedByMembershipId: input.membershipId,
      })
      .returning({ id: documentPdfs.id });
    if (!stored) throw new Error('The PDF was not stored.');
    return stored.id;
  }

  /** Exact scoped presence for the mission official-designation integrity gate. */
  async hasStoredContent(
    scope: DocumentScope,
    versionId: string,
  ): Promise<boolean> {
    const [stored] = await this.database.connection
      .select({ id: documentPdfs.id })
      .from(documentPdfs)
      .where(
        and(
          eq(documentPdfs.workspaceId, scope.workspaceId),
          eq(documentPdfs.companyId, scope.companyId),
          eq(documentPdfs.documentId, scope.documentId),
          eq(documentPdfs.versionId, versionId),
        ),
      )
      .limit(1);
    return stored !== undefined;
  }

  /** At most one current row per Version, never its unbounded upload history. */
  async metadata(
    scope: DocumentScope,
    canReadContent: boolean,
  ): Promise<ReadonlyMap<string, DocumentPdfContent>> {
    const rows = await this.database.connection
      .selectDistinctOn([documentPdfs.versionId], metadataColumns)
      .from(documentPdfs)
      .innerJoin(
        workspaceMemberships,
        and(
          eq(workspaceMemberships.workspaceId, documentPdfs.workspaceId),
          eq(workspaceMemberships.id, documentPdfs.storedByMembershipId),
        ),
      )
      .innerJoin(
        internalUsers,
        eq(internalUsers.id, workspaceMemberships.internalUserId),
      )
      .where(
        and(
          eq(documentPdfs.workspaceId, scope.workspaceId),
          eq(documentPdfs.companyId, scope.companyId),
          eq(documentPdfs.documentId, scope.documentId),
        ),
      )
      .orderBy(asc(documentPdfs.versionId), desc(documentPdfs.uploadRevision));
    return new Map<string, DocumentPdfContent>(
      rows.map((row) => [
        row.versionId,
        canReadContent
          ? { ...metadata(row), state: 'stored', access: 'granted' }
          : { state: 'stored', access: 'denied' },
      ]),
    );
  }

  async history(input: {
    scope: DocumentScope;
    versionId: string;
    beforeRevision: number | undefined;
  }): Promise<DocumentPdfUploadHistory> {
    const { scope, versionId, beforeRevision } = input;
    const rows = await this.database.connection
      .select({
        ...metadataColumns,
        // The current marker and this bounded page share a single SQL snapshot.
        current: sql<boolean>`${documentPdfs.uploadRevision} = (SELECT max(current_pdf.upload_revision) FROM document_pdfs current_pdf WHERE current_pdf.workspace_id = ${scope.workspaceId} AND current_pdf.company_id = ${scope.companyId} AND current_pdf.document_id = ${scope.documentId} AND current_pdf.version_id = ${versionId})`,
      })
      .from(documentPdfs)
      .innerJoin(
        workspaceMemberships,
        and(
          eq(workspaceMemberships.workspaceId, documentPdfs.workspaceId),
          eq(workspaceMemberships.id, documentPdfs.storedByMembershipId),
        ),
      )
      .innerJoin(
        internalUsers,
        eq(internalUsers.id, workspaceMemberships.internalUserId),
      )
      .where(
        and(
          eq(documentPdfs.workspaceId, scope.workspaceId),
          eq(documentPdfs.companyId, scope.companyId),
          eq(documentPdfs.documentId, scope.documentId),
          eq(documentPdfs.versionId, versionId),
          beforeRevision === undefined
            ? undefined
            : lt(documentPdfs.uploadRevision, beforeRevision),
        ),
      )
      .orderBy(desc(documentPdfs.uploadRevision))
      .limit(HISTORY_PAGE_SIZE + 1);
    const uploads = rows
      .slice(0, HISTORY_PAGE_SIZE)
      .map((row) => ({ ...metadata(row), current: row.current }));
    const last = uploads.at(-1);
    return {
      uploads,
      nextBeforeRevision:
        rows.length > HISTORY_PAGE_SIZE && last ? last.revision : null,
    };
  }

  async read(input: {
    scope: DocumentScope;
    versionId: string;
    representationId?: string;
  }) {
    const { scope, versionId, representationId } = input;
    try {
      const [stored] = await this.database.connection
        .select({
          bytes: documentPdfs.content,
          fileName: documentPdfs.fileName,
          sha256: documentPdfs.sha256,
          size: documentPdfs.size,
        })
        .from(documentPdfs)
        .where(
          and(
            eq(documentPdfs.workspaceId, scope.workspaceId),
            eq(documentPdfs.companyId, scope.companyId),
            eq(documentPdfs.documentId, scope.documentId),
            eq(documentPdfs.versionId, versionId),
            representationId === undefined
              ? undefined
              : eq(documentPdfs.id, representationId),
          ),
        )
        .orderBy(desc(documentPdfs.uploadRevision))
        .limit(1);
      return stored;
    } catch {
      throw new ServiceUnavailableException(
        'The preserved Document PDF is unavailable.',
      );
    }
  }
}
function metadata(row: PdfMetadataRow): PreservedDocumentPdf {
  return {
    representationId: row.id,
    revision: row.uploadRevision,
    fileName: row.fileName,
    mediaType: 'application/pdf',
    size: row.size,
    sha256: row.sha256,
    storedAt: row.storedAt.toISOString(),
    storedBy: { displayName: row.displayName },
    scan: {
      outcome: 'clean',
      engine: row.scanEngine,
      scannedAt: row.scannedAt.toISOString(),
    },
  };
}
