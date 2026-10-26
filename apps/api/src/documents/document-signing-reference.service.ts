import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, gt, inArray } from 'drizzle-orm';
import type { ActorContext } from '../access/access.types.js';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import { ClientOperationalReferenceService } from '../client/client-operational-reference.service.js';
import { DatabaseContext } from '../database/database-context.js';
import {
  documentPdfs,
  documentVersions,
  receivedContractDocumentRelations,
  workingDocuments,
} from '../database/schema/index.js';
import { requireDocumentPermission } from './document-read-boundary.js';
import { requireUuid } from '../access/access-command-validation.js';
import {
  exactRecord,
  modelInteger,
  text,
} from '../contract-model/contract-model.content.js';

export interface SigningDocumentContext {
  companyId: string;
  originalClientAccountId: string;
  contractId: string;
  contractVersionId: string;
}
export type SigningPdfReference = Awaited<
  ReturnType<DocumentSigningReferenceService['exactWithinTransaction']>
>;

/** Document-owned metadata only. Every method joins its caller's transaction. */
@Injectable()
export class DocumentSigningReferenceService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly clients: ClientOperationalReferenceService,
  ) {}

  async requireReadWithinTransaction(
    actor: ActorContext,
    context: SigningDocumentContext,
    lock = false,
  ) {
    if (requireDocumentPermission(actor, 'document.read') !== context.companyId)
      throw new NotFoundException();
    await this.authorization.requireDocumentAccess(actor, lock);
    await this.clients.requireReferenceReadAuthority(actor, lock);
    await this.clients.readReferenceClient(
      actor,
      context.originalClientAccountId,
    );
    if (
      !(await this.authorization.hasReceivedContractAccess(actor, {
        lockAssignment: lock,
      })) ||
      !(await this.authorization.hasDocumentContentRead(actor))
    )
      throw new ForbiddenException();
    if (lock) await this.authorization.requireDocumentContentRead(actor);
  }

  async eligibleWithinTransaction(input: {
    actor: ActorContext;
    context: SigningDocumentContext;
    cursor: string | undefined;
  }) {
    await this.requireReadWithinTransaction(input.actor, input.context, true);
    let after: string | undefined;
    if (input.cursor !== undefined) {
      try {
        const decoded: unknown = JSON.parse(
          Buffer.from(input.cursor, 'base64url').toString('utf8'),
        );
        if (
          !Array.isArray(decoded) ||
          decoded.length !== 5 ||
          decoded[0] !== input.actor.workspaceId ||
          decoded[1] !== input.context.companyId ||
          decoded[2] !== input.context.contractId ||
          decoded[3] !== input.context.contractVersionId ||
          typeof decoded[4] !== 'string' ||
          !/^[a-f0-9-]{36}$/u.test(decoded[4])
        )
          throw new Error();
        after = requireUuid(decoded[4]);
        if (
          !(
            await this.selection()
              .where(
                and(
                  this.scope(input.actor, input.context),
                  eq(documentPdfs.id, after),
                ),
              )
              .limit(1)
          ).length
        )
          throw new Error();
      } catch {
        throw new BadRequestException({ field: 'cursor' });
      }
    }
    const rows = await this.selection()
      .where(
        and(
          this.scope(input.actor, input.context),
          after ? gt(documentPdfs.id, after) : undefined,
        ),
      )
      .orderBy(asc(documentPdfs.id))
      .limit(21);
    const items = rows.slice(0, 20).map(pdfReference);
    const last = items.at(-1);
    return {
      items,
      nextCursor:
        rows.length > 20 && last
          ? Buffer.from(
              JSON.stringify([
                input.actor.workspaceId,
                input.context.companyId,
                input.context.contractId,
                input.context.contractVersionId,
                last.representationId,
              ]),
            ).toString('base64url')
          : null,
    };
  }

  async exactWithinTransaction(input: {
    actor: ActorContext;
    context: SigningDocumentContext;
    documentId: string;
    documentVersionId: string;
    representationId: string;
    lock: boolean;
  }) {
    await this.requireReadWithinTransaction(
      input.actor,
      input.context,
      input.lock,
    );
    const query = this.selection().where(
      and(
        this.scope(input.actor, input.context),
        eq(workingDocuments.id, input.documentId),
        eq(documentVersions.id, input.documentVersionId),
        eq(documentPdfs.id, input.representationId),
      ),
    );
    const [row] = input.lock
      ? await query.for('share', { of: [workingDocuments, documentVersions] })
      : await query;
    if (!row) throw new NotFoundException();
    return pdfReference(row);
  }

  private scope(actor: ActorContext, context: SigningDocumentContext) {
    return and(
      eq(workingDocuments.workspaceId, actor.workspaceId),
      eq(workingDocuments.companyId, context.companyId),
      eq(workingDocuments.clientId, context.originalClientAccountId),
      eq(workingDocuments.type, 'received-contract'),
      eq(receivedContractDocumentRelations.contractId, context.contractId),
      eq(
        receivedContractDocumentRelations.contractVersionId,
        context.contractVersionId,
      ),
      inArray(documentVersions.status, ['official', 'superseded']),
      eq(documentPdfs.scanOutcome, 'clean'),
    );
  }
  private selection() {
    return this.database.connection
      .select({
        documentId: workingDocuments.id,
        documentVersionId: documentVersions.id,
        documentVersionNumber: documentVersions.number,
        title: documentVersions.frozenTitle,
        status: documentVersions.status,
        representationId: documentPdfs.id,
        fileName: documentPdfs.fileName,
        mediaType: documentPdfs.mediaType,
        size: documentPdfs.size,
        sha256: documentPdfs.sha256,
        scanOutcome: documentPdfs.scanOutcome,
        scanEngine: documentPdfs.scanEngine,
        scannedAt: documentPdfs.scannedAt,
        storedByMembershipId: documentPdfs.storedByMembershipId,
        storedAt: documentPdfs.storedAt,
      })
      .from(workingDocuments)
      .innerJoin(
        receivedContractDocumentRelations,
        and(
          eq(
            receivedContractDocumentRelations.workspaceId,
            workingDocuments.workspaceId,
          ),
          eq(
            receivedContractDocumentRelations.companyId,
            workingDocuments.companyId,
          ),
          eq(receivedContractDocumentRelations.documentId, workingDocuments.id),
        ),
      )
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
}

