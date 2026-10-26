import { createHash } from 'node:crypto';
import type { PricingSnapshotLineRecord } from '../pricing-configuration/pricing-snapshot.types.js';
import { storedOfferBinding, type OfferBinding } from './offer-binding.js';

type OfferRepresentationLine = Pick<
  PricingSnapshotLineRecord,
  | 'serviceName'
  | 'quantity'
  | 'unit'
  | 'unitAmount'
  | 'lineNet'
  | 'taxLabel'
  | 'lineTax'
  | 'adjustment'
  | 'adjustedLineNet'
  | 'adjustedLineTax'
>;

export interface RenderOfferRepresentationInput {
  readonly templateCode: string;
  readonly templateVersion: number;
  readonly illustrativeReference: number;
  readonly versionNumber: number;
  readonly issuingCompanyLabel: string;
  readonly recipient: {
    readonly legalName: string;
    readonly taxId: string | null;
    readonly legalAddress: string | null;
  };
  readonly createdAt: string;
  readonly validUntil: string;
  readonly lines: ReadonlyArray<OfferRepresentationLine>;
  readonly subtotal: string;
  readonly taxTotal: string;
  readonly total: string;
  readonly currency: string;
  readonly scopeNote: string | null;
  readonly commercialConditions: string | null;
  readonly pricingSnapshotId: string;
  readonly provenance: 'ILLUSTRATIVE';
}

export interface OfferRepresentation {
  readonly templateCode: 'OFFER_ILLUSTRATIVE';
  readonly templateVersion: OfferBinding['templateVersion'];
  readonly html: string;
  readonly sha256: string;
}

export function renderOfferRepresentation(
  input: RenderOfferRepresentationInput,
): OfferRepresentation {
  const binding = storedOfferBinding(input);
  const adjusted = input.lines.some((line) => line.adjustment !== null);
  if (binding.templateVersion === 1 && adjusted)
    throw new Error(
      'Offer Template Version 1 cannot render an adjusted Pricing Snapshot.',
    );
  if (binding.templateVersion === 2 && !adjusted)
    throw new Error(
      'Offer Template Version 2 requires an adjusted Pricing Snapshot.',
    );

  const html = renderIllustrativeOffer(input, binding.templateVersion);
  return {
    templateCode: 'OFFER_ILLUSTRATIVE',
    templateVersion: binding.templateVersion,
    html,
    sha256: createHash('sha256').update(html, 'utf8').digest('hex'),
  };
}

/**
 * Template v1 bytes are frozen. Template v2 differs only by the adjacent
 * fixed-discount and adjusted rows of each adjusted line and its footer; it
 * renders stored Snapshot strings and never derives an amount.
 */
function renderIllustrativeOffer(
  input: RenderOfferRepresentationInput,
  templateVersion: OfferBinding['templateVersion'],
): string {
  const currency = escapeHtml(input.currency);
  const lineRows = input.lines
    .map((line) => {
      const original = `<tr><td>${escapeHtml(line.serviceName)}</td><td>${escapeHtml(line.quantity)}</td><td>${escapeHtml(line.unit)}</td><td>${escapeHtml(line.unitAmount)} ${currency}</td><td>${escapeHtml(line.lineNet)} ${currency}</td><td>${escapeHtml(line.taxLabel)}</td><td>${escapeHtml(line.lineTax)} ${currency}</td></tr>`;
      if (templateVersion === 1 || line.adjustment === null) return original;
      return (
        original +
        `<tr><td colspan="4">Fixed discount: ${escapeHtml(line.adjustment.reason)}</td><td>${escapeHtml(line.adjustment.netReduction)} ${currency}</td><td>Tax reduction</td><td>${escapeHtml(line.adjustment.taxReduction)} ${currency}</td></tr>` +
        `<tr><td colspan="4">Adjusted line</td><td>${escapeHtml(line.adjustedLineNet)} ${currency}</td><td>Adjusted tax</td><td>${escapeHtml(line.adjustedLineTax)} ${currency}</td></tr>`
      );
    })
    .join('');

  return [
    '<!doctype html>',
    '<html lang="en">',
    `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Illustrative Offer</title><style>*,*::before,*::after{box-sizing:border-box}body{margin:0;padding:1rem;font-family:system-ui,sans-serif;color:#172033}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:.5rem;text-align:left;vertical-align:top;border:1px solid #cbd5e1;overflow-wrap:anywhere}dl{display:grid;grid-template-columns:minmax(8rem,1fr) 2fr;gap:.5rem 1rem}dt{font-weight:700}dd{margin:0;overflow-wrap:anywhere}@media(max-width:30rem){dl{grid-template-columns:1fr}th,td{font-size:.75rem;padding:.25rem}}</style></head>`,
    '<body>',
    '<article aria-labelledby="offer-title">',
    '<header><p><strong>Provisional illustrative document — cannot be accepted — no legal effect — no official number</strong></p><h1 id="offer-title">Illustrative Offer</h1></header>',
    `<section aria-labelledby="offer-details-title"><h2 id="offer-details-title">Offer details</h2><dl><dt>Issuing Company</dt><dd>${escapeHtml(input.issuingCompanyLabel)}</dd><dt>Illustrative Offer reference</dt><dd>${input.illustrativeReference}</dd><dt>Offer Version</dt><dd>${input.versionNumber}</dd><dt>Recipient legal name</dt><dd>${escapeHtml(input.recipient.legalName)}</dd><dt>Recipient tax ID</dt><dd>${optionalText(input.recipient.taxId)}</dd><dt>Recipient legal address</dt><dd>${optionalText(input.recipient.legalAddress)}</dd><dt>Created at</dt><dd>${escapeHtml(input.createdAt)}</dd><dt>Valid until</dt><dd>${escapeHtml(input.validUntil)}</dd></dl></section>`,
    `<section aria-labelledby="offer-lines-title"><h2 id="offer-lines-title">Services</h2><table><thead><tr><th scope="col">Service name</th><th scope="col">Quantity</th><th scope="col">Unit</th><th scope="col">Unit amount</th><th scope="col">Line net</th><th scope="col">Tax label</th><th scope="col">Line tax</th></tr></thead><tbody>${lineRows}</tbody></table></section>`,
    `<section aria-labelledby="offer-totals-title"><h2 id="offer-totals-title">Totals</h2><dl><dt>Subtotal</dt><dd>${escapeHtml(input.subtotal)} ${currency}</dd><dt>Tax total</dt><dd>${escapeHtml(input.taxTotal)} ${currency}</dd><dt>Total</dt><dd>${escapeHtml(input.total)} ${currency}</dd><dt>Currency</dt><dd>${currency}</dd></dl></section>`,
    `<section aria-labelledby="offer-scope-title"><h2 id="offer-scope-title">Scope note</h2><p>${optionalText(input.scopeNote)}</p></section>`,
    `<section aria-labelledby="offer-conditions-title"><h2 id="offer-conditions-title">Commercial conditions</h2><p>${optionalText(input.commercialConditions)}</p></section>`,
    `<footer><dl><dt>Template Version</dt><dd>OFFER_ILLUSTRATIVE v${templateVersion}</dd><dt>Pricing Snapshot id</dt><dd>${escapeHtml(input.pricingSnapshotId)}</dd><dt>Provenance</dt><dd>${input.provenance}</dd></dl></footer>`,
    '</article>',
    '</body>',
    '</html>',
  ].join('\n');
}

function optionalText(value: string | null): string {
  return value === null ? 'Not recorded' : escapeHtml(value);
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
