import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  renderOfferRepresentation,
  type RenderOfferRepresentationInput,
} from './offer-representation.js';

const input = {
  templateCode: 'OFFER_ILLUSTRATIVE',
  templateVersion: 1,
  illustrativeReference: 17,
  versionNumber: 1,
  issuingCompanyLabel: 'PRISMA & "Lumière" <Conseil>',
  recipient: {
    legalName:
      'Société d\'Étude & <Audit> "Nord" — une identité volontairement longue pour vérifier le rendu',
    taxId: 'RO&123',
    legalAddress: null,
  },
  createdAt: '2026-10-01T08:09:10.000Z',
  validUntil: '2026-10-31T08:09:10.000Z',
  lines: [
    {
      serviceName: 'Audit <Initial> & suivi',
      quantity: '2.0000',
      unit: 'day',
      unitAmount: '100.00',
      lineNet: '200.00',
      taxLabel: 'TVA "standard"',
      lineTax: '40.00',
      adjustment: null,
      adjustedLineNet: '200.00',
      adjustedLineTax: '40.00',
    },
  ],
  subtotal: '200.00',
  taxTotal: '40.00',
  total: '240.00',
  currency: 'EUR',
  scopeNote: null,
  commercialConditions: '<script>alert("x")</script> & clôturé',
  pricingSnapshotId: 'snapshot<&>"one"',
  provenance: 'ILLUSTRATIVE',
} satisfies RenderOfferRepresentationInput;

