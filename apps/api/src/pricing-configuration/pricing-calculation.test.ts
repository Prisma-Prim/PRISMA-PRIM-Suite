import { describe, expect, it } from 'vitest';
import { calculatePricingLines } from './pricing-calculation.js';

describe('pricing calculation arithmetic', () => {
  it('keeps the worked example exact and rounds HALF_UP per line', () => {
    const result = calculatePricingLines([
      {
        unitAmount: '123.4500',
        quantity: '2.5',
        taxRatePercent: '12.34',
      },
      {
        unitAmount: '0.0050',
        quantity: '1',
        taxRatePercent: '0.00',
      },
    ]);

    expect(result).toEqual({
      lines: [
        {
          rawLineAmount: '308.6250000',
          lineNet: '308.63',
          rawLineTax: '38.0849420',
          lineTax: '38.08',
        },
        {
          rawLineAmount: '0.0050000',
          lineNet: '0.01',
          rawLineTax: '0.0000000',
          lineTax: '0.00',
        },
      ],
      subtotal: '308.64',
      taxTotal: '38.08',
      total: '346.72',
    });
  });

  it('keeps the maximum twenty-line calculation inside the declared exact range', () => {
    const result = calculatePricingLines(
      Array.from({ length: 20 }, () => ({
        unitAmount: '9999999.9999',
        quantity: '999999999.999',
        taxRatePercent: '100.00',
      })),
    );

    expect(result.lines).toHaveLength(20);
    expect(result.lines[0]).toEqual({
      rawLineAmount: '9999999999890000.0000001',
      lineNet: '9999999999890000.00',
      rawLineTax: '9999999999890000.0000000',
      lineTax: '9999999999890000.00',
    });
    expect(result.subtotal).toBe('199999999997800000.00');
    expect(result.taxTotal).toBe('199999999997800000.00');
    expect(result.total).toBe('399999999995600000.00');
  });
});
