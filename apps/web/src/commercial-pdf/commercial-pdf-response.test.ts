import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { readCommercialPdfResponse } from './commercial-pdf-response';
import { pdfReply, pdfTarget } from './commercial-pdf.test-fixture';
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
