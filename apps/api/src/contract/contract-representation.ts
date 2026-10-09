import { createHash } from 'node:crypto';
import type { PricingSnapshotLineRecord } from '../pricing-configuration/pricing-snapshot.types.js';

export const CONTRACT_TEMPLATE_CODE = 'CONTRACT_ILLUSTRATIVE';
export const CONTRACT_TEMPLATE_VERSION = 1;
export const CONTRACT_CLAUSE_VERSIONS = [
  { code: 'CL_SUBJECT', version: 1 },
  { code: 'CL_PRICE', version: 1 },
  { code: 'CL_TERM', version: 1 },
  { code: 'CL_CONDITIONS', version: 1 },
  { code: 'CL_GENERAL', version: 1 },
] as const;
export const ADDENDUM_CLAUSE_VERSIONS = [
  { code: 'CL_SUBJECT', version: 1 },
  { code: 'CL_PRICE', version: 1 },
  { code: 'CL_TERM', version: 1 },
  { code: 'CL_CONDITIONS', version: 1 },
  { code: 'CL_CHANGE', version: 1 },
  { code: 'CL_GENERAL', version: 1 },
] as const;

type RepresentationLine = Pick<
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
export interface RenderContractRepresentationInput {
  readonly templateCode: string;
  readonly templateVersion: number;
  readonly clauseVersions: unknown;
  readonly illustrativeReference: number;
  readonly versionNumber: number;
  readonly issuingCompanyLabel: string;
  readonly recipient: {
    readonly legalName: string;
    readonly taxId: string | null;
    readonly legalAddress: string | null;
  };
  readonly createdAt: string;
  readonly sourceOffer: null | {
    readonly illustrativeReference: number;
    readonly versionNumber: number;
  };
  readonly pricingSnapshotId: string;
  readonly lines: ReadonlyArray<RepresentationLine>;
  readonly subtotal: string;
  readonly taxTotal: string;
  readonly total: string;
  readonly currency: string;
  readonly scopeNote: string | null;
  readonly commercialConditions: string | null;
  readonly termStartsOn: string | null;
  readonly termEndsOn: string | null;
  readonly specialConditions: string | null;
  readonly provenance: 'ILLUSTRATIVE';
}

