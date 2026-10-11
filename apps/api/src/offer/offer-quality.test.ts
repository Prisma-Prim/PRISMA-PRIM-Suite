import { describe, expect, it } from 'vitest';
import {
  coherentSnapshot,
  evaluateOfferQuality,
  OFFER_QUALITY_CODES,
  requireHeadOfferVersion,
  type OfferAdjustedQualitySnapshot,
  type OfferQualityInput,
} from './offer-quality.js';

const CALCULATED_BY = 'membership-calculator';
const CALCULATED_AT = '2026-10-03T11:00:00.000Z';

const valid = {
  ruleSetVersion: 1,
  instant: new Date('2026-10-03T12:00:00.000Z'),
  validUntil: new Date('2026-10-03T12:00:00.001Z'),
  snapshot: {
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
  },
  previousTransmittedCurrency: null,
  recipientAvailable: true,
  recipientIdentityCurrent: true,
  recipientTaxId: 'SYNTHETIC-TAX',
  pricingClientContextCoherent: true,
  provenance: 'ILLUSTRATIVE',
  provisional: true,
} satisfies OfferQualityInput;

describe('Offer Quality Checks rule set v1', () => {
  it('refuses a superseded target at the public command policy seam', () => {
    expect(() =>
      requireHeadOfferVersion({
        offerVersionId: 'previous',
        headVersionId: 'current',
      }),
    ).toThrowError(
      expect.objectContaining({
        status: 409,
        response: expect.objectContaining({ code: 'OFFER_VERSION_SUPERSEDED' }),
      }),
    );
    expect(() =>
      requireHeadOfferVersion({
        offerVersionId: 'current',
        headVersionId: 'current',
      }),
    ).not.toThrow();
  });
  it('evaluates every rule and fails validity exactly at validUntil', () => {
    const results = evaluateOfferQuality({
      ruleSetVersion: 1,
      instant: new Date('2026-10-03T12:00:00.000Z'),
      validUntil: new Date('2026-10-03T12:00:00.000Z'),
      snapshot: null,
      previousTransmittedCurrency: null,
      recipientAvailable: true,
      recipientIdentityCurrent: true,
      recipientTaxId: null,
      pricingClientContextCoherent: true,
      provenance: 'ILLUSTRATIVE',
      provisional: true,
    });
    expect(results).toEqual([
      { code: 'PRICING_SNAPSHOT_COHERENT', status: 'ERROR' },
      { code: 'CURRENCY_UNCHANGED', status: 'PASS' },
      { code: 'VALIDITY_OPEN', status: 'ERROR' },
      { code: 'RECIPIENT_AVAILABLE', status: 'PASS' },
      { code: 'RECIPIENT_IDENTITY_CURRENT', status: 'PASS' },
      { code: 'RECIPIENT_TAX_ID_RECORDED', status: 'WARNING' },
      { code: 'PRICING_CLIENT_CONTEXT_COHERENT', status: 'PASS' },
      { code: 'PROVISIONAL_MARKER_PRESENT', status: 'PASS' },
    ]);
  });

  it('passes every rule for a coherent unadjusted trace, recipient and open validity', () => {
    expect(evaluateOfferQuality(valid).map((item) => item.status)).toEqual([
      'PASS',
      'PASS',
      'PASS',
      'PASS',
      'PASS',
      'PASS',
      'PASS',
      'PASS',
    ]);
  });
  it.each([
    {
      code: 'PRICING_SNAPSHOT_COHERENT',
      status: 'ERROR',
      change: { snapshot: { ...valid.snapshot, belongsToOffer: false } },
    },
    {
      code: 'CURRENCY_UNCHANGED',
      status: 'WARNING',
      change: { previousTransmittedCurrency: 'MDL' },
    },
    {
      code: 'VALIDITY_OPEN',
      status: 'ERROR',
      change: { validUntil: valid.instant },
    },
    {
      code: 'RECIPIENT_AVAILABLE',
      status: 'ERROR',
      change: { recipientAvailable: false },
    },
    {
      code: 'RECIPIENT_IDENTITY_CURRENT',
      status: 'WARNING',
      change: { recipientIdentityCurrent: false },
    },
    {
      code: 'RECIPIENT_TAX_ID_RECORDED',
      status: 'WARNING',
      change: { recipientTaxId: null },
    },
    {
      code: 'PRICING_CLIENT_CONTEXT_COHERENT',
      status: 'WARNING',
      change: { pricingClientContextCoherent: false },
    },
    {
      code: 'PROVISIONAL_MARKER_PRESENT',
      status: 'ERROR',
      change: { provenance: 'REAL' },
    },
    {
      code: 'PROVISIONAL_MARKER_PRESENT',
      status: 'ERROR',
      change: { provisional: false },
    },
  ])(
    'reports the specified failing severity for $code',
    ({ code, status, change }) => {
      expect(evaluateOfferQuality({ ...valid, ...change })).toContainEqual({
        code,
        status,
      });
    },
  );
  it.each([
    { ...valid.snapshot, total: '241.00' },
    {
      ...valid.snapshot,
      lines: [{ ...valid.snapshot.lines[0], rawLineAmount: '199.0000000' }],
    },
    {
      ...valid.snapshot,
      lines: [{ ...valid.snapshot.lines[0], currency: 'MDL' }],
    },
    {
      ...valid.snapshot,
      lines: [{ ...valid.snapshot.lines[0], quantity: 'malformed' }],
    },
  ])(
    'rejects inconsistent Snapshot totals, traces and currencies',
    (snapshot) => {
      expect(evaluateOfferQuality({ ...valid, snapshot })).toContainEqual({
        code: 'PRICING_SNAPSHOT_COHERENT',
        status: 'ERROR',
      });
    },
  );
  it('passes the currency rule for the latest earlier transmitted currency', () => {
    expect(
      evaluateOfferQuality({ ...valid, previousTransmittedCurrency: 'EUR' }),
    ).toContainEqual({ code: 'CURRENCY_UNCHANGED', status: 'PASS' });
  });
});

