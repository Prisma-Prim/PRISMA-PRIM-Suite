import { and, eq } from 'drizzle-orm';
import { documentVersions } from '../database/schema/index.js';
import type { DocumentPdfUploadHistory } from './document-pdf.types.js';
import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CompanyContextAuthorization } from '../access/company-context-authorization.js';
import {
  requireIdempotencyKey,
  requireUuid,
} from '../access/access-command-validation.js';
import type { ActorContext } from '../access/access.types.js';
import { DatabaseContext } from '../database/database-context.js';
import { DocumentReadBoundary } from './document-read-boundary.js';
import { DocumentPdfStorage } from './document-pdf-storage.js';
import { DocumentVersionsService } from './document-versions.service.js';
import {
  MAXIMUM_DOCUMENT_PDF_BYTES,
  type ValidatedDocumentPdf,
} from './document-pdf.types.js';

/** The authenticated bounded-stream upload and exact-Version download seam. */
@Injectable()
export class DocumentContentService {
  constructor(
    private readonly database: DatabaseContext,
    private readonly authorization: CompanyContextAuthorization,
    private readonly boundary: DocumentReadBoundary,
    private readonly storage: DocumentPdfStorage,
    private readonly versions: DocumentVersionsService,
  ) {}

  async upload(
    actor: ActorContext,
    input: {
      documentId: unknown;
      versionId: unknown;
      query: unknown;
      key: string | undefined;
      request: IncomingMessage;
    },
  ) {
    const documentId = requireUuid(input.documentId);
    const versionId = requireUuid(input.versionId);
    const idempotencyKey = requireIdempotencyKey(input.key);
    const { expectedRevision, fileName } = uploadQuery(input.query);
    // Check current authority before allocating or consuming confidential bytes.
    await this.database.transaction(async () => {
      await this.authorization.requireDocumentContentUpload(actor);
      await this.boundary.lockFamilyForCommand(actor, documentId);
    });
    if (input.request.headers['content-type'] !== 'application/pdf')
      throw invalidPdf();
    const length = input.request.headers['content-length'];
    if (
      length !== undefined &&
      (!/^\d+$/u.test(length) || Number(length) > MAXIMUM_DOCUMENT_PDF_BYTES)
    )
      throw new PayloadTooLargeException('The Document PDF exceeds 5 MiB.');
    const pdf = await readPdf(input.request, fileName);
    return this.versions.uploadContent(actor, {
      documentId,
      versionId,
      expectedRevision,
      idempotencyKey,
      pdf,
    });
  }

  async history(
    actor: ActorContext,
    input: { documentId: unknown; versionId: unknown; query: unknown },
  ): Promise<DocumentPdfUploadHistory> {
    const documentId = requireUuid(input.documentId);
    const versionId = requireUuid(input.versionId);
    const beforeRevision = historyQuery(input.query);
    return this.database.transaction(async () => {
      const companyId =
        await this.authorization.requireDocumentContentRead(actor);
      await this.boundary.requireVisible(actor, documentId);
      const [version] = await this.database.connection
        .select({ id: documentVersions.id })
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.workspaceId, actor.workspaceId),
            eq(documentVersions.companyId, companyId),
            eq(documentVersions.documentId, documentId),
            eq(documentVersions.id, versionId),
          ),
        );
      if (!version) throw new NotFoundException();
      return this.storage.history({
        scope: { workspaceId: actor.workspaceId, companyId, documentId },
        versionId,
        beforeRevision,
      });
    });
  }

  async download(
    actor: ActorContext,
    input: {
      documentId: unknown;
      versionId: unknown;
      representationId?: unknown;
    },
  ) {
    const documentId = requireUuid(input.documentId);
    const versionId = requireUuid(input.versionId);
    const representationId =
      input.representationId === undefined
        ? undefined
        : requireUuid(input.representationId);
    return this.database.transaction(async () => {
      const companyId =
        await this.authorization.requireDocumentContentRead(actor);
      await this.boundary.requireVisible(actor, documentId);
      const stored = await this.storage.read({
        scope: { workspaceId: actor.workspaceId, companyId, documentId },
        versionId,
        ...(representationId === undefined ? {} : { representationId }),
      });
      if (!stored) throw new NotFoundException();
      // A damaged adapter response is unavailable, never silently different bytes.
      if (
        !Buffer.isBuffer(stored.bytes) ||
        stored.bytes.length !== stored.size ||
        createHash('sha256').update(stored.bytes).digest('hex') !==
          stored.sha256
      )
        throw new ServiceUnavailableException(
          'The preserved Document PDF is unavailable.',
        );
      return stored;
    });
  }
}

