import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  readProfitabilityDecision,
  readProfitabilitySubmission,
} from './profitability-estimate.validation.js';

const valid = {
  expectedLatestVersionNumber: null,
  currency: 'EUR',
  executorType: 'PATENT_CONSULTANT',
  executorCost: '60.00',
  fiscalCost: '10.00',
  allocatedOverhead: '10.00',
  directCosts: [
    {
      key: 'synthetic-travel',
      category: 'TRAVEL',
      label: '  Synthetic travel  ',
      amount: '20.00',
      currency: 'EUR',
    },
  ],
  targetProfitability: '20',
  proposedPrice: '125.00',
  pricingIntent: { kind: 'ORDINARY' },
  costConfirmation: true,
};

function rejected(
  value: unknown,
  reader: (value: unknown) => unknown = readProfitabilitySubmission,
): unknown {
  try {
    reader(value);
  } catch (failure) {
    if (failure instanceof BadRequestException) return failure.getResponse();
    throw failure;
  }
  throw new Error('Expected validation to refuse the payload.');
}

describe('Confirmed-cost Profitability Estimate submission boundary', () => {
  it('preserves every input, line order and exact strategic reason', () => {
    const command = {
      ...valid,
      targetProfitability: '+20.00000',
      directCosts: [
        valid.directCosts[0],
        {
          key: 'second',
          category: 'OTHER',
          label: '🧮 e\u0301',
          amount: '20.00',
          currency: 'EUR',
        },
      ],
      pricingIntent: {
        kind: 'STRATEGIC',
        reason: '  Synthetic strategic price  ',
      },
    };
    expect(readProfitabilitySubmission(command)).toEqual(command);
  });

  it('requires every field, including explicit null head and fresh confirmation', () => {
    for (const field of Object.keys(valid)) {
      const without = Object.fromEntries(
        Object.entries(valid).filter(([key]) => key !== field),
      );
      expect(rejected(without)).toMatchObject({ field });
    }
    expect(rejected({ ...valid, costConfirmation: false })).toMatchObject({
      field: 'costConfirmation',
    });
  });

  it('accepts zero required costs and an explicitly empty direct-cost list', () => {
    const command = {
      ...valid,
      executorCost: '0.00',
      fiscalCost: '0.00',
      allocatedOverhead: '0.00',
      directCosts: [],
    };
    expect(readProfitabilitySubmission(command)).toEqual(command);
  });

  it.each([
    'PATENT_CONSULTANT',
    'CIVIL_CONTRACT_FREELANCER',
    'DIRECTOR_OR_EMPLOYEE',
    'EXTERNAL_SUBCONTRACTOR',
  ])(
    'accepts source-backed executor %s without selecting a formula',
    (executorType) => {
      expect(
        readProfitabilitySubmission({ ...valid, executorType }).executorType,
      ).toBe(executorType);
    },
  );

  it.each([
    'PATENT',
    'TRAVEL',
    'SUBCONTRACTOR',
    'TRANSLATION_MATERIAL_CONSUMABLE',
    'OTHER',
  ])('accepts source-backed direct category %s', (category) => {
    expect(
      readProfitabilitySubmission({
        ...valid,
        directCosts: [{ ...valid.directCosts[0], category }],
      }).directCosts[0]?.category,
    ).toBe(category);
  });

  it.each([
    '-1000',
    '1000',
    '+20.00000',
    '-0',
    '-0.00',
    '0.000000000000000000000001',
    '001.000',
  ])(
    'has no target default, hidden range or precision cap: %s',
    (targetProfitability) => {
      expect(
        readProfitabilitySubmission({ ...valid, targetProfitability })
          .targetProfitability,
      ).toBe(targetProfitability);
    },
  );

  it.each(['JPY', 'CHF', 'CAD', 'AUD', 'GBP', 'RON', 'MDL', 'USD', 'EUR'])(
    'supports ISO estimate currency independently of illustrative tariffs: %s',
    (currency) => {
      expect(
        readProfitabilitySubmission({ ...valid, currency, directCosts: [] })
          .currency,
      ).toBe(currency);
    },
  );

  it('does not introduce a monetary representation cap or numeric overflow', () => {
    const executorCost = `${'9'.repeat(100)}.99`;
    expect(
      readProfitabilitySubmission({ ...valid, executorCost }).executorCost,
    ).toBe(executorCost);
  });

  it('preserves leading-zero decimal spellings accepted by the plain notation contract', () => {
    const command = {
      ...valid,
      executorCost: '060.00',
      targetProfitability: '+020.00',
    };
    expect(readProfitabilitySubmission(command)).toEqual(command);
  });

  it.each([
    '1.005',
    '1',
    '1.0',
    '1.000',
    '-1.00',
    '-0.00',
    '+1.00',
    '1e2',
    '1,00',
    ' 1.00',
    '1.00 ',
    'NaN',
    'Infinity',
    '',
    1,
    null,
  ])(
    'refuses malformed/negative/overprecise monetary %j without rounding',
    (amount) => {
      for (const field of [
        'executorCost',
        'fiscalCost',
        'allocatedOverhead',
        'proposedPrice',
      ])
        expect(rejected({ ...valid, [field]: amount })).toMatchObject({
          field,
        });
      expect(
        rejected({
          ...valid,
          directCosts: [{ ...valid.directCosts[0], amount }],
        }),
      ).toMatchObject({ field: 'directCosts[0].amount' });
    },
  );

  it.each([
    'NaN',
    'Infinity',
    '1e2',
    '1,5',
    ' 20',
    '20 ',
    '.5',
    '1.',
    '',
    20,
    null,
  ])('refuses malformed target %j', (targetProfitability) => {
    expect(rejected({ ...valid, targetProfitability })).toMatchObject({
      field: 'targetProfitability',
    });
  });

  it('rejects zero price/direct line, mixed currency and repeated key', () => {
    expect(rejected({ ...valid, proposedPrice: '0.00' })).toMatchObject({
      field: 'proposedPrice',
    });
    expect(
      rejected({
        ...valid,
        directCosts: [{ ...valid.directCosts[0], amount: '0.00' }],
      }),
    ).toMatchObject({ field: 'directCosts[0].amount' });
    expect(
      rejected({
        ...valid,
        directCosts: [{ ...valid.directCosts[0], currency: 'USD' }],
      }),
    ).toMatchObject({ field: 'directCosts[0].currency' });
    expect(
      rejected({
        ...valid,
        directCosts: [valid.directCosts[0], valid.directCosts[0]],
      }),
    ).toMatchObject({ field: 'directCosts[1].key' });
  });

  it.each(['', ' \t\n', 'before\u0000after', '\uD800', '\uDC00'])(
    'rejects empty or unrepresentable cost labels, keys and strategic reasons %j',
    (text) => {
      for (const field of ['key', 'label'])
        expect(
          rejected({
            ...valid,
            directCosts: [{ ...valid.directCosts[0], [field]: text }],
          }),
        ).toMatchObject({ field: `directCosts[0].${field}` });
      expect(
        rejected({
          ...valid,
          pricingIntent: { kind: 'STRATEGIC', reason: text },
        }),
      ).toMatchObject({ field: 'pricingIntent.reason' });
    },
  );

  it.each([
    [{ ...valid, currency: 'ZZZ' }, 'currency'],
    [{ ...valid, currency: 'eur' }, 'currency'],
    [{ ...valid, executorType: 'UNKNOWN' }, 'executorType'],
    [
      {
        ...valid,
        directCosts: [{ ...valid.directCosts[0], category: 'UNKNOWN' }],
      },
      'directCosts[0].category',
    ],
    [
      { ...valid, directCosts: [{ ...valid.directCosts[0], computed: true }] },
      'directCosts[0]',
    ],
    [
      { ...valid, pricingIntent: { kind: 'ORDINARY', reason: '' } },
      'pricingIntent.reason',
    ],
    [
      { ...valid, pricingIntent: { kind: 'STRATEGIC' } },
      'pricingIntent.reason',
    ],
    [
      { ...valid, pricingIntent: { kind: 'AUTO_APPROVE' } },
      'pricingIntent.kind',
    ],
    [
      { ...valid, expectedLatestVersionNumber: undefined },
      'expectedLatestVersionNumber',
    ],
    [
      { ...valid, expectedLatestVersionNumber: -1 },
      'expectedLatestVersionNumber',
    ],
    [
      { ...valid, expectedLatestVersionNumber: 1.5 },
      'expectedLatestVersionNumber',
    ],
    [
      { ...valid, expectedLatestVersionNumber: 2_147_483_648 },
      'expectedLatestVersionNumber',
    ],
    [{ ...valid, calculationRule: { version: 7 } }, 'profitabilityEstimate'],
    [
      { ...valid, createdByWorkspaceMembershipId: 'caller' },
      'profitabilityEstimate',
    ],
    [{ ...valid, state: 'APPROVE' }, 'profitabilityEstimate'],
  ])('refuses malformed and server-owned fields %#', (body, field) => {
    expect(rejected(body)).toMatchObject({ code: 'VALIDATION_ERROR', field });
  });
});

