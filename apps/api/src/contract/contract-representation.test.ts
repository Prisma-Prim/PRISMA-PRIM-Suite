import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  renderContractRepresentation,
  type RenderContractRepresentationInput,
} from './contract-representation.js';

// Worked synthetic fixture: expected bytes are a reviewed literal, not a renderer snapshot.
const input: RenderContractRepresentationInput = {
  templateCode: 'CONTRACT_ILLUSTRATIVE',
  templateVersion: 1,
  clauseVersions: [
    { code: 'CL_SUBJECT', version: 1 },
    { code: 'CL_PRICE', version: 1 },
    { code: 'CL_TERM', version: 1 },
    { code: 'CL_CONDITIONS', version: 1 },
    { code: 'CL_GENERAL', version: 1 },
  ],
  illustrativeReference: 7,
  versionNumber: 1,
  issuingCompanyLabel: 'Provider & Co',
  recipient: {
    legalName: '<script>alert("x")</script>',
    taxId: null,
    legalAddress: "1 'Example' Street",
  },
  createdAt: '2026-09-27T09:00:00.000Z',
  sourceOffer: { illustrativeReference: 4, versionNumber: 2 },
  pricingSnapshotId: 'snapshot-golden',
  lines: [
    {
      serviceName: 'Audit & advice',
      quantity: '1.2500',
      unit: 'day',
      unitAmount: '300.0000',
      lineNet: '375.00',
      taxLabel: 'Tax <15%>',
      lineTax: '56.25',
      adjustment: null,
      adjustedLineNet: '375.00',
      adjustedLineTax: '56.25',
    },
  ],
  subtotal: '375.00',
  taxTotal: '56.25',
  total: '431.25',
  currency: 'EUR',
  scopeNote: 'Scope <img src=x onerror=alert(1)>',
  commercialConditions: null,
  termStartsOn: '2026-10-01',
  termEndsOn: null,
  specialConditions: 'Line one\nLine two & three',
  provenance: 'ILLUSTRATIVE',
};
describe('Exact illustrative Contract representation', () => {
  it('matches independently specified bytes and digest, with ordered placeholders, escaping and absent values', () => {
    const expected = readFileSync('src/contract/contract-v1.golden.txt', 'utf8')
      .replaceAll('\r\n', '\n')
      .replace(/\n$/u, '');
    const representation = renderContractRepresentation(input);
    expect(representation.html).toBe(expected);
    expect(representation.sha256).toBe(
      '8b971e49b4800807b911eb1770a332c13c5ad5e0c97768b83cf92f8558b2b5c0',
    );
    expect(renderContractRepresentation(input)).toEqual(representation);
    expect(representation.html).not.toContain('Draft — not approved');
  });
  it('renders stored adjustment strings and escaped reason adjacent to original and adjusted lines without recalculation', () => {
    const line = input.lines[0];
    if (!line) throw new Error('Missing worked line');
    const representation = renderContractRepresentation({
      ...input,
      lines: [
        {
          ...line,
          adjustment: {
            type: 'FIXED_NET_DISCOUNT',
            netReduction: '25.00',
            taxReduction: '3.75',
            reason: '<b>Courtesy & reduction</b>',
            appliedByWorkspaceMembershipId: 'synthetic-member',
            appliedAt: '2026-09-27T08:00:00.000Z',
          },
          adjustedLineNet: '350.00',
          adjustedLineTax: '52.50',
        },
      ],
      subtotal: '350.00',
      taxTotal: '52.50',
      total: '402.50',
    });
    expect(representation.html).toContain(
      '<td>375.00 EUR</td><td>Tax &lt;15%&gt;</td><td>56.25 EUR</td></tr><tr><td colspan="4">Fixed discount: &lt;b&gt;Courtesy &amp; reduction&lt;/b&gt;</td><td>25.00 EUR</td><td>Tax reduction</td><td>3.75 EUR</td></tr><tr><td colspan="4">Adjusted line</td><td>350.00 EUR</td><td>Adjusted tax</td><td>52.50 EUR</td></tr>',
    );
    expect(representation.html).toContain('<dt>Total</dt><dd>402.50 EUR</dd>');
  });
  it.each([
    { templateCode: 'UNKNOWN' },
    { templateVersion: 2 },
    { clauseVersions: null },
    { clauseVersions: [{ code: 'CL_SUBJECT', version: 2 }] },
    {
      clauseVersions: [
        { code: 'CL_GENERAL', version: 1 },
        { code: 'CL_CONDITIONS', version: 1 },
        { code: 'CL_TERM', version: 1 },
        { code: 'CL_PRICE', version: 1 },
        { code: 'CL_SUBJECT', version: 1 },
      ],
    },
    {
      clauseVersions: [
        { code: 'CL_SUBJECT', version: 1, unexpected: true },
        { code: 'CL_PRICE', version: 1 },
        { code: 'CL_TERM', version: 1 },
        { code: 'CL_CONDITIONS', version: 1 },
        { code: 'CL_GENERAL', version: 1 },
      ],
    },
  ])('fails closed for unsupported stored bindings %j', (binding) => {
    expect(() =>
      renderContractRepresentation({ ...input, ...binding }),
    ).toThrow('unsupported');
  });
});