// Hand-computed traces (Pricing PRD section 8.2), HALF_UP at scale 2:
// A: 100.0000 x 2.000 at 20.00 % = 200.00 + 40.00; minus 12.34 -> 187.66,
//    raw tax 37.5320000 -> 37.53, tax reduction 2.47.
// B: 50.0000 x 1.000 at 9.00 % = 50.00 + 4.50; minus 5.00 -> 45.00,
//    raw tax 4.0500000 -> 4.05, tax reduction 0.45.
type AdjustedLine = OfferAdjustedQualitySnapshot['lines'][number];
const originalA = valid.snapshot.lines[0];
const adjustedA = {
  ...originalA,
  adjustment: {
    type: 'FIXED_NET_DISCOUNT',
    netReduction: '12.34',
    taxReduction: '2.47',
    reason: 'Synthetic discount A',
    appliedByWorkspaceMembershipId: CALCULATED_BY,
    appliedAt: CALCULATED_AT,
  },
  netReduction: '12.34',
  taxReduction: '2.47',
  adjustedLineNet: '187.66',
  adjustedRawLineTax: '37.5320000',
  adjustedLineTax: '37.53',
} satisfies AdjustedLine;
const originalB = {
  currency: 'EUR',
  unitAmount: '50.0000',
  quantity: '1.000',
  taxRatePercent: '9.00',
  rawLineAmount: '50.0000000',
  lineNet: '50.00',
  rawLineTax: '4.5000000',
  lineTax: '4.50',
  adjustment: null,
  netReduction: '0.00',
  taxReduction: '0.00',
  adjustedLineNet: '50.00',
  adjustedRawLineTax: '4.5000000',
  adjustedLineTax: '4.50',
} satisfies AdjustedLine;
const adjustedB = {
  ...originalB,
  adjustment: {
    type: 'FIXED_NET_DISCOUNT',
    netReduction: '5.00',
    taxReduction: '0.45',
    reason: 'Synthetic discount B',
    appliedByWorkspaceMembershipId: CALCULATED_BY,
    appliedAt: CALCULATED_AT,
  },
  netReduction: '5.00',
  taxReduction: '0.45',
  adjustedLineNet: '45.00',
  adjustedRawLineTax: '4.0500000',
  adjustedLineTax: '4.05',
} satisfies AdjustedLine;
const fullLineA = {
  ...originalA,
  adjustment: {
    ...adjustedA.adjustment,
    netReduction: '200.00',
    taxReduction: '40.00',
  },
  netReduction: '200.00',
  taxReduction: '40.00',
  adjustedLineNet: '0.00',
  adjustedRawLineTax: '0.0000000',
  adjustedLineTax: '0.00',
} satisfies AdjustedLine;

function snapshotOf(
  lines: readonly AdjustedLine[],
  totals: { subtotal: string; taxTotal: string; total: string },
): OfferAdjustedQualitySnapshot {
  return {
    ...valid.snapshot,
    lines,
    subtotal: totals.subtotal,
    taxTotal: totals.taxTotal,
    total: totals.total,
  };
}

const one = snapshotOf([adjustedA], {
  subtotal: '187.66',
  taxTotal: '37.53',
  total: '225.19',
});
const mixed = snapshotOf([adjustedA, originalB], {
  subtotal: '237.66',
  taxTotal: '42.03',
  total: '279.69',
});

function coherence(
  snapshot: OfferAdjustedQualitySnapshot,
  ruleSetVersion: 1 | 2 = 2,
) {
  return evaluateOfferQuality({ ...valid, ruleSetVersion, snapshot })[0];
}