describe('Exact-version Director decision boundary', () => {
  it.each(['APPROVE', 'MODIFY', 'REJECT'])(
    'accepts %s with explicit version and absent decision',
    (code) => {
      const body = { expectedVersionNumber: 1, expectedDecision: null, code };
      expect(readProfitabilityDecision(body)).toEqual(body);
    },
  );

  it.each([
    [
      { expectedVersionNumber: 0, expectedDecision: null, code: 'APPROVE' },
      'expectedVersionNumber',
    ],
    [{ expectedVersionNumber: 1, code: 'APPROVE' }, 'expectedDecision'],
    [
      {
        expectedVersionNumber: 1,
        expectedDecision: 'APPROVE',
        code: 'APPROVE',
      },
      'expectedDecision',
    ],
    [
      { expectedVersionNumber: 1, expectedDecision: null, code: 'UNKNOWN' },
      'code',
    ],
    [
      {
        expectedVersionNumber: 1,
        expectedDecision: null,
        code: 'APPROVE',
        reason: 'caller',
      },
      'profitabilityDecision',
    ],
    [
      {
        expectedVersionNumber: 1,
        expectedDecision: null,
        code: 'APPROVE',
        decidedAt: 'caller',
      },
      'profitabilityDecision',
    ],
  ])('refuses malformed or server-owned decision fields %#', (body, field) => {
    expect(rejected(body, readProfitabilityDecision)).toMatchObject({ field });
  });
});
