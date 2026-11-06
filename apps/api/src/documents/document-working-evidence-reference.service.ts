import { createHash } from 'node:crypto';
import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  documentPdfs,
  documentVersions,
  workingDocuments,
} from '../database/schema/index.js';
import { DocumentPdfStorage } from './document-pdf-storage.js';
import { MAXIMUM_DOCUMENT_PDF_BYTES } from './document-pdf.types.js';

export interface WorkingEvidenceSourceContext {
  companyId: string;
  originalClientId: string;
}
export interface WorkingEvidenceSourceTuple {
  documentId: string;
  versionId: string;
  representationId: string;
}
export interface WorkingEvidenceSourceBinding extends WorkingEvidenceSourceTuple {
  versionNumber: number;
  sourceTitle: string;
  sourcePurpose: string;
  filename: string;
  mediaType: 'application/pdf';
  sizeBytes: number;
  sha256: string;
}
export interface QualifiedWorkingEvidenceSource extends WorkingEvidenceSourceBinding {
  bytes: Buffer;
}
export interface WorkingEvidenceSourcePosition {
  createdAt: string;
  documentId: string;
  versionNumber: number;
}
type SourceInput = {
  actor: ActorContext;
  context: WorkingEvidenceSourceContext;
} & WorkingEvidenceSourceTuple;

/**
 * Documents owns exact received-source qualification. Every method uses its
 * caller's transaction; Case never receives the private storage adapter.
 */
