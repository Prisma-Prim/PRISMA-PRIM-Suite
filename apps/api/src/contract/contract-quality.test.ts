import { expect, it } from 'vitest';
import {
  evaluateContractQuality,
  requireHeadContractVersion,
  readContractQualityResults,
  contractQualityCodes,
  type ContractQualityInput,
} from './contract-quality.js';
const identity = {
  legalName: 'Synthetic party',
  taxId: 'SYNTHETIC-ID',
  legalAddress: 'Synthetic address',
};
const snapshot = {
  belongsToOffer: true,
  currency: 'EUR',
  lines: [
    {
      currency: 'EUR',
      unitAmount: '100.0000',
      quantity: '2.000',
      taxRatePercent: '20.00',
      rawLineAmount: '200.0000000',
      lineNet: '200.00',
      rawLineTax: '40.0000000',
      lineTax: '40.00',
      adjustment: null,
    },
  ],
  subtotal: '200.00',
  taxTotal: '40.00',
  total: '240.00',
};
const valid = {
  instant: new Date('2026-10-07T23:59:59.999Z'),
  companyId: 'company',
  partyKey: 'PRIMARY:client',
  identity,
  partyAvailable: true,
  partyIdentityCurrent: true,
  snapshotId: 'price',
  snapshot,
  scopeNote: 'Scope',
  commercialConditions: 'Terms',
  termStartsOn: null,
  termEndsOn: null,
  specialConditions: null,
  preliminaryWork: null,
  provenance: 'ILLUSTRATIVE',
  provisional: true,
  source: {
    kind: 'ACCEPTED_OFFER',
    companyId: 'company',
    partyKey: 'PRIMARY:client',
    identity,
    snapshotId: 'price',
    scopeNote: 'Scope',
    commercialConditions: 'Terms',
  },
} satisfies ContractQualityInput;
it('evaluates every accepted-source rule including construction-guaranteed concordance', () => {
  expect(evaluateContractQuality(valid)).toEqual([
    { code: 'SOURCE_COMPANY_MATCHES', status: 'PASS' },
    { code: 'PARTY_AVAILABLE', status: 'PASS' },
    { code: 'PARTY_MATCHES_SOURCE', status: 'PASS' },
    { code: 'PARTY_IDENTITY_MATCHES_SOURCE', status: 'PASS' },
    { code: 'PARTY_IDENTITY_CURRENT', status: 'PASS' },
    { code: 'PARTY_TAX_ID_RECORDED', status: 'PASS' },
    { code: 'PRICE_MATCHES_ACCEPTED_OFFER', status: 'PASS' },
    { code: 'PRICING_SNAPSHOT_COHERENT', status: 'PASS' },
    { code: 'CONDITIONS_MATCH_ACCEPTED_OFFER', status: 'PASS' },
    { code: 'ADDED_CONDITIONS_CONFIRMED', status: 'PASS' },
    { code: 'PROVISIONAL_MARKER_PRESENT', status: 'PASS' },
  ]);
});
it.each([
  ['SOURCE_COMPANY_MATCHES', { companyId: 'another' }, 'ERROR'],
  ['PARTY_AVAILABLE', { partyAvailable: false }, 'ERROR'],
  ['PARTY_MATCHES_SOURCE', { partyKey: 'PRIMARY:another' }, 'ERROR'],
  [
    'PARTY_IDENTITY_MATCHES_SOURCE',
    { identity: { ...identity, legalName: 'Different recorded name' } },
    'WARNING',
  ],
  ['PARTY_IDENTITY_CURRENT', { partyIdentityCurrent: false }, 'WARNING'],
  [
    'PARTY_TAX_ID_RECORDED',
    { identity: { ...identity, taxId: null } },
    'ERROR',
  ],
  ['PRICE_MATCHES_ACCEPTED_OFFER', { snapshotId: 'another' }, 'ERROR'],
  [
    'PRICING_SNAPSHOT_COHERENT',
    { snapshot: { ...snapshot, total: '239.99' } },
    'ERROR',
  ],
  ['CONDITIONS_MATCH_ACCEPTED_OFFER', { scopeNote: 'Changed' }, 'ERROR'],
  [
    'CONDITIONS_MATCH_ACCEPTED_OFFER',
    { commercialConditions: 'Changed' },
    'ERROR',
  ],
  ['ADDED_CONDITIONS_CONFIRMED', { termStartsOn: '2026-10-07' }, 'WARNING'],
  ['ADDED_CONDITIONS_CONFIRMED', { termEndsOn: '2026-10-07' }, 'WARNING'],
  [
    'ADDED_CONDITIONS_CONFIRMED',
    { specialConditions: 'Additional terms' },
    'WARNING',
  ],
  ['PROVISIONAL_MARKER_PRESENT', { provenance: 'REAL' }, 'ERROR'],
  ['PROVISIONAL_MARKER_PRESENT', { provisional: false }, 'ERROR'],
] satisfies [string, Partial<ContractQualityInput>, string][])(
  'records the canonical failure for %s',
  (code, changes, status) => {
    expect(
      evaluateContractQuality({ ...valid, ...changes }).find(
        (item) => item.code === code,
      ),
    ).toEqual({ code, status });
  },
);
it.each([
  'legalName',
  'taxId',
  'legalAddress',
] satisfies (keyof typeof identity)[])(
  'compares the source identity field %s independently',
  (field) => {
    expect(
      evaluateContractQuality({
        ...valid,
        source: {
          ...valid.source,
          identity: { ...identity, [field]: 'Changed source' },
        },
      }).find((item) => item.code === 'PARTY_IDENTITY_MATCHES_SOURCE'),
    ).toEqual({ code: 'PARTY_IDENTITY_MATCHES_SOURCE', status: 'WARNING' });
  },
);
it('warns about added preliminary work without adding a runtime Precontract route', () => {
  expect(
    evaluateContractQuality({
      ...valid,
      preliminaryWork: 'Bounded preliminary work',
    }).find((item) => item.code === 'ADDED_CONDITIONS_CONFIRMED'),
  ).toEqual({ code: 'ADDED_CONDITIONS_CONFIRMED', status: 'WARNING' });
});
it.each([
  ['2026-10-07T00:00:00.000Z', '2026-10-07', 'PASS'],
  ['2026-10-07T23:59:59.999Z', '2026-10-07', 'PASS'],
  ['2026-10-08T00:00:00.000Z', '2026-10-07', 'WARNING'],
  ['2026-10-07T00:00:00.000Z', '2026-10-06', 'WARNING'],
  ['2026-10-07T23:59:59.999Z', '2026-10-08', 'PASS'],
])('uses the UTC date at %s for term end %s', (instant, termEndsOn, status) => {
  expect(
    evaluateContractQuality({
      ...valid,
      instant: new Date(instant),
      termEndsOn,
    }).find((item) => item.code === 'TERM_END_NOT_PASSED'),
  ).toEqual({ code: 'TERM_END_NOT_PASSED', status });
});
it('applies only direct-origin rules with no referenced price or term', () => {
  expect(
    evaluateContractQuality({
      ...valid,
      source: { kind: 'DIRECT', companyId: 'company' },
      snapshotId: null,
      snapshot: null,
    }),
  ).toEqual([
    { code: 'SOURCE_COMPANY_MATCHES', status: 'PASS' },
    { code: 'PARTY_AVAILABLE', status: 'PASS' },
    { code: 'PARTY_IDENTITY_CURRENT', status: 'PASS' },
    { code: 'PARTY_TAX_ID_RECORDED', status: 'PASS' },
    { code: 'DIRECT_ORIGIN_REVIEWED', status: 'WARNING' },
    { code: 'PROVISIONAL_MARKER_PRESENT', status: 'PASS' },
  ]);
});
const parent = {
  kind: 'ADDENDUM',
  companyId: 'company',
  partyKey: 'PRIMARY:client',
  identity,
  parentKind: 'PRECONTRACT',
  parentExecutionState: 'EXECUTED',
  currency: 'EUR',
} satisfies ContractQualityInput['source'];
it('applies parent checks and optional currency concordance only to Addenda', () => {
  expect(evaluateContractQuality({ ...valid, source: parent })).toEqual([
    { code: 'SOURCE_COMPANY_MATCHES', status: 'PASS' },
    { code: 'PARTY_AVAILABLE', status: 'PASS' },
    { code: 'PARTY_MATCHES_SOURCE', status: 'PASS' },
    { code: 'PARTY_IDENTITY_MATCHES_SOURCE', status: 'PASS' },
    { code: 'PARTY_IDENTITY_CURRENT', status: 'PASS' },
    { code: 'PARTY_TAX_ID_RECORDED', status: 'PASS' },
    { code: 'PRICING_SNAPSHOT_COHERENT', status: 'PASS' },
    { code: 'PARENT_EXECUTED', status: 'PASS' },
    { code: 'CURRENCY_MATCHES_PARENT', status: 'PASS' },
    { code: 'PROVISIONAL_MARKER_PRESENT', status: 'PASS' },
  ]);
  expect(
    evaluateContractQuality({
      ...valid,
      source: parent,
      snapshotId: null,
      snapshot: null,
    }).map((item) => item.code),
  ).toEqual([
    'SOURCE_COMPANY_MATCHES',
    'PARTY_AVAILABLE',
    'PARTY_MATCHES_SOURCE',
    'PARTY_IDENTITY_MATCHES_SOURCE',
    'PARTY_IDENTITY_CURRENT',
    'PARTY_TAX_ID_RECORDED',
    'PARENT_EXECUTED',
    'PROVISIONAL_MARKER_PRESENT',
  ]);
});
it.each([
  { ...parent, parentExecutionState: 'NOT_EXECUTED' },
  { ...parent, parentKind: 'ADDENDUM' },
] satisfies ContractQualityInput['source'][])(
  'refuses an unexecuted or ineligible constructed parent',
  (source) => {
    expect(
      evaluateContractQuality({ ...valid, source }).find(
        (item) => item.code === 'PARENT_EXECUTED',
      ),
    ).toEqual({ code: 'PARENT_EXECUTED', status: 'ERROR' });
  },
);
it('warns about a changed parent currency', () => {
  expect(
    evaluateContractQuality({
      ...valid,
      source: { ...parent, currency: 'MDL' },
    }).find((item) => item.code === 'CURRENCY_MATCHES_PARENT'),
  ).toEqual({ code: 'CURRENCY_MATCHES_PARENT', status: 'WARNING' });
});
it.each([
  null,
  { ...snapshot, belongsToOffer: false },
  { ...snapshot, lines: [] },
  { ...snapshot, subtotal: '199.99' },
  { ...snapshot, taxTotal: '39.99' },
  { ...snapshot, lines: [{ ...snapshot.lines[0], currency: 'MDL' }] },
  {
    ...snapshot,
    lines: [{ ...snapshot.lines[0], rawLineAmount: '199.0000000' }],
  },
  { ...snapshot, lines: [{ ...snapshot.lines[0], lineTax: '39.99' }] },
])('rejects an absent or incoherent immutable price trace', (snapshot) => {
  expect(
    evaluateContractQuality({ ...valid, snapshot }).find(
      (item) => item.code === 'PRICING_SNAPSHOT_COHERENT',
    ),
  ).toEqual({ code: 'PRICING_SNAPSHOT_COHERENT', status: 'ERROR' });
});

