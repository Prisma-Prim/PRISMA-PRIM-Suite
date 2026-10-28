import type { ServerResponse } from 'node:http';
import type { Readable } from 'node:stream';
import { setImmediate } from 'node:timers/promises';
import {
  BadRequestException,
  ConflictException,
  StreamableFile,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CommercialPdfRenderer } from './commercial-pdf-renderer.js';
import {
  pdfRefusal,
  type CommercialPdfSource,
} from './commercial-pdf-source.js';

export function readPdfQuery(query: unknown): string {
  if (
    !query ||
    typeof query !== 'object' ||
    Array.isArray(query) ||
    Object.keys(query).length !== 1 ||
    !('sourceHtmlSha256' in query) ||
    typeof query.sourceHtmlSha256 !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(query.sourceHtmlSha256)
  )
    throw new BadRequestException({ code: 'PDF_REQUEST_INVALID' });
  return query.sourceHtmlSha256;
}
export function requirePdfIds(...ids: string[]) {
  if (
    ids.some(
      (id) =>
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
          id,
        ),
    )
  )
    throw new BadRequestException({ code: 'PDF_REQUEST_INVALID' });
}
export async function readExactCommercialPdf(input: {
  readSource: () => Promise<CommercialPdfSource>;
  query: unknown;
  renderer: CommercialPdfRenderer;
  signal?: AbortSignal;
}) {
  input.signal?.throwIfAborted();
  const source = await input.readSource();
  input.signal?.throwIfAborted();
  const expected = readPdfQuery(input.query);
  if (source.sourceHtmlSha256 !== expected)
    throw new ConflictException({ code: 'PDF_SOURCE_MISMATCH' });
  const bytes = await input.renderer.render(source, input.signal);
  await setImmediate(undefined, { signal: input.signal });
  input.signal?.throwIfAborted();
  if (!bytes.length || bytes.length > 16 * 1024 * 1024)
    pdfRefusal('PDF_CONTENT_LIMIT');
  // The render owns no transaction. This complete live owner read is the read's
  // linearization point; no response metadata or byte is exposed beforehand.
  const current = await input.readSource();
  input.signal?.throwIfAborted();
  if (JSON.stringify(current) !== JSON.stringify(source))
    throw new ConflictException({ code: 'PDF_SOURCE_MISMATCH' });
  const { html, ...tuple } = source;
  void html;
  return {
    bytes: Buffer.from(bytes),
    tuple,
    pdfSha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
export function commercialPdfAttachment(
  result: Awaited<ReturnType<typeof readExactCommercialPdf>>,
  response: { setHeader(name: string, value: string): unknown },
): StreamableFile {
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Commercial-Pdf-Source', JSON.stringify(result.tuple));
  response.setHeader('X-Commercial-Pdf-Sha256', result.pdfSha256);
  response.setHeader('X-Commercial-Pdf-Renderer', 'COMMERCIAL_MODEL_PDF/1');
  return new StreamableFile(result.bytes, {
    type: 'application/pdf',
    length: result.bytes.length,
    disposition: `attachment; filename="${result.tuple.kind}-${result.tuple.reference}-v${result.tuple.versionNumber}-non-official-ro.pdf"`,
  });
}

/** Owns only the PDF response's disconnect signal, attachment and listener lifetime. */
export async function readCommercialPdfAttachment(
  response: ServerResponse,
  read: (
    signal: AbortSignal,
  ) => Promise<Awaited<ReturnType<typeof readExactCommercialPdf>>>,
): Promise<StreamableFile> {
  const controller = new AbortController();
  let stream: Readable | undefined;
  function cleanup() {
    response.off('close', closed);
    response.off('finish', cleanup);
    stream?.off('close', cleanup);
    stream = undefined;
  }
  function closed() {
    if (!response.writableFinished) {
      controller.abort();
      stream?.destroy();
    }
    cleanup();
  }
  response.once('close', closed);
  response.once('finish', cleanup);
  if (response.destroyed) closed();
  try {
    controller.signal.throwIfAborted();
    const result = await read(controller.signal);
    controller.signal.throwIfAborted();
    const file = commercialPdfAttachment(result, response);
    stream = file.getStream();
    stream.once('close', cleanup);
    return file;
  } catch (error) {
    cleanup();
    // A disconnected socket receives no response; keep Nest diagnostics bounded/safe.
    if (controller.signal.aborted)
      throw new ServiceUnavailableException({ code: 'PDF_RENDER_UNAVAILABLE' });
    throw error;
  }
}