/** Conserved references are decoded even when their protected projection is denied. */
export function readConservedSigningPdf(value: unknown) {
  const row = exactRecord(value, [
    'documentId',
    'documentVersionId',
    'documentVersionNumber',
    'title',
    'status',
    'representationId',
    'fileName',
    'mediaType',
    'size',
    'sha256',
    'scanOutcome',
    'scanEngine',
    'scannedAt',
    'storedByMembershipId',
    'storedAt',
  ]);
  if (
    (row.status !== 'official' && row.status !== 'superseded') ||
    row.mediaType !== 'application/pdf' ||
    row.scanOutcome !== 'clean' ||
    typeof row.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(row.sha256)
  )
    throw new Error('Invalid conserved signing PDF.');
  const size = modelInteger(row.size, 1);
  if (size > 5242880) throw new Error('Invalid conserved signing PDF size.');
  const instant = (value: unknown): string => {
    if (
      typeof value !== 'string' ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString() !== value
    )
      throw new Error('Invalid conserved PDF instant.');
    return value;
  };
  return {
    documentId: requireUuid(row.documentId),
    documentVersionId: requireUuid(row.documentVersionId),
    documentVersionNumber: modelInteger(row.documentVersionNumber, 1),
    title: text(row.title, 200),
    status:
      row.status === 'official'
        ? ('official' as const)
        : ('superseded' as const),
    representationId: requireUuid(row.representationId),
    fileName: text(row.fileName, 120),
    mediaType: 'application/pdf' as const,
    size,
    sha256: row.sha256,
    scanOutcome: 'clean' as const,
    scanEngine: text(row.scanEngine, 200),
    scannedAt: instant(row.scannedAt),
    storedByMembershipId: requireUuid(row.storedByMembershipId),
    storedAt: instant(row.storedAt),
  };
}
function pdfReference(row: {
  documentId: string;
  documentVersionId: string;
  documentVersionNumber: number;
  title: string | null;
  status: string;
  representationId: string;
  fileName: string;
  mediaType: string;
  size: number;
  sha256: string;
  scanOutcome: string;
  scanEngine: string;
  scannedAt: Date;
  storedByMembershipId: string;
  storedAt: Date;
}) {
  if (
    row.title === null ||
    (row.status !== 'official' && row.status !== 'superseded') ||
    row.mediaType !== 'application/pdf' ||
    row.scanOutcome !== 'clean'
  )
    throw new Error('Invalid received PDF reference.');
  return {
    ...row,
    title: row.title,
    status: row.status,
    mediaType: 'application/pdf' as const,
    scanOutcome: 'clean' as const,
    scannedAt: row.scannedAt.toISOString(),
    storedAt: row.storedAt.toISOString(),
  };
}
