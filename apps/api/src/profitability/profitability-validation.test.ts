import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { readSubmitProfitabilityCommand } from './profitability-validation.js';

const complete = {
  expectedLatestVersion: null,
  currency: 'EUR',
  executorType: 'DIRECTOR_OR_EMPLOYEE',
  executorCost: '60.00',
  fiscalCost: '10.00',
  allocatedOverhead: '10.00',
  directCosts: [
    {
      key: 'travel',
      category: 'TRAVEL',
      label: 'Synthetic travel',
      currency: 'EUR',
      amount: '20.00',
    },
  ],
  targetProfitability: '20',
  proposedPrice: '125.00',
  pricingIntent: 'ORDINARY',
  strategicReason: null,
  costComplete: true,
  noKnownDuplicate: true,
};

describe('profitability submission boundary', () => {
  it('accepts the complete explicit synthetic input without inventing defaults', () => {
    expect(readSubmitProfitabilityCommand(complete)).toEqual(complete);
  });

  it.each([
    [{ ...complete, executorCost: '1.005' }, 'executorCost'],
    [
      {
        ...complete,
        directCosts: [{ ...complete.directCosts[0], currency: 'USD' }],
      },
      'directCosts[0].currency',
    ],
    [
      {
        ...complete,
        directCosts: [...complete.directCosts, { ...complete.directCosts[0] }],
      },
      'directCosts[1].key',
    ],
    [{ ...complete, costComplete: false }, 'costComplete'],
    [
      { ...complete, pricingIntent: 'STRATEGIC', strategicReason: ' ' },
      'strategicReason',
    ],
  ])('rejects an invalid complete bundle at %s', (command, field) => {
    try {
      readSubmitProfitabilityCommand(command);
      throw new Error('Expected the submission to be rejected.');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      if (!(error instanceof HttpException)) return;
      expect(error.getResponse()).toMatchObject({ field });
    }
  });

  it('keeps equal amounts under distinct submission keys', () => {
    const result = readSubmitProfitabilityCommand({
      ...complete,
      directCosts: [
        complete.directCosts[0],
        { ...complete.directCosts[0], key: 'travel-2' },
      ],
    });
    expect(result.directCosts).toHaveLength(2);
  });
});
