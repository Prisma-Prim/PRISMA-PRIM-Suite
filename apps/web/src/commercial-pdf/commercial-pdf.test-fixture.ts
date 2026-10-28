import { webcrypto } from 'node:crypto';
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
export async function pdfReply(target: CommercialPdfTarget = pdfTarget) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>',
  ];
  let text = '%PDF-1.7\n';
  const offsets: number[] = [];
  for (const [i, object] of objects.entries()) {
    offsets.push(text.length);
    text += `${i + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = text.length;
  text += `xref\n0 4\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Root 1 0 R /Size 4 >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new TextEncoder().encode(text),
    hash = [...new Uint8Array(await webcrypto.subtle.digest('SHA-256', bytes))]
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
