import { createHash, randomUUID } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { DocumentPdfStorage } from '../documents/document-pdf-storage.js';
import { openDocumentScannerFixture } from '../documents/document-scanner.test-support.js';
import {
  fictionalInvoicePdf,
  openExternalInvoiceDocument,
} from '../documents/external-invoice.test-support.js';
import {
  openEstimateOfferFixture,
  responseRecord,
  responseString,
} from '../offer/offer-estimate-preparation.test-support.js';
import {
  invoiceRecordEffects,
  fictionalInvoiceValues,
  prepareInvoiceRecordSource,
} from './invoice-record.proof-support.js';

const withPostgres = process.env.TEST_DATABASE_URL ? describe : describe.skip;
withPostgres('Invoice Record deliberately superseded exact source', () => {
  let fixture: Awaited<ReturnType<typeof openEstimateOfferFixture>>;
  let scanner: Awaited<ReturnType<typeof openDocumentScannerFixture>>;
  beforeAll(async () => {
    scanner = await openDocumentScannerFixture();
    fixture = await openEstimateOfferFixture({
      scannerEnvironment: scanner.environment,
    });
  });
  beforeEach(async () => {
    await fixture.reset();
    scanner.reset();
  });
  afterAll(async () => {
    await fixture?.close();
    await scanner?.close();
  });

  it.each([
    {
      field: 'SHA-256',
      statement:
        "UPDATE document_pdfs SET sha256=repeat('0',64) WHERE id=$1::uuid",
    },
    {
      field: 'byte length',
      statement:
        "UPDATE document_pdfs SET content=content||decode('00','hex'),size=size+1 WHERE id=$1::uuid",
    },
  ])(
    'withholds content whose $field differs from the conserved Invoice snapshot',
    async ({ statement }) => {
      const source = await prepareInvoiceRecordSource(fixture);
      const created = await source.create();
      expect(created.status).toBe(201);
      const recordId = responseString(
        responseRecord(await created.json()),
        'recordId',
      );
      const initial = await source.read(`/invoice-records/${recordId}`);
      // Only this disposable-database damage fixture bypasses immutable-row triggers.
      // Restore the exact bytes/metadata and re-enable guards even when an assertion fails.
      try {
        await fixture.pool.query(
          'ALTER TABLE document_pdfs DISABLE TRIGGER USER',
        );
        try {
          await fixture.pool.query(statement, [source.source.representationId]);
        } finally {
          await fixture.pool.query(
            'ALTER TABLE document_pdfs ENABLE TRIGGER USER',
          );
        }
        const damaged = await source.read(`/invoice-records/${recordId}`);
        expect(damaged.record).toEqual(initial.record);
        expect(damaged.history).toEqual(initial.history);
        expect(responseRecord(damaged.liveSource).content).toEqual({
          kind: 'UNAVAILABLE',
        });
        expect((await source.read('/invoice-records/sources')).items).toEqual(
          [],
        );
      } finally {
        await fixture.pool.query(
          'ALTER TABLE document_pdfs DISABLE TRIGGER USER',
        );
        try {
          await fixture.pool.query(
            'UPDATE document_pdfs SET content=$1,size=$2,sha256=$3 WHERE id=$4::uuid',
            [
              source.bytes,
              source.bytes.length,
              createHash('sha256').update(source.bytes).digest('hex'),
              source.source.representationId,
            ],
          );
        } finally {
          await fixture.pool.query(
            'ALTER TABLE document_pdfs ENABLE TRIGGER USER',
          );
        }
      }
      expect(
        (await source.read(`/invoice-records/${recordId}`)).liveSource,
      ).toEqual(initial.liveSource);
    },
  );

  it('selects frozen Invoice sources without reading PDF bytes', async () => {
    const source = await prepareInvoiceRecordSource(fixture);
    const read = vi.spyOn(DocumentPdfStorage.prototype, 'read');
    try {
      const selector = await source.read('/invoice-records/sources');
      expect(selector.items).toEqual([
        expect.objectContaining({
          source: source.source,
          byteLength: source.bytes.length,
          sha256: createHash('sha256').update(source.bytes).digest('hex'),
        }),
      ]);
      expect(read).toHaveBeenCalledTimes(0);
    } finally {
      read.mockRestore();
    }
  });

  it('refuses a replaced upload from the same designated Version even when its bytes equal the frozen PDF', async () => {
    const document = await openExternalInvoiceDocument(fixture);
    const versionId = responseString(
      responseRecord(document.document.version),
      'id',
    );
    const bytes = await fictionalInvoicePdf();
    const uploads: string[] = [];
    for (const revision of [1, 2]) {
      const uploaded = await document.upload(versionId, revision, bytes);
      expect(uploaded.status).toBe(201);
      uploads.push(
        responseString(
          responseRecord(await uploaded.json()),
          'representationId',
        ),
      );
    }
    const [replacedId, frozenId] = uploads;
    if (!replacedId || !frozenId)
      throw new Error('Expected two native uploads.');
    expect(replacedId).not.toBe(frozenId);
    const designation = await document.mutate(
      `/versions/${versionId}/official-designation`,
      { expectedRevision: 3 },
    );
    expect(designation.status).toBe(200);
    const source = {
      documentId: document.documentId,
      documentVersionId: versionId,
      representationId: frozenId,
    };
    const selector = await fixture.read({
      ...document.target,
      path: '/invoice-records/sources',
    });
    expect(responseRecord(selector).items).toEqual([
      expect.objectContaining({
        source,
        byteLength: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      }),
    ]);
    const before = await invoiceRecordEffects(fixture);
    const body = {
      source: { ...source, representationId: replacedId },
      values: fictionalInvoiceValues(),
      acknowledgeExternalDeclaration: true,
      replacesWithdrawnRecordId: null,
    };
    const refused = await fixture.post({
      ...document.target,
      path: '/invoice-records',
      body,
    });
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({
      code: 'INVOICE_SOURCE_NOT_ELIGIBLE',
    });
    expect(await invoiceRecordEffects(fixture)).toEqual(before);
    const created = await fixture.post({
      ...document.target,
      path: '/invoice-records',
      body: { ...body, source },
    });
    expect(created.status).toBe(201);
  });

  it('newly records superseded V1 despite an equal-byte official V2 and keeps that exact source after empty V3 creation', async () => {
    const source = await prepareInvoiceRecordSource(fixture);
    const successor = await source.mutate('/versions', { expectedRevision: 3 });
    expect(successor.status).toBe(201);
    const versionId = responseString(
      responseRecord(await successor.json()),
      'versionId',
    );
    const uploaded = await source.upload(versionId, 4, source.bytes);
    expect(uploaded.status).toBe(201);
    const representationId = responseString(
      responseRecord(await uploaded.json()),
      'representationId',
    );
    const secondSource = {
      documentId: source.source.documentId,
      documentVersionId: versionId,
      representationId,
    };
    expect(versionId).not.toBe(source.source.documentVersionId);
    expect(representationId).not.toBe(source.source.representationId);
    const designated = await source.mutate(
      `/versions/${versionId}/official-designation`,
      { expectedRevision: 5 },
    );
    expect(designated.status).toBe(200);

    const selector = await source.read('/invoice-records/sources');
    if (!Array.isArray(selector.items))
      throw new Error('Expected exact selectable financial sources.');
    const items = selector.items.map((item: unknown) => responseRecord(item));
    const sha256 = createHash('sha256').update(source.bytes).digest('hex');
    expect(items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: source.source,
          versionNumber: 1,
          versionState: 'superseded',
          byteLength: source.bytes.length,
          sha256,
        }),
        expect.objectContaining({
          source: secondSource,
          versionNumber: 2,
          versionState: 'official',
          byteLength: source.bytes.length,
          sha256,
        }),
      ]),
    );
    expect(items).toHaveLength(2);
    const original = items.find(
      (item) =>
        responseRecord(item.source).representationId ===
        source.source.representationId,
    );
    if (!original) throw new Error('Expected preserved V1 selection.');
    for (const tuple of [source.source, secondSource]) {
      const pdf = await source.call(
        `/versions/${tuple.documentVersionId}/content/${tuple.representationId}`,
      );
      expect(pdf.status).toBe(200);
      expect(Buffer.from(await pdf.arrayBuffer())).toEqual(source.bytes);
    }

    const before = await invoiceRecordEffects(fixture),
      key = randomUUID();
    for (const mixedSource of [
      { ...source.source, representationId },
      { ...secondSource, representationId: source.source.representationId },
    ]) {
      const refused = await source.create(
        { ...source.createBody, source: mixedSource },
        key,
      );
      expect(refused.status).toBe(404);
      expect(await invoiceRecordEffects(fixture)).toEqual(before);
    }
    const created = await source.create(source.createBody, key);
    expect(created.status).toBe(201);
    const id = responseString(responseRecord(await created.json()), 'recordId');
    const initial = await source.read(`/invoice-records/${id}`);
    expect(initial.record).toMatchObject({
      revision: 1,
      entryState: 'RECORDED',
      values: source.createBody.values,
      copiedContext: original.copiedContext,
    });
    expect(initial.liveSource).toMatchObject({
      kind: 'AVAILABLE',
      documentId: source.source.documentId,
      documentVersionId: source.source.documentVersionId,
      versionNumber: 1,
      versionState: 'superseded',
      content: {
        kind: 'AVAILABLE',
        representationId: source.source.representationId,
        byteLength: source.bytes.length,
        sha256,
      },
    });
    const third = await source.mutate('/versions', { expectedRevision: 6 });
    expect(third.status).toBe(201);
    const thirdVersionId = responseString(
      responseRecord(await third.json()),
      'versionId',
    );
    const versionsResponse = await source.call('/versions');
    expect(versionsResponse.status).toBe(200);
    const versions = responseRecord(await versionsResponse.json());
    expect(versions.versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: thirdVersionId,
          status: 'draft',
          pdfContent: { state: 'absent' },
        }),
      ]),
    );
    const after = await source.read(`/invoice-records/${id}`);
    expect(after.record).toEqual(initial.record);
    expect(after.history).toEqual(initial.history);
    expect(after.liveSource).toEqual(initial.liveSource);
    const retained = await source.request(`/invoice-records/${id}/source`);
    expect(retained.status).toBe(200);
    expect(Buffer.from(await retained.arrayBuffer())).toEqual(source.bytes);
  });
});