@Injectable()
export class DocumentWorkingEvidenceReferenceService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly clients: ClientOperationalReferenceService,
    private readonly storage: DocumentPdfStorage,
  ) {}

  /** Current authority only: safe before resolving a conserved command receipt. */
  async requireCurrentAuthority(input: {
    actor: ActorContext;
    context: WorkingEvidenceSourceContext;
    tuples: readonly WorkingEvidenceSourceTuple[];
    lock: boolean;
  }): Promise<void> {
    await this.requireRead(input);
    // Do not acquire Document locks before the caller's Client/Project locks.
    // Native identity is immutable; exact frozen eligibility/bytes belong later.
    for (const tuple of input.tuples) {
      const [document] = await this.database.connection
        .select({ id: workingDocuments.id })
        .from(workingDocuments)
        .where(this.documentScope(input, tuple.documentId));
      if (!document) throw new NotFoundException();
    }
  }

  async qualifyWithinWriteTransaction(
    input: SourceInput,
  ): Promise<QualifiedWorkingEvidenceSource> {
    await this.requireRead({ ...input, lock: true });
    // The caller has already locked original Client identity, relationship,
    // Project lifecycle and Case head, in that order.
    const [document] = await this.database.connection
      .select({ id: workingDocuments.id })
      .from(workingDocuments)
      .where(this.documentScope(input, input.documentId))
      .for('share');
    if (!document) throw new NotFoundException();
    return this.readQualified(input, false);
  }

  async authorizeRecordedWithinReadTransaction(input: {
    actor: ActorContext;
    context: WorkingEvidenceSourceContext;
    tuples: readonly WorkingEvidenceSourceTuple[];
  }): Promise<void> {
    await this.requireCurrentAuthority({ ...input, lock: false });
  }

  async readExactWithinReadTransaction(
    input: SourceInput,
  ): Promise<QualifiedWorkingEvidenceSource> {
    await this.requireCurrentAuthority({
      ...input,
      tuples: [input],
      lock: false,
    });
    return this.readQualified(input, true);
  }

  /** Private ordering metadata is stripped by the Case-owned page publisher. */
  async eligibleWithinReadTransaction(input: {
    actor: ActorContext;
    context: WorkingEvidenceSourceContext;
    after: WorkingEvidenceSourcePosition | null;
    limit: 26;
  }) {
    await this.requireRead({ ...input, lock: false });
    // PostgreSQL keeps sub-millisecond creation time. Resolve the immutable
    // cursor anchor in SQL instead of rounding its position through JS Date.
    const anchorCreatedAt =
      input.after === null
        ? undefined
        : sql`(SELECT cursor_document.created_at FROM working_documents cursor_document WHERE cursor_document.workspace_id=${input.actor.workspaceId} AND cursor_document.company_id=${input.context.companyId} AND cursor_document.client_id=${input.context.originalClientId} AND cursor_document.type='received-audit-source' AND cursor_document.id=${input.after.documentId})`;
    const rows = await this.selection()
      .where(
        and(
          this.documentScope(input),
          this.frozenPdf(),
          input.after === null
            ? undefined
            : or(
                sql`${workingDocuments.createdAt} < ${anchorCreatedAt}`,
                and(
                  sql`${workingDocuments.createdAt} = ${anchorCreatedAt}`,
                  lt(workingDocuments.id, input.after.documentId),
                ),
                and(
                  sql`${workingDocuments.createdAt} = ${anchorCreatedAt}`,
                  eq(workingDocuments.id, input.after.documentId),
                  lt(documentVersions.number, input.after.versionNumber),
                ),
              ),
        ),
      )
      .orderBy(
        desc(workingDocuments.createdAt),
        desc(workingDocuments.id),
        desc(documentVersions.number),
      )
      .limit(input.limit);
    return rows.map((row) => {
      this.requireMetadata(row);
      return {
        documentId: row.documentId,
        versionId: row.versionId,
        versionNumber: row.versionNumber,
        representationId: row.representationId,
        sourceTitle: row.sourceTitle,
        createdAt: row.createdAt.toISOString(),
      };
    });
  }

  private async requireRead(input: {
    actor: ActorContext;
    context: WorkingEvidenceSourceContext;
    lock: boolean;
  }): Promise<void> {
    const companyId =
      await this.authorization.requireReceivedAuditSourceNativeAccess(
        input.actor,
        { action: 'content-read', lockAssignment: input.lock },
      );
    if (companyId !== input.context.companyId) throw new NotFoundException();
    await this.clients.readReferenceClient(
      input.actor,
      input.context.originalClientId,
    );
  }

  private documentScope(
    input: { actor: ActorContext; context: WorkingEvidenceSourceContext },
    documentId?: string,
  ) {
    return and(
      eq(workingDocuments.workspaceId, input.actor.workspaceId),
      eq(workingDocuments.companyId, input.context.companyId),
      eq(workingDocuments.clientId, input.context.originalClientId),
      eq(workingDocuments.type, 'received-audit-source'),
      documentId === undefined
        ? undefined
        : eq(workingDocuments.id, documentId),
    );
  }

  private selection() {
    return this.database.connection
      .select({
        documentId: workingDocuments.id,
        createdAt: workingDocuments.createdAt,
        versionId: documentVersions.id,
        versionNumber: documentVersions.number,
        sourceTitle: documentVersions.frozenTitle,
        sourcePurpose: documentVersions.frozenPurpose,
        representationId: documentPdfs.id,
        filename: documentPdfs.fileName,
        sizeBytes: documentPdfs.size,
        sha256: documentPdfs.sha256,
      })
      .from(workingDocuments)
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
      );
  }

  private frozenPdf() {
    return and(
      inArray(documentVersions.status, ['official', 'superseded']),
      eq(documentPdfs.scanOutcome, 'clean'),
      sql`NOT EXISTS (SELECT 1 FROM document_pdfs later_pdf WHERE later_pdf.workspace_id=${documentPdfs.workspaceId} AND later_pdf.company_id=${documentPdfs.companyId} AND later_pdf.document_id=${documentPdfs.documentId} AND later_pdf.version_id=${documentPdfs.versionId} AND later_pdf.upload_revision>${documentPdfs.uploadRevision})`,
    );
  }

  private requireMetadata(row: {
    sourceTitle: string | null;
    sourcePurpose: string | null;
    versionNumber: number;
    filename: string;
    sizeBytes: number;
    sha256: string;
  }): asserts row is typeof row & {
    sourceTitle: string;
    sourcePurpose: string;
  } {
    if (
      !validText(row.sourceTitle, 200) ||
      !validText(row.sourcePurpose, 2000) ||
      !Number.isInteger(row.versionNumber) ||
      row.versionNumber < 1 ||
      row.versionNumber > 50 ||
      !validText(row.filename, 120) ||
      row.filename.length < 5 ||
      /[\p{Cc}\p{Cf}/\\]/u.test(row.filename) ||
      !/\.pdf$/iu.test(row.filename) ||
      !Number.isInteger(row.sizeBytes) ||
      row.sizeBytes < 1 ||
      row.sizeBytes > MAXIMUM_DOCUMENT_PDF_BYTES ||
      !/^[a-f0-9]{64}$/u.test(row.sha256)
    )
      throw new ServiceUnavailableException(
        'The preserved source is unavailable.',
      );
  }

  private async readQualified(
    input: SourceInput,
    recorded: boolean,
  ): Promise<QualifiedWorkingEvidenceSource> {
    const [row] = await this.selection().where(
      and(
        this.documentScope(input, input.documentId),
        eq(documentVersions.id, input.versionId),
        eq(documentPdfs.id, input.representationId),
        this.frozenPdf(),
      ),
    );
    if (!row) {
      if (recorded)
        throw new ServiceUnavailableException(
          'The preserved source is unavailable.',
        );
      throw new NotFoundException();
    }
    this.requireMetadata(row);
    const stored = await this.storage.read({
      scope: {
        workspaceId: input.actor.workspaceId,
        companyId: input.context.companyId,
        documentId: input.documentId,
      },
      versionId: input.versionId,
      representationId: input.representationId,
    });
    if (
      !stored ||
      !Buffer.isBuffer(stored.bytes) ||
      stored.bytes.length !== row.sizeBytes ||
      stored.size !== row.sizeBytes ||
      stored.sha256 !== row.sha256 ||
      stored.fileName !== row.filename ||
      createHash('sha256').update(stored.bytes).digest('hex') !== row.sha256
    )
      throw new ServiceUnavailableException(
        'The preserved source is unavailable.',
      );
    return {
      documentId: row.documentId,
      versionId: row.versionId,
      versionNumber: row.versionNumber,
      representationId: row.representationId,
      sourceTitle: row.sourceTitle,
      sourcePurpose: row.sourcePurpose,
      filename: row.filename,
      mediaType: 'application/pdf',
      sizeBytes: row.sizeBytes,
      sha256: row.sha256,
      bytes: stored.bytes,
    };
  }
}

function validText(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    value === value.trim() &&
    value.length > 0 &&
    value.length <= maximum &&
    !/[\0\uD800-\uDFFF]/u.test(value)
  );
}
