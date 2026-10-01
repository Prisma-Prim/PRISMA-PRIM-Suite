import { describe, expect, it } from 'vitest';
import { calculateProfitability } from './profitability-calculation.js';

describe('confirmed-cost profitability calculation', () => {
  it.each([
    [
      '125.00',
      ['60.00', '10.00', '10.00', '20.00'],
      '20',
      '100.00',
      '25.00',
      '20.00',
      '0.00',
    ],
    [
      '200.00',
      ['197.99', '0.00', '0.00'],
      '1.01',
      '197.99',
      '2.01',
      '1.01',
      '-0.01',
    ],
    [
      '100.00',
      ['125.00', '0.00', '0.00'],
      '20',
      '125.00',
      '-25.00',
      '-25.00',
      '-45.00',
    ],
  ])(
    'keeps exact monetary and independently rounded percentage results',
    (price, costs, target, totalCost, profit, profitability, difference) => {
      expect(calculateProfitability({ price, costs, target })).toEqual({
        totalCost,
        profit,
        estimatedProfitability: profitability,
        targetDifference: difference,
      });
    },
  );

  it('rounds an exact positive and negative half away from zero', () => {
    expect(
      calculateProfitability({
        price: '200.00',
        costs: ['197.99'],
        target: '0',
      }).estimatedProfitability,
    ).toBe('1.01');
    expect(
      calculateProfitability({
        price: '200.00',
        costs: ['202.01'],
        target: '0',
      }).estimatedProfitability,
    ).toBe('-1.01');
  });
});
