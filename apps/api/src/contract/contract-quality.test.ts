import { describe, expect, it } from 'vitest';
import {
  evaluateOfferQuality,
  type OfferAdjustedQualitySnapshot,
} from '../offer/offer-quality.js';
import {
  contractQualityRuleSetVersion,
  evaluateContractQuality,
  requireHeadContractVersion,
  readContractQualityResults,
  contractQualityCodes,
  type ContractQualityInput,
} from './contract-quality.js';
const CALCULATED_BY = 'membership-calculator';
const CALCULATED_AT = '2026-10-07T11:00:00.000Z';
const identity = {
  legalName: 'Synthetic party',
  taxId: 'SYNTHETIC-ID',
  legalAddress: 'Synthetic address',
};
const snapshot = {
  belongsToOffer: true,
  currency: 'EUR',
  calculatedByWorkspaceMembershipId: CALCULATED_BY,
  calculatedAt: CALCULATED_AT,
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
      netReduction: '0.00',
      taxReduction: '0.00',
      adjustedLineNet: '200.00',
      adjustedRawLineTax: '40.0000000',
      adjustedLineTax: '40.00',
    },
  ],
  subtotal: '200.00',
  taxTotal: '40.00',
  total: '240.00',
} satisfies OfferAdjustedQualitySnapshot;
const valid = {
  ruleSetVersion: 1,
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
it('C7 always warns about Precontract preliminary work without other added terms', () => {
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

// Hand-computed trace (Pricing PRD section 8.2), HALF_UP at scale 2:
// 100.0000 x 2.000 at 20.00 % = 200.00 + 40.00; minus 12.34 -> 187.66,
// raw tax 37.5320000 -> 37.53, tax reduction 2.47, total 225.19.
const adjustedLine = {
  ...snapshot.lines[0],
  adjustment: {
    type: 'FIXED_NET_DISCOUNT',
    netReduction: '12.34',
    taxReduction: '2.47',
    reason: 'Synthetic discount',
    appliedByWorkspaceMembershipId: CALCULATED_BY,
    appliedAt: CALCULATED_AT,
  },
  netReduction: '12.34',
  taxReduction: '2.47',
  adjustedLineNet: '187.66',
  adjustedRawLineTax: '37.5320000',
  adjustedLineTax: '37.53',
} satisfies OfferAdjustedQualitySnapshot['lines'][number];
const adjusted = {
  ...snapshot,
  lines: [adjustedLine],
  subtotal: '187.66',
  taxTotal: '37.53',
  total: '225.19',
} satisfies OfferAdjustedQualitySnapshot;
const adjustedValid = {
  ...valid,
  ruleSetVersion: 2,
  snapshot: adjusted,
} satisfies ContractQualityInput;

function contractCoherence(input: ContractQualityInput) {
  return evaluateContractQuality(input).find(
    (item) => item.code === 'PRICING_SNAPSHOT_COHERENT',
  )?.status;
}
function offerCoherence(snapshot: OfferAdjustedQualitySnapshot) {
  return evaluateOfferQuality({
    ruleSetVersion: 2,
    instant: valid.instant,
    validUntil: new Date('2026-10-31T00:00:00.000Z'),
    snapshot,
    previousTransmittedCurrency: null,
    recipientAvailable: true,
    recipientIdentityCurrent: true,
    recipientTaxId: 'SYNTHETIC-ID',
    pricingClientContextCoherent: true,
    provenance: 'ILLUSTRATIVE',
    provisional: true,
  }).find((item) => item.code === 'PRICING_SNAPSHOT_COHERENT')?.status;
}

describe('Contract Quality Checks rule set v2', () => {
  it('binds v2 only when the immutable Snapshot has an adjusted line', () => {
    expect(contractQualityRuleSetVersion(null)).toBe(1);
    expect(contractQualityRuleSetVersion(snapshot)).toBe(1);
    expect(contractQualityRuleSetVersion(adjusted)).toBe(2);
    expect(
      contractQualityRuleSetVersion({
        lines: [snapshot.lines[0], adjustedLine],
      }),
    ).toBe(2);
  });

  it.each([
    ['accepted Offer', valid.source],
    ['direct', { kind: 'DIRECT', companyId: 'company' }],
    ['Addendum', parent],
  ] satisfies [string, ContractQualityInput['source']][])(
    'keeps the v1 codes, severities and applicability for a %s source',
    (_name, source) => {
      const v1 = evaluateContractQuality({ ...valid, source });
      const v2 = evaluateContractQuality({ ...adjustedValid, source });
      expect(v2).toEqual(v1);
      expect(
        readContractQualityResults(
          v2,
          v1.map((item) => item.code),
        ),
      ).toEqual(v2);
    },
  );

  it('fails closed when a Snapshot is checked under the other rule set', () => {
    expect(contractCoherence({ ...valid, snapshot: adjusted })).toBe('ERROR');
    expect(contractCoherence({ ...adjustedValid, snapshot })).toBe('ERROR');
    expect(contractCoherence({ ...adjustedValid, snapshot: null })).toBe(
      'ERROR',
    );
  });

  it('requires the accepted Offer Snapshot itself, so adjustments are identical', () => {
    const price = (input: ContractQualityInput) =>
      evaluateContractQuality(input).find(
        (item) => item.code === 'PRICE_MATCHES_ACCEPTED_OFFER',
      )?.status;
    expect(price(adjustedValid)).toBe('PASS');
    // Equal amounts in another Snapshot are not the accepted Offer's price.
    expect(price({ ...adjustedValid, snapshotId: 'equal-copy' })).toBe('ERROR');
  });

  const withLine = (
    changes: Partial<OfferAdjustedQualitySnapshot['lines'][number]>,
  ): OfferAdjustedQualitySnapshot => ({
    ...adjusted,
    lines: [{ ...adjustedLine, ...changes }],
  });
  const withAdjustment = (
    changes: Partial<NonNullable<(typeof adjustedLine)['adjustment']>>,
  ) => withLine({ adjustment: { ...adjustedLine.adjustment, ...changes } });
  it.each([
    ['the adjusted subtotal', { ...adjusted, subtotal: '200.00' }],
    ['the tax total', { ...adjusted, taxTotal: '37.52' }],
    ['the total', { ...adjusted, total: '225.18' }],
    ['the line net reduction', withLine({ netReduction: '12.35' })],
    ['the line tax reduction', withLine({ taxReduction: '2.46' })],
    ['the adjusted line net', withLine({ adjustedLineNet: '187.67' })],
    ['the adjusted raw tax', withLine({ adjustedRawLineTax: '37.5330000' })],
    ['the adjusted line tax', withLine({ adjustedLineTax: '37.54' })],
    ['the original line net', withLine({ lineNet: '199.00' })],
    ['the stored net reduction', withAdjustment({ netReduction: '12.30' })],
    ['the stored tax reduction', withAdjustment({ taxReduction: '2.40' })],
    ['an empty reason', withAdjustment({ reason: ' ' })],
    [
      'the applying actor',
      withAdjustment({ appliedByWorkspaceMembershipId: 'other' }),
    ],
    [
      'the applying instant',
      withAdjustment({ appliedAt: '2026-10-07T11:00:01.000Z' }),
    ],
    ['a foreign Opportunity', { ...adjusted, belongsToOffer: false }],
    ['a mixed currency', withLine({ currency: 'MDL' })],
  ])(
    'records ERROR for a tampered %s, exactly as Offer v2 coherence does',
    (_name, tampered) => {
      expect(contractCoherence({ ...adjustedValid, snapshot: tampered })).toBe(
        'ERROR',
      );
      expect(offerCoherence(tampered)).toBe('ERROR');
    },
  );

  it('agrees with Offer v2 coherence on the coherent trace and never writes to it', () => {
    const before = structuredClone(adjusted);
    expect(contractCoherence(adjustedValid)).toBe('PASS');
    expect(offerCoherence(adjusted)).toBe('PASS');
    expect(adjusted).toEqual(before);
  });
});
