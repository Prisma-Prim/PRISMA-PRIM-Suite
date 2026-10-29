import { PDFDocument, PDFName, PDFString } from 'pdf-lib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { readCommercialPdfResponse } from './commercial-pdf-response';
import {
  pdfReply,
  pdfTarget,
  malformedPdfBytes,
} from './commercial-pdf.test-fixture';
beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());
describe('Exact commercial binary response boundary', () => {
  it('verifies exact identity, declared size, media, syntax and actual PDF digest before offering bytes', async () => {
    const result = await readCommercialPdfResponse(await pdfReply(), pdfTarget);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.value.filename).toBe('offer-7-v3-non-official-ro.pdf');
      expect(result.value.blob.size).toBeGreaterThan(100);
    }
  });
  it('refuses structurally malformed bytes despite a coherent tuple, envelope and recomputed digest', async () => {
    expect(
      await readCommercialPdfResponse(
        await pdfReply(pdfTarget, malformedPdfBytes()),
        pdfTarget,
      ),
    ).toEqual({ status: 'malformed' });
  });
  it('cancels an unread malformed response body before returning refusal', async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ cancel }), {
      headers: { 'content-type': 'text/html' },
    });
    expect(await readCommercialPdfResponse(response, pdfTarget)).toEqual({
      status: 'malformed',
    });
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it.each([
    'media',
    'identity',
    'extraMetadata',
    'sourceDigest',
    'pdfDigest',
    'length',
    'empty',
    'oversized',
    'truncated',
    'malformed',
    'filename',
    'renderer',
  ])('refuses %s successful replies', async (kind) => {
    const original = await pdfReply(),
      headers = new Headers(original.headers);
    let bytes = new Uint8Array(await original.arrayBuffer());
    if (kind === 'media') headers.set('content-type', 'text/html');
    if (kind === 'identity')
      headers.set(
        'x-commercial-pdf-source',
        JSON.stringify({ ...pdfTarget, versionId: 'other' }),
      );
    if (kind === 'extraMetadata')
      headers.set(
        'x-commercial-pdf-source',
        JSON.stringify({ ...pdfTarget, unknown: 'unsupported binding' }),
      );
    if (kind === 'sourceDigest')
      headers.set(
        'x-commercial-pdf-source',
        JSON.stringify({ ...pdfTarget, sourceHtmlSha256: 'b'.repeat(64) }),
      );
    if (kind === 'pdfDigest')
      headers.set('x-commercial-pdf-sha256', '0'.repeat(64));
    if (kind === 'length') headers.set('content-length', '001');
    if (kind === 'empty') bytes = new Uint8Array();
    if (kind === 'oversized')
      headers.set('content-length', String(16 * 1024 * 1024 + 1));
    if (kind === 'truncated') bytes = bytes.slice(0, bytes.length - 1);
    if (kind === 'malformed') bytes[0] = 0;
    if (kind === 'filename')
      headers.set('content-disposition', 'attachment; filename="other.pdf"');
    if (kind === 'renderer')
      headers.set('x-commercial-pdf-renderer', 'UNKNOWN/1');
    expect(
      await readCommercialPdfResponse(
        new Response(bytes, { headers }),
        pdfTarget,
      ),
    ).toEqual({ status: 'malformed' });
  });
});

it.each(['missingPages', 'emptyPages', 'pageBound', 'invalidBox'])(
  'refuses coherent %s document structure with its recomputed PDF digest',
  async (kind) => {
    const document = await PDFDocument.create();
    if (kind === 'pageBound')
      for (let index = 0; index < 257; index += 1) document.addPage();
    else if (kind !== 'emptyPages') {
      const page = document.addPage();
      if (kind === 'invalidBox')
        page.node.set(
          PDFName.of('MediaBox'),
          PDFString.of('invalid rectangle'),
        );
    }
    if (kind === 'missingPages') document.catalog.delete(PDFName.of('Pages'));
    const bytes = new Uint8Array(
      await document.save({ useObjectStreams: false, addDefaultPage: false }),
    );
    expect(
      await readCommercialPdfResponse(
        await pdfReply(pdfTarget, bytes),
        pdfTarget,
      ),
    ).toEqual({ status: 'malformed' });
  },
);
it('accepts the qualified 256-page completed PDF bound with actual parsed pages', async () => {
  const document = await PDFDocument.create();
  for (let index = 0; index < 256; index += 1) document.addPage();
  const bytes = new Uint8Array(
    await document.save({ useObjectStreams: false }),
  );
  expect(
    (
      await readCommercialPdfResponse(
        await pdfReply(pdfTarget, bytes),
        pdfTarget,
      )
    ).status,
  ).toBe('ok');
});
