import { describe, expect, it } from 'vitest';
import { calculateProfitability } from './profitability-estimate.calculation.js';
import { readProfitabilitySubmission } from './profitability-estimate.validation.js';

function inputs(overrides: Record<string, unknown> = {}) {
  return readProfitabilitySubmission({
    expectedLatestVersionNumber: null,
    currency: 'EUR',
    executorType: 'PATENT_CONSULTANT',
    executorCost: '60.00',
    fiscalCost: '10.00',
    allocatedOverhead: '10.00',
    directCosts: [
      {
        key: 'travel',
        category: 'TRAVEL',
        label: 'Synthetic travel',
        amount: '20.00',
        currency: 'EUR',
      },
    ],
    targetProfitability: '20',
    proposedPrice: '125.00',
    pricingIntent: { kind: 'ORDINARY' },
    costConfirmation: true,
    ...overrides,
  });
}

describe('Exact confirmed-cost profitability rule version 1', () => {
  it('proves the PRD synthetic example with scale-two output text', () => {
    expect(calculateProfitability(inputs())).toEqual({
      totalCost: '100.00',
      profit: '25.00',
      profitabilityPercent: '20.00',
      targetDifferencePercentagePoints: '0.00',
    });
  });

  it.each([
    ['197.99', '1.00', '2.01', '1.01', '0.01'],
    ['197.99', '1.01', '2.01', '1.01', '-0.01'],
    ['202.01', '0', '-2.01', '-1.01', '-1.01'],
    ['202.01', '-1.00', '-2.01', '-1.01', '-0.01'],
    ['202.01', '-1.01', '-2.01', '-1.01', '0.01'],
  ])(
    'independently rounds exact ratio and ratio-minus-target at %s/%s',
    (
      executorCost,
      targetProfitability,
      profit,
      profitabilityPercent,
      targetDifferencePercentagePoints,
    ) => {
      expect(
        calculateProfitability(
          inputs({
            executorCost,
            fiscalCost: '0.00',
            allocatedOverhead: '0.00',
            directCosts: [],
            proposedPrice: '200.00',
            targetProfitability,
          }),
        ),
      ).toEqual({
        totalCost: executorCost,
        profit,
        profitabilityPercent,
        targetDifferencePercentagePoints,
      });
    },
  );

  it('keeps every distinct direct line and takes no executor/category/strategic formula', () => {
    const result = calculateProfitability(
      inputs({
        executorType: 'EXTERNAL_SUBCONTRACTOR',
        directCosts: [
          {
            key: 'a',
            category: 'PATENT',
            label: 'Synthetic A',
            amount: '20.00',
            currency: 'EUR',
          },
          {
            key: 'b',
            category: 'OTHER',
            label: 'Synthetic B',
            amount: '20.00',
            currency: 'EUR',
          },
        ],
        pricingIntent: { kind: 'STRATEGIC', reason: 'Synthetic reason' },
      }),
    );
    expect(result).toEqual({
      totalCost: '120.00',
      profit: '5.00',
      profitabilityPercent: '4.00',
      targetDifferencePercentagePoints: '-16.00',
    });
  });

  it('retains a loss and targets outside conventional business ranges', () => {
    expect(
      calculateProfitability(
        inputs({ proposedPrice: '25.00', targetProfitability: '-1000' }),
      ),
    ).toEqual({
      totalCost: '100.00',
      profit: '-75.00',
      profitabilityPercent: '-300.00',
      targetDifferencePercentagePoints: '700.00',
    });
  });

  it('preserves arbitrary-size money exactly beyond binary and decimal-column limits', () => {
    expect(
      calculateProfitability(
        inputs({
          executorCost: '123456789012345678901234567890.99',
          fiscalCost: '0.01',
          allocatedOverhead: '0.00',
          directCosts: [],
          proposedPrice: '246913578024691357802469135782.00',
          targetProfitability: '+50.00000000000000000000000000000001',
        }),
      ),
    ).toEqual({
      totalCost: '123456789012345678901234567891.00',
      profit: '123456789012345678901234567891.00',
      profitabilityPercent: '50.00',
      targetDifferencePercentagePoints: '0.00',
    });
  });

  it('rounds near the half boundary using every target digit and avoids negative zero', () => {
    const base = {
      executorCost: '0.00',
      fiscalCost: '0.00',
      allocatedOverhead: '0.00',
      directCosts: [],
      proposedPrice: '0.01',
    };
    expect(
      calculateProfitability(
        inputs({
          ...base,
          targetProfitability: '100.004999999999999999999999',
        }),
      ).targetDifferencePercentagePoints,
    ).toBe('0.00');
    expect(
      calculateProfitability(
        inputs({
          ...base,
          targetProfitability: '100.005000000000000000000001',
        }),
      ).targetDifferencePercentagePoints,
    ).toBe('-0.01');
    expect(
      calculateProfitability(
        inputs({ ...base, targetProfitability: '99.994999999999999999999999' }),
      ).targetDifferencePercentagePoints,
    ).toBe('0.01');
  });
});
