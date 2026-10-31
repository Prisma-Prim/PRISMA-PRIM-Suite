import fontkit from '@pdf-lib/fontkit';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';

/** Actual owned TCP fixture for the scanner adapter; not real ClamAV evidence. */
export async function startKnowledgeScanner() {
  return openDocumentScannerFixture();
}

export const KNOWLEDGE_DOCUMENT_LITERAL =
  'There are four boxes in this fictional dossier.';

interface KnowledgeDocumentFixtureOptions {
  readonly origin: string;
  readonly companyId: string;
  readonly membershipId: string;
  readonly callerHeaders: Readonly<Record<string, string>>;
  /** The existing Workspace assignment owner, when different from the caller. */
  readonly grantHeaders?: Readonly<Record<string, string>>;
  /** Exact literal text drawn into the synthetic preserved PDF. */
  readonly passageText?: string;
  readonly language?: 'ro' | 'ru' | 'en';
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('The public Document fixture expected an object.');
  return Object.fromEntries(Object.entries(value));
}

function text(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new Error('The public Document fixture expected a non-empty string.');
  return value;
}

function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new Error(
      'The public Document fixture expected a positive revision.',
    );
  return value;
}

async function responseObject(
  response: Response,
  expectedStatus: number,
  operation: string,
): Promise<Record<string, unknown>> {
  if (response.status !== expectedStatus)
    throw new Error(
      `${operation} expected HTTP ${expectedStatus}; received ${response.status}.`,
    );
  const value: unknown = await response.json();
  return record(value);
}

/**
 * Create the original, exact PDF and official Version through public commands.
 * All grants, evidence strings and content are explicit fictional test inputs.
 * Curated passage attestation remains a separate Knowledge command, not OCR.
 */
export async function createKnowledgeDocumentFixture({
  origin,
  companyId,
  membershipId,
  callerHeaders,
  grantHeaders = callerHeaders,
  passageText = KNOWLEDGE_DOCUMENT_LITERAL,
  language = 'en',
}: KnowledgeDocumentFixtureOptions) {
  if (
    !passageText ||
    [...passageText].some((character) => {
      const point = character.codePointAt(0);
      return (
        point === undefined ||
        point < 32 ||
        (point >= 0xd800 && point <= 0xdfff)
      );
    })
  )
    throw new Error('The synthetic PDF requires well-formed literal text.');
  function headers(
    identity: Readonly<Record<string, string>>,
    company: boolean,
    contentType = 'application/json',
  ): Headers {
    const result = new Headers(identity);
    if (company) result.set('x-company-context-id', companyId);
    else result.delete('x-company-context-id');
    result.set('content-type', contentType);
    result.set('idempotency-key', randomUUID());
    return result;
  }

  async function command(
    path: string,
    body: unknown,
    identity = callerHeaders,
    company = true,
  ) {
    return responseObject(
      await fetch(`${origin}/api${path}`, {
        method: 'POST',
        headers: headers(identity, company),
        body: JSON.stringify(body),
      }),
      201,
      path,
    );
  }

  for (const path of [
    '/company-director-client-assignments',
    '/company-document-registrar-assignments',
    '/company-document-approver-assignments',
    '/company-document-content-reader-assignments',
    '/company-document-content-uploader-assignments',
  ])
    await command(
      path,
      { workspaceMembershipId: membershipId, companyId },
      grantHeaders,
      false,
    );

  const client = await command('/clients', {
    displayName: 'Fictional Knowledge Client',
  });
  const document = await command('/documents', {
    clientId: text(client.id),
    title: 'Fictional governed source for cited evidence',
    purpose: 'Qualify exact-source admission without real Client data',
    url: 'https://example.test/fictional/knowledge-original',
  });
  const documentId = text(document.id);
  const documentVersionId = text(record(document.version).id);

  const pdf = await PDFDocument.create();
  pdf.setTitle('Fictional governed knowledge original');
  pdf.setSubject('Synthetic qualification only; no actual rights attestation');
  pdf.setCreationDate(new Date('2026-01-01T00:00:00.000Z'));
  pdf.setModificationDate(new Date('2026-01-01T00:00:00.000Z'));
  const page = pdf.addPage([595, 842]);
  if (
    [...passageText].some((character) => (character.codePointAt(0) ?? 0) > 126)
  ) {
    pdf.registerFontkit(fontkit);
    const fontBytes = await readFile(
      join(__dirname, '..', 'commercial-pdf', 'assets', 'DejaVuSans.ttf'),
    );
    const font = await pdf.embedFont(fontBytes, { subset: true });
    page.drawText(passageText, {
      x: 50,
      y: 790,
      size: 12,
      maxWidth: 495,
      lineHeight: 18,
      font,
    });
  } else
    page.drawText(passageText, {
      x: 50,
      y: 790,
      size: 12,
      maxWidth: 495,
      lineHeight: 18,
    });
  const bytes = await pdf.save({ useObjectStreams: false });
  const sourceSha256 = createHash('sha256').update(bytes).digest('hex');
  const upload = await responseObject(
    await fetch(
      `${origin}/api/documents/${documentId}/versions/${documentVersionId}/content?expectedRevision=1&fileName=fictional-knowledge-original.pdf`,
      {
        method: 'POST',
        headers: headers(callerHeaders, true, 'application/pdf'),
        body: new Uint8Array(bytes),
      },
    ),
    201,
    'Governed PDF upload',
  );
  const representationId = text(upload.representationId);
  const designation = await responseObject(
    await fetch(
      `${origin}/api/documents/${documentId}/versions/${documentVersionId}/official-designation`,
      {
        method: 'POST',
        headers: headers(callerHeaders, true),
        body: JSON.stringify({
          expectedRevision: revision(upload.workingRevision),
        }),
      },
    ),
    200,
    'Official Version designation',
  );
  if (
    designation.versionId !== documentVersionId ||
    designation.documentId !== documentId
  )
    throw new Error(
      'Official designation returned a different source identity.',
    );

  const reopened = await responseObject(
    await fetch(`${origin}/api/documents/${documentId}/versions`, {
      headers: headers(callerHeaders, true),
    }),
    200,
    'Exact source Version read',
  );
  if (!Array.isArray(reopened.versions))
    throw new Error('The public Document fixture expected Version records.');
  const official = reopened.versions
    .map(record)
    .find((item) => item.id === documentVersionId);
  if (!official || official.status !== 'official')
    throw new Error('The exact fixture source Version is not official.');
  const content = record(official.pdfContent);
  if (
    content.state !== 'stored' ||
    content.access !== 'granted' ||
    content.representationId !== representationId ||
    content.sha256 !== sourceSha256
  )
    throw new Error(
      'The public source identity/checksum did not match the uploaded PDF.',
    );

  return {
    documentId,
    documentVersionId,
    representationId,
    sourceSha256,
    draftBody: {
      documentId,
      documentVersionId,
      representationId,
      sourceSha256,
      language,
      ownerReference: 'Fictional source owner',
      provenance:
        'Synthetic PDF created through public governed Document commands',
      rightsEvidenceReference:
        'SYNTHETIC authored fixture declaration; no real license',
      permittedPurpose: 'cited-evidence',
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      effectiveUntil: '2027-01-01T00:00:00.000Z',
      passages: [{ locator: 'p1', text: passageText }],
    },
  };
}
