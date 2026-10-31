import {
  renderOfferRepresentation,
  type RenderOfferRepresentationInput,
} from '../offer/offer-representation.js';
import type { CommercialPdfSource } from './commercial-pdf-source.js';

export function illustrativePdfInput(
  options: {
    rows?: number;
    scopeNote?: string | null;
    commercialConditions?: string | null;
    extremeLineBreaks?: boolean;
  } = {},
): RenderOfferRepresentationInput {
  return {
    templateCode: 'OFFER_ILLUSTRATIVE',
    templateVersion: 1,
    illustrativeReference: 17,
    versionNumber: 1,
    issuingCompanyLabel: 'PRISMA & "Lumière" <Conseil>',
    recipient: {
      legalName: 'Recipient Șț Русский Français a\u0306 e\u0301 ☀️',
      taxId: 'RO&123',
      legalAddress: null,
    },
    createdAt: '2026-10-01T08:09:10.000Z',
    validUntil: '2026-10-31T08:09:10.000Z',
    lines: Array.from({ length: options.rows ?? 1 }, (_, index) => ({
      serviceName: options.extremeLineBreaks
        ? 'N' + '\n'.repeat(158) + 'E'
        : `SERVICE-${index + 1} <literal> & once`,
      quantity: '2.0000',
      unit: options.extremeLineBreaks ? 'U' + '\n'.repeat(22) + 'E' : 'day',
      unitAmount: '100.00',
      lineNet: '200.00',
      taxLabel: options.extremeLineBreaks
        ? 'T' + '\n'.repeat(58) + 'E'
        : 'TVA "standard"',
      lineTax: '40.00',
      adjustment: null,
      adjustedLineNet: '200.00',
      adjustedLineTax: '40.00',
    })),
    subtotal: options.rows === 20 ? '4000.00' : '200.00',
    taxTotal: options.rows === 20 ? '800.00' : '40.00',
    total: options.rows === 20 ? '4800.00' : '240.00',
    currency: 'EUR',
    scopeNote:
      options.scopeNote === undefined
        ? 'Scope  with\ttab\r\n\nexplicit lines'
        : options.scopeNote,
    commercialConditions:
      options.commercialConditions === undefined
        ? '<script>literal &amp; once</script>'
        : options.commercialConditions,
    pricingSnapshotId: '00000000-0000-4000-8000-000000000006',
    provenance: 'ILLUSTRATIVE',
  };
}
export function illustrativePdfSource(
  input = illustrativePdfInput(),
): CommercialPdfSource {
  const representation = renderOfferRepresentation(input);
  return {
    kind: 'offer',
    workspaceId: '00000000-0000-4000-8000-000000000001',
    companyId: '00000000-0000-4000-8000-000000000002',
    opportunityId: '00000000-0000-4000-8000-000000000003',
    rootId: '00000000-0000-4000-8000-000000000004',
    reference: input.illustrativeReference,
    versionId: '00000000-0000-4000-8000-000000000005',
    versionNumber: input.versionNumber,
    provenance: 'ILLUSTRATIVE',
    language: 'en',
    createdAt: input.createdAt,
    sourceRendererCode: 'OFFER_ILLUSTRATIVE',
    sourceRendererVersion: 1,
    sourceHtmlSha256: representation.sha256,
    html: representation.html,
  };
}
