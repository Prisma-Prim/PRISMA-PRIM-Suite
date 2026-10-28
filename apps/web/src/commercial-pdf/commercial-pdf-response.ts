type CommercialPdfIdentity = {
  workspaceId: string;
  companyId: string;
  opportunityId: string;
  rootId: string;
  reference: number;
  versionId: string;
  versionNumber: number;
  language: 'ro';
  createdAt: string;
  sourceRendererVersion: 1;
  sourceHtmlSha256: string;
};
export type CommercialPdfTarget = CommercialPdfIdentity &
  (
    | {
        kind: 'offer';
        provenance: 'COMPANY_MODEL_ESTIMATE';
        sourceRendererCode: 'OFFER_COMPANY_CONSULTING_RO';
      }
    | {
        kind: 'contract';
        provenance: 'COMPANY_MODEL_OFFER';
        sourceRendererCode: 'COMPANY_CONSULTING_CONTRACT_RO';
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
  const filename = `${target.kind}-${target.reference}-v${target.versionNumber}-non-official-ro.pdf`;
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
    response.headers.get('x-commercial-pdf-renderer') !==
      'COMMERCIAL_MODEL_PDF/1' ||
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
  return {
    status: 'ok',
    value: { blob: new Blob([bytes], { type: 'application/pdf' }), filename },
  } satisfies { status: 'ok'; value: { blob: Blob; filename: string } };
}
