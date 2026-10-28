import { PDFDocument } from 'pdf-lib';
import type { CommercialPdfTarget } from './commercial-pdf-response';
export const pdfTarget: CommercialPdfTarget = {
  kind: 'offer',
  workspaceId: 'workspace-965',
  companyId: 'company-965',
  opportunityId: 'opportunity-965',
  rootId: 'offer-965',
  reference: 7,
  versionId: 'version-965',
  versionNumber: 3,
  provenance: 'COMPANY_MODEL_ESTIMATE',
  language: 'ro',
  createdAt: '2026-10-28T09:00:00.000Z',
  sourceRendererCode: 'OFFER_COMPANY_CONSULTING_RO',
  sourceRendererVersion: 1,
  sourceHtmlSha256: 'a'.repeat(64),
};
export async function pdfReply(
  target: CommercialPdfTarget = pdfTarget,
  suppliedBytes?: Uint8Array,
) {
  const document = await PDFDocument.create();
  document
    .addPage([595.28, 841.89])
    .drawText('Synthetic exact commercial PDF fixture.');
  const bytes = new Uint8Array(
      suppliedBytes ?? (await document.save({ useObjectStreams: false })),
    ),
    hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  return new Response(bytes, {
    headers: {
      'content-type': 'application/pdf',
      'content-length': String(bytes.length),
      'content-disposition': `attachment; filename="${target.kind}-${target.reference}-v${target.versionNumber}-non-official-ro.pdf"`,
      'x-commercial-pdf-source': JSON.stringify(target),
      'x-commercial-pdf-renderer': 'COMMERCIAL_MODEL_PDF/1',
      'x-commercial-pdf-sha256': hash,
    },
  });
}

export function malformedPdfBytes() {
  const prefix = '%PDF-1.7\n' + 'This is not a PDF object.\n'.repeat(6);
  return new TextEncoder().encode(
    prefix + 'xref\nstartxref\n' + prefix.length + '\n%%EOF\n',
  );
}