function uploadQuery(value: unknown): {
  expectedRevision: number;
  fileName: string;
} {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw invalidPdf();
  const query = Object.fromEntries(Object.entries(value));
  if (
    Object.keys(query).some(
      (key) => key !== 'expectedRevision' && key !== 'fileName',
    ) ||
    typeof query.expectedRevision !== 'string' ||
    !/^[1-9]\d{0,9}$/u.test(query.expectedRevision)
  )
    throw invalidPdf();
  const expectedRevision = Number(query.expectedRevision);
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision > 2147483646)
    throw invalidPdf();
  const fileName = query.fileName;
  if (
    typeof fileName !== 'string' ||
    fileName !== fileName.trim() ||
    fileName.length < 5 ||
    fileName.length > 120 ||
    !/\.pdf$/iu.test(fileName) ||
    /[\p{Cc}\p{Cf}/\\]/u.test(fileName)
  )
    throw invalidPdf();
  return { expectedRevision, fileName };
}

async function readPdf(
  request: IncomingMessage,
  fileName: string,
): Promise<ValidatedDocumentPdf> {
  const chunks: Buffer[] = [];
  let size = 0;
  const timer = setTimeout(
    () => request.destroy(new Error('Questionnaire PDF stream expired.')),
    10_000,
  );
  try {
    for await (const raw of request) {
      const value: unknown = raw;
      if (!Buffer.isBuffer(value)) throw invalidPdf();
      size += value.length;
      if (size > MAXIMUM_DOCUMENT_PDF_BYTES)
        throw new PayloadTooLargeException('The Document PDF exceeds 5 MiB.');
      chunks.push(value);
    }
  } catch (error: unknown) {
    if (error instanceof PayloadTooLargeException) throw error;
    throw invalidPdf();
  } finally {
    clearTimeout(timer);
  }
  const bytes = Buffer.concat(chunks);
  if (
    !/^%PDF-(?:1\.[0-7]|2\.0)\r?\n/u.test(
      bytes.subarray(0, 12).toString('ascii'),
    ) ||
    !/%%EOF[\t\r\n ]*$/u.test(bytes.subarray(-1024).toString('ascii'))
  )
    throw invalidPdf();
  return {
    bytes,
    size,
    fileName,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
function invalidPdf(): BadRequestException {
  return new BadRequestException({
    code: 'document_pdf_invalid',
    message: 'Choose a PDF with a safe filename and at most 5 MiB.',
  });
}

function historyQuery(value: unknown): number | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Invalid PDF history cursor.');
  const query = Object.fromEntries(Object.entries(value));
  if (Object.keys(query).some((key) => key !== 'beforeRevision'))
    throw new BadRequestException('Invalid PDF history cursor.');
  if (query.beforeRevision === undefined) return undefined;
  if (
    typeof query.beforeRevision !== 'string' ||
    !/^[1-9]\d{0,9}$/u.test(query.beforeRevision)
  )
    throw new BadRequestException('Invalid PDF history cursor.');
  const revision = Number(query.beforeRevision);
  if (!Number.isSafeInteger(revision) || revision > 2147483647)
    throw new BadRequestException('Invalid PDF history cursor.');
  return revision;
}