it.each([null, [], [{ code: 'UNKNOWN', status: 'PASS' }]])(
  'rejects incomplete or unknown persisted results',
  (value) => {
    expect(() =>
      readContractQualityResults(value, contractQualityCodes(null)),
    ).toThrow();
  },
);
it('rejects wrong severity, extra fields and reordered persisted results', () => {
  const results = evaluateContractQuality(valid);
  for (const replacement of [
    { code: 'SOURCE_COMPANY_MATCHES', status: 'WARNING' },
    { code: 'PARTY_AVAILABLE', status: 'PASS' },
    {
      code: 'SOURCE_COMPANY_MATCHES',
      status: 'PASS',
      identity: 'Hidden live identity',
    },
  ])
    expect(() =>
      readContractQualityResults(
        [replacement, ...results.slice(1)],
        contractQualityCodes(null),
      ),
    ).toThrow();
  expect(() =>
    readContractQualityResults(results, contractQualityCodes('2026-10-07')),
  ).toThrow();
});

it('refuses a constructed superseded target with the canonical command policy', () => {
  expect(() =>
    requireHeadContractVersion({
      versionId: 'older',
      headVersionId: 'current',
    }),
  ).toThrowError(
    expect.objectContaining({
      response: expect.objectContaining({
        code: 'CONTRACT_VERSION_SUPERSEDED',
      }),
    }),
  );
  expect(() =>
    requireHeadContractVersion({
      versionId: 'current',
      headVersionId: 'current',
    }),
  ).not.toThrow();
});

it('C9 validates persisted direct results and never accepts a PASS for the required review', () => {
  const results = evaluateContractQuality({
      ...valid,
      source: { kind: 'DIRECT', companyId: 'company' },
    }),
    codes = contractQualityCodes(null, { kind: 'DIRECT' });
  expect(readContractQualityResults(results, codes)).toEqual(results);
  expect(() =>
    readContractQualityResults(
      results.map((item) =>
        item.code === 'DIRECT_ORIGIN_REVIEWED'
          ? { ...item, status: 'PASS' }
          : item,
      ),
      codes,
    ),
  ).toThrow();
  expect(results.map((item) => item.code)).not.toContain(
    'PRICE_MATCHES_ACCEPTED_OFFER',
  );
});