const expectedHtml = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Illustrative Offer</title><style>*,*::before,*::after{box-sizing:border-box}body{margin:0;padding:1rem;font-family:system-ui,sans-serif;color:#172033}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:.5rem;text-align:left;vertical-align:top;border:1px solid #cbd5e1;overflow-wrap:anywhere}dl{display:grid;grid-template-columns:minmax(8rem,1fr) 2fr;gap:.5rem 1rem}dt{font-weight:700}dd{margin:0;overflow-wrap:anywhere}@media(max-width:30rem){dl{grid-template-columns:1fr}th,td{font-size:.75rem;padding:.25rem}}</style></head>
<body>
<article aria-labelledby="offer-title">
<header><p><strong>Provisional illustrative document — cannot be accepted — no legal effect — no official number</strong></p><h1 id="offer-title">Illustrative Offer</h1></header>
<section aria-labelledby="offer-details-title"><h2 id="offer-details-title">Offer details</h2><dl><dt>Issuing Company</dt><dd>PRISMA &amp; &quot;Lumière&quot; &lt;Conseil&gt;</dd><dt>Illustrative Offer reference</dt><dd>17</dd><dt>Offer Version</dt><dd>1</dd><dt>Recipient legal name</dt><dd>Société d&#39;Étude &amp; &lt;Audit&gt; &quot;Nord&quot; — une identité volontairement longue pour vérifier le rendu</dd><dt>Recipient tax ID</dt><dd>RO&amp;123</dd><dt>Recipient legal address</dt><dd>Not recorded</dd><dt>Created at</dt><dd>2026-10-01T08:09:10.000Z</dd><dt>Valid until</dt><dd>2026-10-31T08:09:10.000Z</dd></dl></section>
<section aria-labelledby="offer-lines-title"><h2 id="offer-lines-title">Services</h2><table><thead><tr><th scope="col">Service name</th><th scope="col">Quantity</th><th scope="col">Unit</th><th scope="col">Unit amount</th><th scope="col">Line net</th><th scope="col">Tax label</th><th scope="col">Line tax</th></tr></thead><tbody><tr><td>Audit &lt;Initial&gt; &amp; suivi</td><td>2.0000</td><td>day</td><td>100.00 EUR</td><td>200.00 EUR</td><td>TVA &quot;standard&quot;</td><td>40.00 EUR</td></tr></tbody></table></section>
<section aria-labelledby="offer-totals-title"><h2 id="offer-totals-title">Totals</h2><dl><dt>Subtotal</dt><dd>200.00 EUR</dd><dt>Tax total</dt><dd>40.00 EUR</dd><dt>Total</dt><dd>240.00 EUR</dd><dt>Currency</dt><dd>EUR</dd></dl></section>
<section aria-labelledby="offer-scope-title"><h2 id="offer-scope-title">Scope note</h2><p>Not recorded</p></section>
<section aria-labelledby="offer-conditions-title"><h2 id="offer-conditions-title">Commercial conditions</h2><p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; clôturé</p></section>
<footer><dl><dt>Template Version</dt><dd>OFFER_ILLUSTRATIVE v1</dd><dt>Pricing Snapshot id</dt><dd>snapshot&lt;&amp;&gt;&quot;one&quot;</dd><dt>Provenance</dt><dd>ILLUSTRATIVE</dd></dl></footer>
</article>
</body>
</html>`;

describe('illustrative Offer representation', () => {
  it('renders the v1 golden bytes and checksum from immutable inputs', () => {
    const first = renderOfferRepresentation(input);
    const second = renderOfferRepresentation(input);

    expect(first).toEqual({
      templateCode: 'OFFER_ILLUSTRATIVE',
      templateVersion: 1,
      html: expectedHtml,
      sha256:
        'aa12e61484511c31024ac718cab244bbe0944ba95048004aa707f59710c0e39f',
    });
    expect(second).toEqual(first);
    expect(first.html).not.toContain('<script>');
    expect(first.html).not.toContain('PENDING');
    expect(first.html).not.toContain('NOT_TRANSMITTED');
    expect(first.html).not.toContain('NONE');
    expect(first.html).not.toContain('not approved');
  });

  it.each([
    { templateCode: 'UNKNOWN', templateVersion: 1 },
    { templateCode: 'OFFER_ILLUSTRATIVE', templateVersion: 3 },
    { templateCode: 'OFFER_ILLUSTRATIVE', templateVersion: 0 },
  ])('fails closed for an unsupported stored Template binding', (binding) => {
    expect(() => renderOfferRepresentation({ ...input, ...binding })).toThrow(
      'The stored Offer Template Version is unsupported.',
    );
  });

  it('fails closed instead of rendering an adjusted Snapshot as v1', () => {
    expect(() =>
      renderOfferRepresentation({
        ...input,
        lines: input.lines.map((line) => ({
          ...line,
          adjustment: {
            type: 'FIXED_NET_DISCOUNT',
            netReduction: '1.00',
            taxReduction: '0.20',
            reason: 'Synthetic adjustment',
            appliedByWorkspaceMembershipId: 'membership-one',
            appliedAt: '2026-10-01T08:09:10.000Z',
          },
        })),
      }),
    ).toThrow(
      'Offer Template Version 1 cannot render an adjusted Pricing Snapshot.',
    );
  });
});

// One adjusted and one unadjusted line; amounts are the stored strings of a
// hand-computed trace (200.00 - 12.34 = 187.66; tax 40.00 -> 37.53).
const adjustedInput = {
  ...input,
  templateVersion: 2,
  versionNumber: 2,
  lines: [
    {
      ...input.lines[0],
      adjustment: {
        type: 'FIXED_NET_DISCOUNT',
        netReduction: '12.34',
        taxReduction: '2.47',
        reason: 'Remise <spéciale> & "fidélité" \'2026\'',
        appliedByWorkspaceMembershipId: 'membership-never-rendered',
        appliedAt: '2026-09-30T07:00:00.000Z',
      },
      adjustedLineNet: '187.66',
      adjustedLineTax: '37.53',
    },
    {
      serviceName: 'Unadjusted follow-up',
      quantity: '1',
      unit: 'visit',
      unitAmount: '50.0000',
      lineNet: '50.00',
      taxLabel: 'TVA réduite',
      lineTax: '4.50',
      adjustment: null,
      adjustedLineNet: '50.00',
      adjustedLineTax: '4.50',
    },
  ],
  subtotal: '237.66',
  taxTotal: '42.03',
  total: '279.69',
} satisfies RenderOfferRepresentationInput;

describe('illustrative Offer representation Template v2', () => {
  it('renders the v2 golden bytes and checksum in PRD 18.7 order without repricing', () => {
    const expected = readFileSync('src/offer/offer-v2.golden.txt', 'utf8')
      .replaceAll('\r\n', '\n')
      .replace(/\n$/u, '');
    const representation = renderOfferRepresentation(adjustedInput);
    expect(representation).toEqual({
      templateCode: 'OFFER_ILLUSTRATIVE',
      templateVersion: 2,
      html: expected,
      sha256:
        'd7ffa21e3b9f0ef743fc78c9396f5c849be051f429f175149a04eda9845f01aa',
    });
    expect(renderOfferRepresentation(adjustedInput)).toEqual(representation);
    const rows = representation.html.indexOf('<tbody>');
    const original = representation.html.indexOf('<td>200.00 EUR</td>', rows);
    const discount = representation.html.indexOf('Fixed discount:', rows);
    const adjusted = representation.html.indexOf('Adjusted line', rows);
    const unadjusted = representation.html.indexOf('Unadjusted follow-up');
    expect(original).toBeLessThan(discount);
    expect(discount).toBeLessThan(adjusted);
    expect(adjusted).toBeLessThan(unadjusted);
    expect(representation.html.match(/Fixed discount:/gu)).toHaveLength(1);
    expect(representation.html).not.toContain('membership-never-rendered');
    expect(representation.html).not.toContain('2026-09-30T07:00:00.000Z');
    expect(representation.html).not.toContain('<spéciale>');
  });

  it('renders unadjusted lines exactly as Template v1 rows', () => {
    const v1Row = /<tbody>(.*)<\/tbody>/u.exec(
      renderOfferRepresentation({ ...input, lines: [adjustedInput.lines[1]] })
        .html,
    )?.[1];
    expect(v1Row).toMatch(/^<tr><td>Unadjusted follow-up<\/td>/u);
    expect(renderOfferRepresentation(adjustedInput).html).toContain(
      `${v1Row ?? 'missing'}</tbody>`,
    );
  });

  it('fails closed when a v2 binding has no adjusted line', () => {
    expect(() =>
      renderOfferRepresentation({ ...input, templateVersion: 2 }),
    ).toThrow(
      'Offer Template Version 2 requires an adjusted Pricing Snapshot.',
    );
  });
});