describe('Offer Quality Checks rule set v2', () => {
  it.each([
    ['one discount', one],
    [
      'several discounts',
      snapshotOf([adjustedA, adjustedB], {
        subtotal: '232.66',
        taxTotal: '41.58',
        total: '274.24',
      }),
    ],
    ['mixed lines', mixed],
    [
      'a full-line discount',
      snapshotOf([fullLineA, originalB], {
        subtotal: '50.00',
        taxTotal: '4.50',
        total: '54.50',
      }),
    ],
    ['no discount', valid.snapshot],
  ])('reproduces the stored trace and totals for %s', (_name, snapshot) => {
    const results = evaluateOfferQuality({
      ...valid,
      ruleSetVersion: 2,
      snapshot,
    });
    expect(results.map((result) => result.code)).toEqual(OFFER_QUALITY_CODES);
    expect(results.every((result) => result.status === 'PASS')).toBe(true);
  });

  it('accepts a reason of exactly 500 characters counted as code points', () => {
    const reason = '\u{1F642}'.repeat(500);
    expect(
      coherence(
        snapshotOf(
          [{ ...adjustedA, adjustment: { ...adjustedA.adjustment, reason } }],
          one,
        ),
      ),
    ).toEqual({ code: 'PRICING_SNAPSHOT_COHERENT', status: 'PASS' });
  });

  it.each<[string, OfferAdjustedQualitySnapshot]>([
    ['the total', { ...one, total: '225.20' }],
    ['the subtotal', { ...one, subtotal: '187.67', total: '225.20' }],
    ['the tax total', { ...one, taxTotal: '37.54', total: '225.20' }],
    [
      'the adjusted net',
      snapshotOf([{ ...adjustedA, adjustedLineNet: '187.67' }], one),
    ],
    [
      'the adjusted raw tax',
      snapshotOf([{ ...adjustedA, adjustedRawLineTax: '37.5330000' }], one),
    ],
    [
      'the adjusted tax',
      snapshotOf([{ ...adjustedA, adjustedLineTax: '37.54' }], one),
    ],
    [
      'the projected tax reduction',
      snapshotOf([{ ...adjustedA, taxReduction: '2.46' }], one),
    ],
    [
      'the adjustment tax reduction',
      snapshotOf(
        [
          {
            ...adjustedA,
            adjustment: { ...adjustedA.adjustment, taxReduction: '2.46' },
          },
        ],
        one,
      ),
    ],
    [
      'a projected reduction differing from the adjustment',
      snapshotOf([{ ...adjustedA, netReduction: '12.35' }], one),
    ],
    [
      'a reduction above the original net',
      snapshotOf(
        [
          {
            ...adjustedA,
            adjustment: { ...adjustedA.adjustment, netReduction: '200.01' },
            netReduction: '200.01',
          },
        ],
        one,
      ),
    ],
    [
      'a zero reduction',
      snapshotOf(
        [
          {
            ...originalA,
            adjustment: {
              ...adjustedA.adjustment,
              netReduction: '0.00',
              taxReduction: '0.00',
            },
          },
        ],
        valid.snapshot,
      ),
    ],
    [
      'a reduction outside the scale-2 grammar',
      snapshotOf(
        [
          {
            ...adjustedA,
            adjustment: { ...adjustedA.adjustment, netReduction: '12.340' },
          },
        ],
        one,
      ),
    ],
    [
      'a blank reason',
      snapshotOf(
        [
          {
            ...adjustedA,
            adjustment: { ...adjustedA.adjustment, reason: ' \n' },
          },
        ],
        one,
      ),
    ],
    [
      'an empty reason',
      snapshotOf(
        [{ ...adjustedA, adjustment: { ...adjustedA.adjustment, reason: '' } }],
        one,
      ),
    ],
    [
      'a reason above 500 characters',
      snapshotOf(
        [
          {
            ...adjustedA,
            adjustment: { ...adjustedA.adjustment, reason: 'x'.repeat(501) },
          },
        ],
        one,
      ),
    ],
    [
      'another applying actor',
      snapshotOf(
        [
          {
            ...adjustedA,
            adjustment: {
              ...adjustedA.adjustment,
              appliedByWorkspaceMembershipId: 'membership-other',
            },
          },
        ],
        one,
      ),
    ],
    [
      'another application instant',
      snapshotOf(
        [
          {
            ...adjustedA,
            adjustment: {
              ...adjustedA.adjustment,
              appliedAt: '2026-10-03T11:00:00.001Z',
            },
          },
        ],
        one,
      ),
    ],
    [
      'a tampered original trace',
      snapshotOf([{ ...adjustedA, lineTax: '40.01' }], one),
    ],
    [
      'an unadjusted line with a reduction',
      snapshotOf(
        [{ ...originalB, adjustedLineNet: '49.00' }, adjustedA],
        mixed,
      ),
    ],
    ['another Opportunity', { ...one, belongsToOffer: false }],
  ])('records ERROR for an incoherent trace: %s', (_name, snapshot) => {
    expect(coherence(snapshot)).toEqual({
      code: 'PRICING_SNAPSHOT_COHERENT',
      status: 'ERROR',
    });
  });

  it('keeps rule set v1 and shared Contract coherence refusing adjusted Snapshots', () => {
    expect(coherence(one, 1)).toEqual({
      code: 'PRICING_SNAPSHOT_COHERENT',
      status: 'ERROR',
    });
    expect(coherentSnapshot(one)).toBe(false);
    expect(coherentSnapshot(mixed)).toBe(false);
    expect(coherentSnapshot(valid.snapshot)).toBe(true);
  });
});
