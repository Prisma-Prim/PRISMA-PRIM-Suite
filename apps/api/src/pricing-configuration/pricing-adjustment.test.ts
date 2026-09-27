import { describe, expect, it } from 'vitest';
import { applyPricingAdjustments } from './pricing-adjustment.js';

describe('pricing adjustment arithmetic', () => {
  it('keeps an unadjusted line unchanged and projects zero reductions', () => {
    const result = applyPricingAdjustments([
      {
        lineNet: '308.63',
        lineTax: '38.08',
        taxRatePercent: '12.34',
        adjustment: null,
      },
    ]);

    expect(result).toEqual({
      lines: [
        {
          adjustment: null,
          netReduction: '0.00',
          taxReduction: '0.00',
          adjustedLineNet: '308.63',
          adjustedRawLineTax: '38.0849420',
          adjustedLineTax: '38.08',
        },
      ],
      subtotal: '308.63',
      taxTotal: '38.08',
      total: '346.71',
    });
  });

  it('applies a positive discount before tax and preserves its exact reason', () => {
    const result = applyPricingAdjustments([
      {
        lineNet: '308.63',
        lineTax: '38.08',
        taxRatePercent: '12.34',
        adjustment: {
          netReduction: '8.63',
          reason: '  Illustrative negotiated discount  ',
        },
      },
    ]);

    expect(result).toEqual({
      lines: [
        {
          adjustment: {
            type: 'FIXED_NET_DISCOUNT',
            netReduction: '8.63',
            reason: '  Illustrative negotiated discount  ',
          },
          netReduction: '8.63',
          taxReduction: '1.06',
          adjustedLineNet: '300.00',
          adjustedRawLineTax: '37.0200000',
          adjustedLineTax: '37.02',
        },
      ],
      subtotal: '300.00',
      taxTotal: '37.02',
      total: '337.02',
    });
  });

  it('derives the tax reduction from original and adjusted rounded tax', () => {
    const result = applyPricingAdjustments([
      {
        lineNet: '0.05',
        lineTax: '0.01',
        taxRatePercent: '10.00',
        adjustment: {
          netReduction: '0.01',
          reason: 'Rounding counterexample',
        },
      },
    ]);

    expect(result.lines[0]).toEqual({
      adjustment: {
        type: 'FIXED_NET_DISCOUNT',
        netReduction: '0.01',
        reason: 'Rounding counterexample',
      },
      netReduction: '0.01',
      taxReduction: '0.01',
      adjustedLineNet: '0.04',
      adjustedRawLineTax: '0.0040000',
      adjustedLineTax: '0.00',
    });
  });

  it('accepts a full-line discount and leaves adjusted net and tax at zero', () => {
    const result = applyPricingAdjustments([
      {
        lineNet: '12.34',
        lineTax: '2.47',
        taxRatePercent: '20.00',
        adjustment: {
          netReduction: '12.34',
          reason: 'Full illustrative reduction',
        },
      },
    ]);

    expect(result).toEqual({
      lines: [
        {
          adjustment: {
            type: 'FIXED_NET_DISCOUNT',
            netReduction: '12.34',
            reason: 'Full illustrative reduction',
          },
          netReduction: '12.34',
          taxReduction: '2.47',
          adjustedLineNet: '0.00',
          adjustedRawLineTax: '0.0000000',
          adjustedLineTax: '0.00',
        },
      ],
      subtotal: '0.00',
      taxTotal: '0.00',
      total: '0.00',
    });
  });

  it('keeps twenty maximum-magnitude adjusted lines inside the exact range', () => {
    const result = applyPricingAdjustments(
      Array.from({ length: 20 }, () => ({
        lineNet: '9999999999890000.00',
        lineTax: '9999999999890000.00',
        taxRatePercent: '100.00',
        adjustment: {
          netReduction: '0.01',
          reason: 'Maximum magnitude proof',
        },
      })),
    );

    expect(result.lines).toHaveLength(20);
    expect(result.lines[0]).toEqual({
      adjustment: {
        type: 'FIXED_NET_DISCOUNT',
        netReduction: '0.01',
        reason: 'Maximum magnitude proof',
      },
      netReduction: '0.01',
      taxReduction: '0.01',
      adjustedLineNet: '9999999999889999.99',
      adjustedRawLineTax: '9999999999889999.9900000',
      adjustedLineTax: '9999999999889999.99',
    });
    expect(result.subtotal).toBe('199999999997799999.80');
    expect(result.taxTotal).toBe('199999999997799999.80');
    expect(result.total).toBe('399999999995599999.60');
  });

  it('rejects non-positive and above-line reductions defensively', () => {
    expect(() =>
      applyPricingAdjustments([
        {
          lineNet: '12.34',
          lineTax: '2.47',
          taxRatePercent: '20.00',
          adjustment: { netReduction: '0.00', reason: 'Invalid zero' },
        },
      ]),
    ).toThrow('The fixed net discount must be positive.');

    expect(() =>
      applyPricingAdjustments([
        {
          lineNet: '12.34',
          lineTax: '2.47',
          taxRatePercent: '20.00',
          adjustment: {
            netReduction: '12.35',
            reason: 'Invalid excess',
          },
        },
      ]),
    ).toThrow('The fixed net discount exceeds the original line net.');
  });
});