export function renderContractRepresentation(
  input: RenderContractRepresentationInput,
) {
  // Persisted JSON is validated here once; no unknown generation version can render.
  if (
    input.templateCode !== CONTRACT_TEMPLATE_CODE ||
    input.templateVersion !== CONTRACT_TEMPLATE_VERSION ||
    !supportedClauses(input.clauseVersions)
  )
    throw new Error('The stored Contract generation binding is unsupported.');
  const currency = escapeHtml(input.currency);
  const rows = input.lines
    .map((line) => {
      const original = `<tr><td>${escapeHtml(line.serviceName)}</td><td>${escapeHtml(line.quantity)}</td><td>${escapeHtml(line.unit)}</td><td>${escapeHtml(line.unitAmount)} ${currency}</td><td>${escapeHtml(line.lineNet)} ${currency}</td><td>${escapeHtml(line.taxLabel)}</td><td>${escapeHtml(line.lineTax)} ${currency}</td></tr>`;
      if (line.adjustment === null) return original;
      return (
        original +
        `<tr><td colspan="4">Fixed discount: ${escapeHtml(line.adjustment.reason)}</td><td>${escapeHtml(line.adjustment.netReduction)} ${currency}</td><td>Tax reduction</td><td>${escapeHtml(line.adjustment.taxReduction)} ${currency}</td></tr><tr><td colspan="4">Adjusted line</td><td>${escapeHtml(line.adjustedLineNet)} ${currency}</td><td>Adjusted tax</td><td>${escapeHtml(line.adjustedLineTax)} ${currency}</td></tr>`
      );
    })
    .join('');
  const html = [
    '<!doctype html>',
    '<html lang="en">',
    `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Illustrative Contract</title><style>*,*::before,*::after{box-sizing:border-box}body{margin:0;padding:1rem;font-family:system-ui,sans-serif;color:#172033}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{padding:.5rem;text-align:left;vertical-align:top;border:1px solid #cbd5e1;overflow-wrap:anywhere}dl{display:grid;grid-template-columns:minmax(8rem,1fr) 2fr;gap:.5rem 1rem}dt{font-weight:700}dd{margin:0;overflow-wrap:anywhere}p,dd{white-space:pre-wrap}section{margin-block:1.5rem}@media(max-width:30rem){dl{grid-template-columns:1fr}th,td{font-size:.75rem;padding:.25rem}}</style></head>`,
    '<body>',
    '<article aria-labelledby="contract-title">',
    '<header><p><strong>Provisional illustrative document — cannot be accepted — no legal effect — no official number — not a signed agreement — clauses are placeholders</strong></p><h1 id="contract-title">Illustrative Contract</h1></header>',
    `<section aria-labelledby="contract-details-title"><h2 id="contract-details-title">Contract details</h2><dl>${details(
      [
        ['Issuing Company', input.issuingCompanyLabel],
        ['Recipient legal name', input.recipient.legalName],
        ['Recipient tax ID', input.recipient.taxId],
        ['Recipient legal address', input.recipient.legalAddress],
        [
          'Illustrative Contract reference',
          String(input.illustrativeReference),
        ],
        ['Contract Version', String(input.versionNumber)],
        ['Created at', input.createdAt],
        ...(input.sourceOffer
          ? ([
              [
                'Source accepted Offer reference',
                String(input.sourceOffer.illustrativeReference),
              ],
              [
                'Source accepted Offer Version',
                String(input.sourceOffer.versionNumber),
              ],
            ] satisfies [string, string][])
          : ([['Source', 'Direct origin']] satisfies [string, string][])),
        ['Precontract reference', null],
      ],
    )}</dl></section>`,
    clause(
      'CL_SUBJECT',
      'Subject',
      `<dl>${details([[input.sourceOffer ? 'Accepted scope' : 'Scope', input.scopeNote]])}</dl>`,
    ),
    clause(
      'CL_PRICE',
      'Price',
      `<table><thead><tr><th scope="col">Service name</th><th scope="col">Quantity</th><th scope="col">Unit</th><th scope="col">Unit amount</th><th scope="col">Line net</th><th scope="col">Tax label</th><th scope="col">Line tax</th></tr></thead><tbody>${rows}</tbody></table><dl>${details(
        [
          ['Subtotal', input.subtotal + ' ' + input.currency],
          ['Tax total', input.taxTotal + ' ' + input.currency],
          ['Total', input.total + ' ' + input.currency],
          ['Currency', input.currency],
        ],
      )}</dl>`,
    ),
    clause(
      'CL_TERM',
      'Term',
      `<dl>${details([
        ['Term start', input.termStartsOn],
        ['Term end', input.termEndsOn],
      ])}</dl>`,
    ),
    clause(
      'CL_CONDITIONS',
      'Conditions',
      `<dl>${details([
        [
          input.sourceOffer
            ? 'Accepted commercial conditions'
            : 'Commercial conditions',
          input.commercialConditions,
        ],
        ['Special conditions', input.specialConditions],
      ])}</dl>`,
    ),
    clause('CL_GENERAL', 'General', ''),
    `<footer><dl>${details([
      ['Template Version', 'CONTRACT_ILLUSTRATIVE v1 (unapproved)'],
      [
        'Clause Versions',
        'CL_SUBJECT v1, CL_PRICE v1, CL_TERM v1, CL_CONDITIONS v1, CL_GENERAL v1',
      ],
      ['Pricing Snapshot id', input.pricingSnapshotId],
      ['Provenance', input.provenance],
    ])}</dl></footer>`,
    '</article>',
    '</body>',
    '</html>',
  ].join('\n');
  return {
    templateCode: CONTRACT_TEMPLATE_CODE,
    templateVersion: CONTRACT_TEMPLATE_VERSION,
    clauseVersions: CONTRACT_CLAUSE_VERSIONS,
    html,
    sha256: createHash('sha256').update(html, 'utf8').digest('hex'),
  };
}
function supportedClauses(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === CONTRACT_CLAUSE_VERSIONS.length &&
    value.every((entry: unknown, index) => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
        return false;
      const expected = CONTRACT_CLAUSE_VERSIONS[index];
      return (
        expected !== undefined &&
        'code' in entry &&
        entry.code === expected.code &&
        'version' in entry &&
        entry.version === expected.version &&
        Object.keys(entry).length === 2
      );
    })
  );
}
export function renderAddendumRepresentation(input: {
  templateCode: string;
  templateVersion: number;
  clauseVersions: unknown;
  illustrativeReference: number;
  versionNumber: number;
  issuingCompanyLabel: string;
  recipient: RenderContractRepresentationInput['recipient'];
  createdAt: string;
  parent: {
    id: string;
    illustrativeReference: number;
    versionNumber: number;
    kind: string;
  };
  ordinal: number;
  changeSummary: string;
  termEndsOn: string | null;
  snapshot:
    | (Pick<
        RenderContractRepresentationInput,
        'currency' | 'subtotal' | 'taxTotal' | 'total' | 'lines'
      > & { id: string })
    | null;
}) {
  if (
    input.templateCode !== 'ADDENDUM_ILLUSTRATIVE' ||
    input.templateVersion !== 1 ||
    !supportedAddendumClauses(input.clauseVersions)
  )
    throw new Error('Unsupported Addendum generation binding.');
  const snapshot = input.snapshot;
  const html = [
    '<!doctype html>',
    '<html lang="en">',
    `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Illustrative Addendum</title><style>body{padding:1rem;font-family:system-ui,sans-serif;color:#172033}p,dd{white-space:pre-wrap;overflow-wrap:anywhere}dt{font-weight:700}dd{margin:0 0 .75rem}section{margin-block:1.5rem}</style></head>`,
    '<body><article aria-labelledby="contract-title">',
    '<header><p><strong>Provisional illustrative document — cannot be accepted — no legal effect — no official number — not a signed agreement — clauses are placeholders</strong></p><h1 id="contract-title">Illustrative Addendum</h1></header>',
    `<section><h2>Addendum details</h2><dl>${details([
      ['Parent kind', input.parent.kind],
      ['Parent Contract id', input.parent.id],
      [
        'Parent illustrative reference',
        String(input.parent.illustrativeReference),
      ],
      ['Parent executed version', String(input.parent.versionNumber)],
      ['Addendum ordinal', String(input.ordinal)],
      ['Issuing Company', input.issuingCompanyLabel],
      ['Recipient legal name', input.recipient.legalName],
      ['Recipient tax ID', input.recipient.taxId],
      ['Recipient legal address', input.recipient.legalAddress],
      ['Illustrative Addendum reference', String(input.illustrativeReference)],
      ['Contract Version', String(input.versionNumber)],
      ['Created at', input.createdAt],
    ])}</dl></section>`,
    clause(
      'CL_SUBJECT',
      'Subject',
      `<dl>${details([['Parent agreement', input.parent.id]])}</dl>`,
    ),
    clause(
      'CL_PRICE',
      'Price',
      snapshot === null
        ? '<p>No Pricing Snapshot referenced.</p>'
        : `<dl>${details([
            ['Pricing Snapshot id', snapshot.id],
            ['Subtotal', snapshot.subtotal + ' ' + snapshot.currency],
            ['Tax total', snapshot.taxTotal + ' ' + snapshot.currency],
            ['Total', snapshot.total + ' ' + snapshot.currency],
            ['Currency', snapshot.currency],
          ])}</dl>${snapshot.lines
            .map(
              (line) =>
                `<dl>${details([
                  ['Service name', line.serviceName],
                  ['Quantity', line.quantity],
                  ['Unit', line.unit],
                  ['Unit amount', line.unitAmount],
                  ['Line net', line.lineNet],
                  ['Tax label', line.taxLabel],
                  ['Line tax', line.lineTax],
                  ['Adjustment reason', line.adjustment?.reason ?? null],
                  ['Adjusted line net', line.adjustedLineNet],
                  ['Adjusted line tax', line.adjustedLineTax],
                ])}</dl>`,
            )
            .join('')}`,
    ),
    clause(
      'CL_TERM',
      'Term',
      `<dl>${details([['New term end', input.termEndsOn]])}</dl>`,
    ),
    clause('CL_CONDITIONS', 'Conditions', ''),
    clause(
      'CL_CHANGE',
      'Change',
      `<dl>${details([['Change summary', input.changeSummary]])}</dl>`,
    ),
    clause('CL_GENERAL', 'General', ''),
    `<footer><dl>${details([
      ['Template Version', 'ADDENDUM_ILLUSTRATIVE v1 (unapproved)'],
      [
        'Clause Versions',
        ADDENDUM_CLAUSE_VERSIONS.map(
          (entry) => entry.code + ' v' + String(entry.version),
        ).join(', '),
      ],
      ['Pricing Snapshot id', snapshot?.id ?? null],
      ['Provenance', 'ILLUSTRATIVE'],
    ])}</dl></footer>`,
    '</article></body>',
    '</html>',
  ].join('\n');
  return {
    templateCode: 'ADDENDUM_ILLUSTRATIVE',
    templateVersion: 1,
    clauseVersions: ADDENDUM_CLAUSE_VERSIONS,
    html,
    sha256: createHash('sha256').update(html, 'utf8').digest('hex'),
  };
}
function clause(code: string, title: string, content: string) {
  return `<section aria-labelledby="${code}"><h2 id="${code}">${title} — ${code} v1</h2><p>No approved legal wording exists for this clause. This is an illustrative placeholder.</p>${content}</section>`;
}
function details(values: ReadonlyArray<readonly [string, string | null]>) {
  return values
    .map(
      ([label, value]) =>
        `<dt>${label}</dt><dd>${value === null ? 'Not recorded' : escapeHtml(value)}</dd>`,
    )
    .join('');
}
function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function supportedAddendumClauses(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length === ADDENDUM_CLAUSE_VERSIONS.length &&
    value.every((entry: unknown, index) => {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
        return false;
      const expected = ADDENDUM_CLAUSE_VERSIONS[index];
      return (
        expected !== undefined &&
        'code' in entry &&
        entry.code === expected.code &&
        'version' in entry &&
        entry.version === expected.version &&
        Object.keys(entry).length === 2
      );
    })
  );
}
