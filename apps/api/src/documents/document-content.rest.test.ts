import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createIsolatedPostgresTestDatabase,
  type IsolatedPostgresTestDatabase,
} from '../database/isolated-postgres-test-database.js';
import {
  createPostgresRestTestHarness,
  type PostgresRestTestHarness,
} from '../database/postgres-rest-test-harness.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const withPostgres = databaseUrl ? describe : describe.skip;
const WORKSPACE_ID = '00000000-0000-4000-8000-000000000633';
const PDF_A = Buffer.from(`%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 250 150] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>
endobj
4 0 obj
<< /Length 52 >>
stream
BT /F1 12 Tf 20 100 Td (DEMO questionnaire A) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f\x20
0000000009 00000 n\x20
0000000058 00000 n\x20
0000000115 00000 n\x20
0000000241 00000 n\x20
0000000342 00000 n\x20
trailer
<< /Size 6 /Root 1 0 R >>
startxref
412
%%EOF
`);
const PDF_A_SHA256 =
  'ed5bbbd62e0a5d77042803266e0c679ceafde1a37d5566ccefe41d803bb8568d';
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected record.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected string.');
  return value;
}
async function json(response: Response) {
  return record(await response.json());
}

withPostgres('Preserved questionnaire PDF content REST', () => {
  let database: IsolatedPostgresTestDatabase;
  let harness: PostgresRestTestHarness;
  let scanner: Server;
  let companyId: string;
  let membershipId: string;
  let documentId: string;
  let versionId: string;
  let scanMode: 'clean' | 'unsafe' | 'unavailable' | 'malformed' = 'clean';
  let scanCount = 0;
  let holdScan: ((complete: () => void) => void) | undefined;
  async function startApiHarness(): Promise<PostgresRestTestHarness> {
    const address = scanner.address();
    if (!address || typeof address === 'string')
      throw new Error('Expected scanner TCP address.');
    return createPostgresRestTestHarness({
      databaseUrl: database.targetUrl,
      environment: {
        NODE_ENV: 'test',
        ACCESS_IDENTITY_MODE: 'test',
        ACCESS_BOOTSTRAP_EXTERNAL_PROVIDER: 'deterministic-test',
        ACCESS_BOOTSTRAP_EXTERNAL_SUBJECT: 'pdf-owner',
        ACCESS_BOOTSTRAP_WORKSPACE_ID: WORKSPACE_ID,
        ACCESS_BOOTSTRAP_WORKSPACE_NAME: 'PDF content DEMO',
        DOCUMENT_MALWARE_SCANNER_HOST: '127.0.0.1',
        DOCUMENT_MALWARE_SCANNER_PORT: String(address.port),
      },
    });
  }
  beforeAll(async () => {
    if (!databaseUrl) throw new Error('TEST_DATABASE_URL is required.');
    // A deterministic external ClamAV wire boundary. The real scanner adapter
    // is exercised separately against disposable ClamAV; no internal module is mocked.
    scanner = createServer((socket) => {
      let input = Buffer.alloc(0);
      socket.on('data', (chunk) => {
        input = Buffer.concat([input, chunk]);
        if (input.equals(Buffer.from('zVERSION\0'))) {
          socket.end('ClamAV 1.4.3\0');
          return;
        }
        if (!input.subarray(0, 10).equals(Buffer.from('zINSTREAM\0'))) return;
        let offset = 10;
        while (offset + 4 <= input.length) {
          const size = input.readUInt32BE(offset);
          if (size === 0) {
            scanCount += 1;
            const complete = () => {
              if (scanMode === 'unavailable') socket.destroy();
              else
                socket.end(
                  scanMode === 'unsafe'
                    ? 'stream: DEMO.Test FOUND\0'
                    : scanMode === 'malformed'
                      ? 'uncertain\0'
                      : 'stream: OK\0',
                );
            };
            if (holdScan) holdScan(complete);
            else complete();
            return;
          }
          if (offset + 4 + size > input.length) return;
          offset += 4 + size;
        }
      });
    });
    await new Promise<void>((resolve, reject) => {
      scanner.once('error', reject);
      scanner.listen(0, '127.0.0.1', resolve);
    });
    database = await createIsolatedPostgresTestDatabase({
      baseDatabaseUrl: databaseUrl,
      namePrefix: 'document_pdf',
    });
    harness = await startApiHarness();
  });
  afterAll(async () => {
    await harness?.close();
    await database?.close();
    if (scanner)
      await new Promise<void>((resolve, reject) =>
        scanner.close((error) => (error ? reject(error) : resolve())),
      );
  });
  function call(
    path: string,
    options: { method?: string; body?: unknown; company?: string | null } = {},
  ) {
    const company = options.company === undefined ? companyId : options.company;
    return fetch(`${harness.origin}/api${path}`, {
      method: options.method ?? 'GET',
      headers: {
        'x-test-external-provider': 'deterministic-test',
        'x-test-external-subject': 'pdf-owner',
        'x-test-display-name': 'PDF Owner DEMO',
        'x-test-email': 'pdf-owner@example.test',
        ...(company ? { 'x-company-context-id': company } : {}),
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      ...(options.body === undefined
        ? {}
        : { body: JSON.stringify(options.body) }),
    });
  }
  async function grant(path: string) {
    const response = await call(path, {
      method: 'POST',
      company: null,
      body: { companyId, workspaceMembershipId: membershipId },
    });
    expect(response.status, path).toBe(201);
  }
  beforeEach(async () => {
    scanMode = 'clean';
    scanCount = 0;
    holdScan = undefined;
    await harness.pool.query(
      'TRUNCATE activity_log_events, workspace_memberships, internal_users, workspaces CASCADE',
    );
    const company = await call('/companies', {
      method: 'POST',
      company: null,
      body: { displayName: 'Company DEMO' },
    });
    expect(company.status).toBe(201);
    companyId = text((await json(company)).id);
    membershipId = text(
      (await json(await call('/access/current-actor', { company: null })))
        .workspaceMembershipId,
    );
    await grant('/company-document-registrar-assignments');
    const client = await call('/clients', {
      method: 'POST',
      body: { displayName: 'Client DEMO' },
    });
    expect(client.status).toBe(201);
    const registered = await call('/documents', {
      method: 'POST',
      body: {
        clientId: text((await json(client)).id),
        title: 'Questionnaire DEMO',
        purpose: 'Preserved PDF DEMO',
        url: 'https://example.test/demo/questionnaire',
      },
    });
    expect(registered.status).toBe(201);
    const document = await json(registered);
    documentId = text(document.id);
    versionId = text(record(document.version).id);
  });
  function contentPath(targetVersionId = versionId): string {
    return `/documents/${documentId}/versions/${targetVersionId}/content`;
  }
  function uploadPdf(
    options: {
      bytes?: Buffer;
      revision?: number;
      key?: string;
      fileName?: string;
      contentType?: string;
      versionId?: string;
      company?: string;
    } = {},
  ) {
    return fetch(
      `${harness.origin}/api${contentPath(options.versionId)}?expectedRevision=${options.revision ?? 1}&fileName=${encodeURIComponent(options.fileName ?? 'questionnaire-a.pdf')}`,
      {
        method: 'POST',
        headers: {
          'x-test-external-provider': 'deterministic-test',
          'x-test-external-subject': 'pdf-owner',
          'x-test-display-name': 'PDF Owner DEMO',
          'x-test-email': 'pdf-owner@example.test',
          'x-company-context-id': options.company ?? companyId,
          'content-type': options.contentType ?? 'application/pdf',
          'idempotency-key': options.key ?? randomUUID(),
        },
        body: new Uint8Array(options.bytes ?? PDF_A),
      },
    );
  }
  async function expectNoPdfWrites(): Promise<void> {
    const result = await harness.pool.query(
      'SELECT (SELECT count(*)::int FROM document_pdfs) AS files, (SELECT working_revision FROM working_documents WHERE id=$1) AS revision',
      [documentId],
    );
    expect(result.rows).toEqual([{ files: 0, revision: 1 }]);
  }
  it('stores a clean draft PDF and reopens the exact bytes with independent content grants', async () => {
    await grant('/company-document-content-reader-assignments');
    await grant('/company-document-content-uploader-assignments');
    const identity = {
      'x-test-external-provider': 'deterministic-test',
      'x-test-external-subject': 'pdf-owner',
      'x-test-display-name': 'PDF Owner DEMO',
      'x-test-email': 'pdf-owner@example.test',
      'x-company-context-id': companyId,
    };
    const path = `/documents/${documentId}/versions/${versionId}/content`;
    const uploaded = await fetch(
      `${harness.origin}/api${path}?expectedRevision=1&fileName=questionnaire-a.pdf`,
      {
        method: 'POST',
        headers: {
          ...identity,
          'content-type': 'application/pdf',
          'idempotency-key': 'pdf-upload-first',
        },
        body: PDF_A,
      },
    );
    expect(uploaded.status).toBe(201);
    expect(await json(uploaded)).toMatchObject({
      action: 'representation_added',
      documentId,
      versionId,
      workingRevision: 2,
      versionNumber: 1,
      appendedAfterDesignation: false,
    });
    const reopened = await call(`/documents/${documentId}/versions`);
    const read = await json(reopened);
    expect(read.workingRevision).toBe(2);
    expect(read.versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: versionId,
          pdfContent: expect.objectContaining({
            state: 'stored',
            access: 'granted',
            fileName: 'questionnaire-a.pdf',
            size: 595,
            sha256: PDF_A_SHA256,
          }),
        }),
      ]),
    );
    // Reconstruct the API application with the same persisted database. The
    // successful content and captured grants must survive process ownership.
    await harness.close();
    harness = await startApiHarness();
    const afterRestart = await json(
      await call(`/documents/${documentId}/versions`),
    );
    expect(afterRestart.workingRevision).toBe(2);
    expect(afterRestart.versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: versionId,
          pdfContent: expect.objectContaining({
            sha256: PDF_A_SHA256,
            size: 595,
          }),
        }),
      ]),
    );
    const downloaded = await fetch(`${harness.origin}/api${path}`, {
      headers: identity,
    });
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers.get('content-type')).toBe('application/pdf');
    expect(downloaded.headers.get('content-disposition')).toContain(
      'attachment;',
    );
    expect(downloaded.headers.get('x-content-type-options')).toBe('nosniff');
    expect(downloaded.headers.get('cache-control')).toContain('no-store');
    expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(PDF_A);
  });
  it('corrects a draft by preserving both uploaded PDFs without an old replay restoring the prior current file', async () => {
    await grant('/company-document-content-reader-assignments');
    await grant('/company-document-content-uploader-assignments');
    const identity = {
      'x-test-external-provider': 'deterministic-test',
      'x-test-external-subject': 'pdf-owner',
      'x-test-display-name': 'PDF Owner DEMO',
      'x-test-email': 'pdf-owner@example.test',
      'x-company-context-id': companyId,
    };
    const path = `/documents/${documentId}/versions/${versionId}/content`;
    const pdfB = Buffer.from(
      PDF_A.toString('utf8').replace(
        'DEMO questionnaire A',
        'DEMO questionnaire B',
      ),
    );
    const upload = (
      bytes: Buffer,
      expectedRevision: number,
      key: string,
      fileName: string,
    ) =>
      fetch(
        `${harness.origin}/api${path}?expectedRevision=${expectedRevision}&fileName=${fileName}`,
        {
          method: 'POST',
          headers: {
            ...identity,
            'content-type': 'application/pdf',
            'idempotency-key': key,
          },
          body: new Uint8Array(bytes),
        },
      );
    const first = await upload(PDF_A, 1, 'draft-file-a', 'questionnaire-a.pdf');
    expect(first.status).toBe(201);
    const receiptA = await json(first);
    const replacement = await upload(
      pdfB,
      2,
      'draft-file-b',
      'questionnaire-b.pdf',
    );
    expect(replacement.status).toBe(201);
    const receiptB = await json(replacement);
    expect(receiptB).toMatchObject({
      workingRevision: 3,
      versionId,
      versionNumber: 1,
      action: 'representation_added',
    });
    expect(receiptB.representationId).not.toBe(receiptA.representationId);
    const current = await fetch(`${harness.origin}/api${path}`, {
      headers: identity,
    });
    expect(current.status).toBe(200);
    expect(Buffer.from(await current.arrayBuffer())).toEqual(pdfB);
    const history = await fetch(`${harness.origin}/api${path}/history`, {
      headers: identity,
    });
    expect(history.status).toBe(200);
    expect((await json(history)).uploads).toEqual([
      expect.objectContaining({
        representationId: receiptB.representationId,
        revision: 3,
        current: true,
        fileName: 'questionnaire-b.pdf',
      }),
      expect.objectContaining({
        representationId: receiptA.representationId,
        revision: 2,
        current: false,
        fileName: 'questionnaire-a.pdf',
      }),
    ]);
    const historical = await fetch(
      `${harness.origin}/api${path}/${text(receiptA.representationId)}`,
      { headers: identity },
    );
    expect(historical.status).toBe(200);
    expect(Buffer.from(await historical.arrayBuffer())).toEqual(PDF_A);
    const replay = await upload(
      PDF_A,
      1,
      'draft-file-a',
      'questionnaire-a.pdf',
    );
    expect(replay.status).toBe(201);
    expect(await json(replay)).toEqual(receiptA);
    const afterReplay = await fetch(`${harness.origin}/api${path}`, {
      headers: identity,
    });
    expect(afterReplay.status).toBe(200);
    expect(Buffer.from(await afterReplay.arrayBuffer())).toEqual(pdfB);
  });

  it('requires independent live content rights and redacts file details from metadata-only readers', async () => {
    expect((await uploadPdf()).status).toBe(403);
    expect(scanCount).toBe(0);
    await grant('/company-document-content-uploader-assignments');
    expect((await uploadPdf()).status).toBe(403);
    await grant('/company-document-content-reader-assignments');
    const uploaded = await uploadPdf();
    expect(uploaded.status).toBe(201);
    const receipt = await json(uploaded);
    const revoked = await call(
      `/company-document-content-reader-assignments/${membershipId}/${companyId}`,
      { method: 'DELETE', company: null },
    );
    expect(revoked.status).toBe(200);
    const listed = await json(await call(`/documents/${documentId}/versions`));
    expect(listed.versions).toEqual([
      expect.objectContaining({
        pdfContent: { state: 'stored', access: 'denied' },
      }),
    ]);
    for (const suffix of ['', '/history', `/${text(receipt.representationId)}`])
      expect((await call(`${contentPath()}${suffix}`)).status).toBe(403);
    expect((await uploadPdf({ revision: 2 })).status).toBe(403);
    expect(scanCount).toBe(1);
  });
  it('rejects malformed, oversized, infected and unavailable-scanner files without bytes, revisions, receipts or events', async () => {
    await grant('/company-document-content-reader-assignments');
    await grant('/company-document-content-uploader-assignments');
    const before = await harness.pool.query(
      'SELECT count(*)::int AS count FROM activity_log_events',
    );
    expect((await uploadPdf({ bytes: Buffer.from('not a PDF') })).status).toBe(
      400,
    );
    expect(
      (await uploadPdf({ contentType: 'application/octet-stream' })).status,
    ).toBe(400);
    expect((await uploadPdf({ fileName: '../unsafe.pdf' })).status).toBe(400);
    expect((await uploadPdf({ bytes: Buffer.alloc(5242881) })).status).toBe(
      413,
    );
    expect(scanCount).toBe(0);
    scanMode = 'unsafe';
    expect((await uploadPdf()).status).toBe(400);
    scanMode = 'unavailable';
    expect((await uploadPdf()).status).toBe(503);
    scanMode = 'malformed';
    expect((await uploadPdf()).status).toBe(503);
    await expectNoPdfWrites();
    expect(
      (
        await harness.pool.query(
          'SELECT count(*)::int AS count FROM activity_log_events',
        )
      ).rows,
    ).toEqual(before.rows);
    expect(
      (
        await harness.pool.query(
          'SELECT count(*)::int AS count FROM document_version_commands',
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  });
  it('freezes the selected official PDF and starts a successor draft without copying stored bytes', async () => {
    await grant('/company-document-content-reader-assignments');
    await grant('/company-document-content-uploader-assignments');
    await grant('/company-document-approver-assignments');
    expect((await uploadPdf()).status).toBe(201);
    const official = await call(
      `/documents/${documentId}/versions/${versionId}/official-designation`,
      { method: 'POST', body: { expectedRevision: 2 } },
    );
    expect(official.status).toBe(200);
    expect((await uploadPdf({ revision: 3 })).status).toBe(409);
    await expect(
      harness.pool.query(
        `INSERT INTO document_pdfs (workspace_id, company_id, document_id, version_id, upload_revision, content, file_name, media_type, size, sha256, scan_outcome, scan_engine, scanned_at, stored_by_membership_id)
      SELECT workspace_id, company_id, document_id, version_id, 4, content, file_name, media_type, size, sha256, scan_outcome, scan_engine, scanned_at, stored_by_membership_id FROM document_pdfs WHERE version_id=$1`,
        [versionId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    const successor = await call(`/documents/${documentId}/versions`, {
      method: 'POST',
      body: { expectedRevision: 3 },
    });
    expect(successor.status).toBe(201);
    const receipt = await json(successor);
    expect(receipt).toMatchObject({ versionNumber: 2, workingRevision: 4 });
    const listed = await json(await call(`/documents/${documentId}/versions`));
    expect(listed.versions).toEqual([
      expect.objectContaining({
        id: receipt.versionId,
        status: 'draft',
        pdfContent: { state: 'absent' },
      }),
      expect.objectContaining({
        id: versionId,
        status: 'official',
        pdfContent: expect.objectContaining({ sha256: PDF_A_SHA256 }),
      }),
    ]);
    const downloaded = await call(contentPath());
    expect(downloaded.status).toBe(200);
    expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(PDF_A);
    const successorId = text(receipt.versionId);
    const pdfB = Buffer.from(
      PDF_A.toString('utf8').replace(
        'DEMO questionnaire A',
        'DEMO questionnaire B',
      ),
    );
    const corrected = await uploadPdf({
      versionId: successorId,
      bytes: pdfB,
      fileName: 'questionnaire-b.pdf',
      revision: 4,
    });
    expect(corrected.status).toBe(201);
    expect(await json(corrected)).toMatchObject({
      versionNumber: 2,
      workingRevision: 5,
    });
    const correctedDownload = await call(contentPath(successorId));
    expect(correctedDownload.status).toBe(200);
    expect(Buffer.from(await correctedDownload.arrayBuffer())).toEqual(pdfB);
    const secondDesignation = await call(
      `/documents/${documentId}/versions/${successorId}/official-designation`,
      { method: 'POST', body: { expectedRevision: 5 } },
    );
    expect(secondDesignation.status).toBe(200);
    const frozen = await json(await call(`/documents/${documentId}/versions`));
    expect(frozen.versions).toEqual([
      expect.objectContaining({
        id: successorId,
        status: 'official',
        pdfContent: expect.objectContaining({
          fileName: 'questionnaire-b.pdf',
        }),
      }),
      expect.objectContaining({
        id: versionId,
        status: 'superseded',
        pdfContent: expect.objectContaining({ sha256: PDF_A_SHA256 }),
      }),
    ]);
    const supersededDownload = await call(contentPath());
    expect(supersededDownload.status).toBe(200);
    expect(Buffer.from(await supersededDownload.arrayBuffer())).toEqual(PDF_A);
    expect((await uploadPdf({ revision: 6 })).status).toBe(409);
    expect(
      (await uploadPdf({ versionId: successorId, revision: 6 })).status,
    ).toBe(409);
  });
  it('rechecks a content grant revoked while scanning before any durable write', async () => {
    await grant('/company-document-content-reader-assignments');
    await grant('/company-document-content-uploader-assignments');
    let release: (() => void) | undefined;
    const arrived = new Promise<void>((resolve) => {
      holdScan = (complete) => {
        release = complete;
        resolve();
      };
    });
    const pending = uploadPdf();
    await arrived;
    try {
      const revoked = await call(
        `/company-document-content-uploader-assignments/${membershipId}/${companyId}`,
        { method: 'DELETE', company: null },
      );
      expect(revoked.status).toBe(200);
    } finally {
      release?.();
    }
    expect((await pending).status).toBe(403);
    await expectNoPdfWrites();
  });
  it('provides continuation to every prior draft upload beyond the first history page', async () => {
    await grant('/company-document-content-reader-assignments');
    await grant('/company-document-content-uploader-assignments');
    let earliestId: string | undefined;
    for (let revision = 1; revision <= 21; revision += 1) {
      const uploaded = await uploadPdf({
        revision,
        fileName: `questionnaire-${revision}.pdf`,
      });
      expect(uploaded.status).toBe(201);
      const receipt = await json(uploaded);
      if (revision === 1) earliestId = text(receipt.representationId);
    }
    const first = await json(await call(`${contentPath()}/history`));
    expect(first.uploads).toHaveLength(20);
    expect(first.nextBeforeRevision).toBe(3);
    const older = await json(
      await call(`${contentPath()}/history?beforeRevision=3`),
    );
    expect(older).toEqual({
      uploads: [
        expect.objectContaining({
          representationId: earliestId,
          revision: 2,
          current: false,
        }),
      ],
      nextBeforeRevision: null,
    });
    const downloaded = await call(`${contentPath()}/${text(earliestId)}`);
    expect(downloaded.status).toBe(200);
    expect(Buffer.from(await downloaded.arrayBuffer())).toEqual(PDF_A);
  });
  it('rejects a selected Company change rather than treating a known content identity as authority', async () => {
    await grant('/company-document-content-reader-assignments');
    await grant('/company-document-content-uploader-assignments');
    const uploaded = await uploadPdf();
    expect(uploaded.status).toBe(201);
    const receipt = await json(uploaded);
    const other = await call('/companies', {
      method: 'POST',
      company: null,
      body: { displayName: 'Other PDF Company DEMO' },
    });
    expect(other.status).toBe(201);
    const otherId = text((await json(other)).id);
    for (const path of [
      '/company-document-registrar-assignments',
      '/company-document-content-reader-assignments',
      '/company-document-content-uploader-assignments',
    ]) {
      expect(
        (
          await call(path, {
            method: 'POST',
            company: null,
            body: { companyId: otherId, workspaceMembershipId: membershipId },
          })
        ).status,
      ).toBe(201);
    }
    for (const suffix of ['', '/history', `/${text(receipt.representationId)}`])
      expect(
        (await call(`${contentPath()}${suffix}`, { company: otherId })).status,
      ).toBe(404);
    expect((await uploadPdf({ company: otherId, revision: 2 })).status).toBe(
      404,
    );
    expect(
      (
        await harness.pool.query(
          'SELECT count(*)::int AS count FROM document_pdfs',
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
  });
  it('conflicts an actor upload key in another authorized Company before scoped Document visibility', async () => {
    await grant('/company-document-content-reader-assignments');
    await grant('/company-document-content-uploader-assignments');
    const key = 'pdf-company-scoped-replay';
    const uploaded = await uploadPdf({ key });
    expect(uploaded.status).toBe(201);
    const originalReceipt = await json(uploaded);
    const other = await call('/companies', {
      method: 'POST',
      company: null,
      body: { displayName: 'Replay Company B DEMO' },
    });
    expect(other.status).toBe(201);
    const otherId = text((await json(other)).id);
    for (const path of [
      '/company-document-registrar-assignments',
      '/company-document-content-reader-assignments',
      '/company-document-content-uploader-assignments',
    ]) {
      const response = await call(path, {
        method: 'POST',
        company: null,
        body: { companyId: otherId, workspaceMembershipId: membershipId },
      });
      expect(response.status, path).toBe(201);
    }
    scanMode = 'unavailable';
    const conflict = await uploadPdf({ key, company: otherId });
    expect(conflict.status).toBe(409);
    const failure = await json(conflict);
    expect(failure.message).toBe(
      'Idempotency-Key was already used for another Version command.',
    );
    expect(JSON.stringify(failure)).not.toContain(documentId);
    expect(JSON.stringify(failure)).not.toContain(versionId);
    // Fresh keys and direct reads never reveal a Document in another Company.
    expect(
      (await uploadPdf({ key: 'fresh-company-b-upload', company: otherId }))
        .status,
    ).toBe(404);
    expect((await call(contentPath(), { company: otherId })).status).toBe(404);
    const revoked = await call(
      `/company-document-content-reader-assignments/${membershipId}/${otherId}`,
      { method: 'DELETE', company: null },
    );
    expect(revoked.status).toBe(200);
    expect((await uploadPdf({ key, company: otherId })).status).toBe(403);
    // A refused Company change neither rewrites nor reselects the original receipt.
    const replay = await uploadPdf({ key });
    expect(replay.status).toBe(201);
    expect(await json(replay)).toEqual(originalReceipt);
    expect(scanCount).toBe(1);
    expect(
      (
        await harness.pool.query(
          'SELECT count(*)::int AS count FROM document_pdfs',
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
    expect(
      (
        await harness.pool.query(
          'SELECT count(*)::int AS count FROM document_version_commands',
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
  });
  it('does not commit scanned bytes after the draft was designated official concurrently', async () => {
    await grant('/company-document-content-reader-assignments');
    await grant('/company-document-content-uploader-assignments');
    await grant('/company-document-approver-assignments');
    let release: (() => void) | undefined;
    const arrived = new Promise<void>((resolve) => {
      holdScan = (complete) => {
        release = complete;
        resolve();
      };
    });
    const pending = uploadPdf();
    await arrived;
    try {
      expect(
        (
          await call(
            `/documents/${documentId}/versions/${versionId}/official-designation`,
            { method: 'POST', body: { expectedRevision: 1 } },
          )
        ).status,
      ).toBe(200);
    } finally {
      release?.();
    }
    expect((await pending).status).toBe(409);
    expect(
      (
        await harness.pool.query(
          'SELECT count(*)::int AS count FROM document_pdfs',
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
    expect(
      (
        await harness.pool.query(
          'SELECT working_revision FROM working_documents WHERE id=$1',
          [documentId],
        )
      ).rows,
    ).toEqual([{ working_revision: 2 }]);
  });
  it('rolls content, revision, receipt, Activity and original Client fence back together when receipt persistence fails', async () => {
    await grant('/company-document-content-reader-assignments');
    await grant('/company-document-content-uploader-assignments');
    const clients = await harness.pool.query(
      'SELECT id, version, updated_at FROM client_accounts ORDER BY id',
    );
    const events = await harness.pool.query(
      'SELECT count(*)::int AS count FROM activity_log_events',
    );
    await harness.pool.query(
      "CREATE FUNCTION fail_pdf_test_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic receipt failure' USING ERRCODE='23514'; END $$",
    );
    await harness.pool.query(
      'CREATE TRIGGER fail_pdf_test_receipt BEFORE INSERT ON document_version_commands FOR EACH ROW EXECUTE FUNCTION fail_pdf_test_receipt()',
    );
    try {
      expect((await uploadPdf()).status).toBe(500);
    } finally {
      await harness.pool.query(
        'DROP TRIGGER fail_pdf_test_receipt ON document_version_commands',
      );
      await harness.pool.query('DROP FUNCTION fail_pdf_test_receipt()');
    }
    await expectNoPdfWrites();
    expect(
      (
        await harness.pool.query(
          'SELECT id, version, updated_at FROM client_accounts ORDER BY id',
        )
      ).rows,
    ).toEqual(clients.rows);
    expect(
      (
        await harness.pool.query(
          'SELECT count(*)::int AS count FROM activity_log_events',
        )
      ).rows,
    ).toEqual(events.rows);
    expect(
      (
        await harness.pool.query(
          'SELECT count(*)::int AS count FROM document_version_commands',
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  });
  it('converges simultaneous exact retries to one immutable file and one original durable receipt', async () => {
    await grant('/company-document-content-reader-assignments');
    await grant('/company-document-content-uploader-assignments');
    const responses = await Promise.all([
      uploadPdf({ key: 'same-upload' }),
      uploadPdf({ key: 'same-upload' }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const receipts = await Promise.all(responses.map(json));
    expect(receipts[0]).toEqual(receipts[1]);
    const scansBeforeStale = scanCount;
    expect((await uploadPdf({ key: 'new-stale-intention' })).status).toBe(409);
    expect(scanCount).toBe(scansBeforeStale);
    expect(
      (
        await harness.pool.query(
          'SELECT count(*)::int AS count FROM document_pdfs',
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
    expect(
      (
        await harness.pool.query(
          'SELECT count(*)::int AS count FROM document_version_commands',
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
    expect(
      (
        await harness.pool.query(
          'SELECT working_revision FROM working_documents WHERE id=$1',
          [documentId],
        )
      ).rows,
    ).toEqual([{ working_revision: 2 }]);
    const changed = Buffer.from(
      PDF_A.toString('utf8').replace(
        'DEMO questionnaire A',
        'DEMO questionnaire B',
      ),
    );
    expect(
      (await uploadPdf({ key: 'same-upload', bytes: changed })).status,
    ).toBe(409);
    expect(
      (
        await harness.pool.query(
          'SELECT count(*)::int AS count FROM document_pdfs',
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
  });
  it('uses composite scope and actor foreign keys and bounded-content checks at the database boundary', async () => {
    await grant('/company-document-content-reader-assignments');
    await grant('/company-document-content-uploader-assignments');
    expect((await uploadPdf()).status).toBe(201);
    const insert = `INSERT INTO document_pdfs (workspace_id, company_id, document_id, version_id, upload_revision, content, file_name, media_type, size, sha256, scan_outcome, scan_engine, scanned_at, stored_by_membership_id)
      SELECT workspace_id, $2::uuid, document_id, $3::uuid, 3, content, file_name, media_type, $4::integer, sha256, scan_outcome, scan_engine, scanned_at, $5::uuid FROM document_pdfs WHERE version_id=$1`;
    await expect(
      harness.pool.query(insert, [
        versionId,
        companyId,
        randomUUID(),
        595,
        membershipId,
      ]),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      harness.pool.query(insert, [
        versionId,
        randomUUID(),
        versionId,
        595,
        membershipId,
      ]),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      harness.pool.query(insert, [
        versionId,
        companyId,
        versionId,
        595,
        randomUUID(),
      ]),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      harness.pool.query(insert, [
        versionId,
        companyId,
        versionId,
        0,
        membershipId,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      harness.pool.query(insert, [
        versionId,
        companyId,
        versionId,
        5242881,
        membershipId,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
    expect(
      (
        await harness.pool.query(
          'SELECT count(*)::int AS count FROM document_pdfs',
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
  });
  it('refuses damaged preserved bytes rather than downloading content that differs from its committed hash', async () => {
    await grant('/company-document-content-reader-assignments');
    await grant('/company-document-content-uploader-assignments');
    expect((await uploadPdf()).status).toBe(201);
    // Deliberate disposable-database damage at the true storage boundary.
    // Restore every trigger before making the public read; no internal mock.
    await harness.pool.query('ALTER TABLE document_pdfs DISABLE TRIGGER USER');
    try {
      await harness.pool.query(
        'UPDATE document_pdfs SET sha256=$1 WHERE version_id=$2',
        ['0'.repeat(64), versionId],
      );
    } finally {
      await harness.pool.query('ALTER TABLE document_pdfs ENABLE TRIGGER USER');
    }
    const downloaded = await call(contentPath());
    expect(downloaded.status).toBe(503);
    expect(downloaded.headers.get('content-type')).not.toBe('application/pdf');
    const retained = await call(`${contentPath()}/history`);
    expect(retained.status).toBe(200);
    expect((await json(retained)).uploads).toEqual([
      expect.objectContaining({
        fileName: 'questionnaire-a.pdf',
        current: true,
      }),
    ]);
    expect((await call(`/documents/${documentId}/versions`)).status).toBe(200);
  });
  it('rejects a signature-only counterfeit and malformed PDF object structures even when the scanner reports clean', async () => {
    await grant('/company-document-content-reader-assignments');
    await grant('/company-document-content-uploader-assignments');
    for (const bytes of [
      Buffer.from('%PDF-1.4\n%%EOF'),
      Buffer.from(
        PDF_A.toString('utf8').replace('/Type /Catalog', '/Type /Unknown'),
      ),
      Buffer.from(PDF_A.toString('utf8').replace('/Pages 2 0 R', '/Pages ???')),
      Buffer.from(
        PDF_A.toString('utf8').replace('/Kids [3 0 R]', '/Kids [99 0 R]'),
      ),
      Buffer.from(
        PDF_A.toString('utf8').replace(
          '/MediaBox [0 0 250 150]',
          '/MediaBox /Invalid',
        ),
      ),
    ]) {
      expect((await uploadPdf({ bytes })).status).toBe(400);
      await expectNoPdfWrites();
    }
  });
  it('rejects direct modification or deletion of already preserved bytes at the database boundary', async () => {
    await grant('/company-document-content-reader-assignments');
    await grant('/company-document-content-uploader-assignments');
    expect((await uploadPdf()).status).toBe(201);
    await expect(
      harness.pool.query(
        "UPDATE document_pdfs SET file_name='changed.pdf' WHERE version_id=$1",
        [versionId],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      harness.pool.query('DELETE FROM document_pdfs WHERE version_id=$1', [
        versionId,
      ]),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
