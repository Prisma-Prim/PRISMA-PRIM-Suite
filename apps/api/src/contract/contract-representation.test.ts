import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  renderContractRepresentation,
  renderAddendumRepresentation,
  ADDENDUM_CLAUSE_VERSIONS,
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

describe('Exact illustrative Addendum representation', () => {
  const addendum: Parameters<typeof renderAddendumRepresentation>[0] = {
    templateCode: 'ADDENDUM_ILLUSTRATIVE',
    templateVersion: 1,
    clauseVersions: ADDENDUM_CLAUSE_VERSIONS,
    illustrativeReference: 7,
    versionNumber: 1,
    issuingCompanyLabel: input.issuingCompanyLabel,
    recipient: input.recipient,
    createdAt: input.createdAt,
    parent: {
      id: 'synthetic-parent',
      kind: 'CONTRACT',
      illustrativeReference: 4,
      versionNumber: 2,
    },
    ordinal: 3,
    changeSummary: '  Change <script> & scope\nexact  ',
    termEndsOn: null,
    snapshot: null,
  };
  it('matches literal golden bytes and digest with absent optional price and exact escaped change', () => {
    const expected = readFileSync('src/contract/addendum-v1.golden.txt', 'utf8')
      .replaceAll('\r\n', '\n')
      .replace(/\n$/u, '');
    const result = renderAddendumRepresentation(addendum);
    expect(result.html).toBe(expected);
    expect(result.sha256).toBe(
      'bf8f1eb94a1f5edf0cca791ede888e34f168eaa726fb09ec5ee62a3621c1b17b',
    );
    expect(renderAddendumRepresentation(addendum)).toEqual(result);
    expect(result.html).not.toContain('<dd>0.00');
  });
  it('renders only bound immutable price strings and supports JSON object key order', () => {
    const result = renderAddendumRepresentation({
      ...addendum,
      clauseVersions: ADDENDUM_CLAUSE_VERSIONS.map((entry) => ({
        version: entry.version,
        code: entry.code,
      })),
      snapshot: {
        id: 'synthetic-snapshot',
        currency: input.currency,
        subtotal: input.subtotal,
        taxTotal: input.taxTotal,
        total: input.total,
        lines: input.lines,
      },
      termEndsOn: '2026-12-31',
    });
    expect(result.html).toContain(
      '<dt>Pricing Snapshot id</dt><dd>synthetic-snapshot</dd>',
    );
    expect(result.html).toContain('<dt>Total</dt><dd>431.25 EUR</dd>');
    expect(result.html).toContain('<dt>Quantity</dt><dd>1.2500</dd>');
    expect(result.html).toContain('<dt>New term end</dt><dd>2026-12-31</dd>');
  });
  it.each([
    { templateCode: 'CONTRACT_ILLUSTRATIVE' },
    { templateVersion: 2 },
    { clauseVersions: null },
    { clauseVersions: [...ADDENDUM_CLAUSE_VERSIONS].reverse() },
    {
      clauseVersions: ADDENDUM_CLAUSE_VERSIONS.map((entry) => ({
        ...entry,
        extra: true,
      })),
    },
  ])('refuses unsupported bindings %j', (binding) => {
    expect(() =>
      renderAddendumRepresentation({ ...addendum, ...binding }),
    ).toThrow('Unsupported');
  });
});

it('C9 renders direct source and exact entered content deterministically without an Offer', () => {
  const direct = {
    ...input,
    sourceOffer: null,
    scopeNote: 'Direct <scope>\nkept exactly',
    commercialConditions: 'Direct & conditions',
  };
  const rendered = renderContractRepresentation(direct);
  expect(rendered.html).toBe(
    readFileSync('src/contract/contract-direct-v1.golden.txt', 'utf8')
      .replaceAll('\r\n', '\n')
      .replace(/\n$/u, ''),
  );
  expect(rendered.sha256).toBe(
    '9880d0fd7eb3cceb199d22705de487b8e4b9898f08691ff3df2b7fcadd733499',
  );
  expect(renderContractRepresentation(direct)).toEqual(rendered);
  expect(rendered.html).toContain('<dt>Source</dt><dd>Direct origin</dd>');
  expect(rendered.html).toContain('Direct &lt;scope&gt;\nkept exactly');
  expect(rendered.html).toContain('Direct &amp; conditions');
  expect(rendered.html).not.toContain('Accepted Offer');
  expect(rendered.html).toContain('Illustrative');
});
