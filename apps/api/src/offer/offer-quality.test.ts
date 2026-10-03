import { describe, expect, it } from 'vitest';
import {
  evaluateOfferQuality,
  requireHeadOfferVersion,
  type OfferQualityInput,
} from './offer-quality.js';

const valid = {
  instant: new Date('2026-10-03T12:00:00.000Z'),
  validUntil: new Date('2026-10-03T12:00:00.001Z'),
  snapshot: {
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
