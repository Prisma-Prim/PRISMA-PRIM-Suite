type CommercialPdfIdentity = {
  workspaceId: string;
  companyId: string;
  opportunityId: string;
  rootId: string;
  reference: number;
  versionId: string;
  versionNumber: number;
  createdAt: string;
  sourceRendererVersion: 1;
  sourceHtmlSha256: string;
};
export type CommercialPdfTarget = CommercialPdfIdentity &
  (
    | {
        kind: 'offer';
        provenance: 'COMPANY_MODEL_ESTIMATE';
        language: 'ro';
        sourceRendererCode: 'OFFER_COMPANY_CONSULTING_RO';
      }
    | {
        kind: 'contract';
        provenance: 'COMPANY_MODEL_OFFER';
        language: 'ro';
        sourceRendererCode: 'COMPANY_CONSULTING_CONTRACT_RO';
      }
    | {
        kind: 'offer';
        provenance: 'ILLUSTRATIVE';
        language: 'en';
        sourceRendererCode: 'OFFER_ILLUSTRATIVE';
      }
  );
export async function readCommercialPdfResponse(
  response: Response,
  target: CommercialPdfTarget,
) {
  const malformed = { status: 'malformed' } satisfies { status: 'malformed' };
  async function refuse() {
    if (response.body && !response.body.locked)
      await response.body.cancel().catch(() => undefined);
    return malformed;
  }
  const length = response.headers.get('content-length'),
    metadata = response.headers.get('x-commercial-pdf-source'),
    digest = response.headers.get('x-commercial-pdf-sha256');
  const filename = `${target.kind}-${target.reference}-v${target.versionNumber}-non-official-${target.language}.pdf`;
  const renderers = {
    ILLUSTRATIVE: 'COMMERCIAL_ILLUSTRATIVE_OFFER_PDF/1',
    COMPANY_MODEL_ESTIMATE: 'COMMERCIAL_MODEL_PDF/1',
    COMPANY_MODEL_OFFER: 'COMMERCIAL_MODEL_PDF/1',
  } satisfies Record<
    CommercialPdfTarget['provenance'],
    'COMMERCIAL_MODEL_PDF/1' | 'COMMERCIAL_ILLUSTRATIVE_OFFER_PDF/1'
  >;
  const renderer = renderers[target.provenance];
  if (
    response.status !== 200 ||
    response.headers.get('content-type') !== 'application/pdf' ||
    !length ||
    !/^[1-9][0-9]*$/u.test(length) ||
    Number(length) > 16 * 1024 * 1024 ||
    !metadata ||
    metadata.length > 4096 ||
    !digest ||
    !/^[0-9a-f]{64}$/u.test(digest) ||
    response.headers.get('x-commercial-pdf-renderer') !== renderer ||
    response.headers.get('content-disposition') !==
      `attachment; filename="${filename}"` ||
    !response.body
  )
    return refuse();
  let source: unknown;
  try {
    source = JSON.parse(metadata);
  } catch {
    return refuse();
  }
  if (!source || typeof source !== 'object' || Array.isArray(source))
    return refuse();
  const fields = Object.fromEntries(Object.entries(source));
  if (
    Object.keys(fields).length !== Object.keys(target).length ||
    Object.entries(target).some(([key, value]) => fields[key] !== value)
  )
    return refuse();
  const reader = response.body.getReader(),
    chunks: Uint8Array<ArrayBuffer>[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > Number(length) || size > 16 * 1024 * 1024) {
        await reader.cancel();
        return malformed;
      }
      chunks.push(new Uint8Array(chunk.value));
    }
  } finally {
    reader.releaseLock();
  }
  if (size !== Number(length) || size < 100) return malformed;
  const bytes = new Uint8Array(size);
  let cursor = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, cursor);
    cursor += chunk.length;
  }
  const header = new TextDecoder('ascii').decode(bytes.subarray(0, 9));
  const tail = new TextDecoder('ascii').decode(
    bytes.subarray(Math.max(0, size - 100)),
  );
  const xref = /startxref\s+(\d+)\s+%%EOF\s*$/u.exec(tail);
  if (
    !/^%PDF-1\.[0-7]/u.test(header) ||
    !xref ||
    new TextDecoder('ascii').decode(
      bytes.subarray(Number(xref[1]), Number(xref[1]) + 4),
    ) !== 'xref'
  )
    return malformed;
  const actual = [
    ...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
  ]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  if (actual !== digest) return malformed;
  try {
    // Parse the bounded file locally; an envelope and matching hash do not prove a PDF.
    // Keep this dependency lazy so ordinary page navigation does not load a PDF parser.
    const { PDFDocument } = await import('pdf-lib');
    const document = await PDFDocument.load(bytes, {
      throwOnInvalidObject: true,
      updateMetadata: false,
    });
    const pages = document.getPages();
    if (!pages.length || pages.length > 256) return malformed;
    for (const page of pages) {
      const { width, height } = page.getSize();
      if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0
      )
        return malformed;
    }
  } catch {
    return malformed;
  }
  return {
    status: 'ok',
    value: { blob: new Blob([bytes], { type: 'application/pdf' }), filename },
  } satisfies { status: 'ok'; value: { blob: Blob; filename: string } };
}
