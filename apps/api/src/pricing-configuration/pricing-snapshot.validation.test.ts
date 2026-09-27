import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { readPricingSnapshotCommand } from './pricing-snapshot.validation.js';

const OFFERING_A = '10000000-0000-4000-8000-00000000000a';
const OFFERING_B = '10000000-0000-4000-8000-00000000000b';

const valid = {
  pricingRuleVersionNumber: 1,
  lines: [{ offeringId: OFFERING_A, tariffVersionNumber: 2, quantity: '2.5' }],
};

function rejectedField(value: unknown): unknown {
  let failure: unknown;
  try {
    readPricingSnapshotCommand(value);
  } catch (error) {
    failure = error;
  }
  if (!(failure instanceof BadRequestException))
    throw new Error('Expected a validation failure.', { cause: failure });
  return failure.getResponse();
}

describe('Pricing Snapshot calculation payload', () => {
  it('keeps line order and quantity spelling exactly as submitted', () => {
    expect(
      readPricingSnapshotCommand({
        pricingRuleVersionNumber: 12,
        lines: [
          {
            offeringId: OFFERING_B,
            tariffVersionNumber: 8,
            quantity: '0.50',
          },
          {
            offeringId: OFFERING_A,
            tariffVersionNumber: 7,
            quantity: '100.00',
          },
        ],
      }),
    ).toEqual({
      pricingRuleVersionNumber: 12,
      lines: [
        {
          offeringId: OFFERING_B,
          tariffVersionNumber: 8,
          quantity: '0.50',
        },
        {
          offeringId: OFFERING_A,
          tariffVersionNumber: 7,
          quantity: '100.00',
        },
      ],
    });
  });

  it.each(['0.001', '0.50', '1', '100.00', '999999999.999'])(
    'accepts quantity %j verbatim',
    (quantity) => {
      expect(
        readPricingSnapshotCommand({
          ...valid,
          lines: [{ ...valid.lines[0], quantity }],
        }).lines[0]?.quantity,
      ).toBe(quantity);
    },
  );

  it.each([
    '00',
    '01',
    '00.50',
    '0',
    '0.000',
    ' 1',
    '1 ',
    '+1',
    '1e2',
    '1,5',
    '١٢',
    'NaN',
    'Infinity',
    '',
    '1.0000',
    '1000000000',
    2.5,
    null,
  ])('refuses quantity %j on the line field', (quantity) => {
    expect(
      rejectedField({
        ...valid,
        lines: [{ ...valid.lines[0], quantity }],
      }),
    ).toMatchObject({ code: 'VALIDATION_ERROR', field: 'lines[0].quantity' });
  });

  it('requires one to twenty distinct offerings', () => {
    expect(rejectedField({ ...valid, lines: [] })).toMatchObject({
      field: 'lines',
    });
    expect(
      rejectedField({
        ...valid,
        lines: Array.from({ length: 21 }, (_, index) => ({
          offeringId: `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
          tariffVersionNumber: 1,
          quantity: '1',
        })),
      }),
    ).toMatchObject({ field: 'lines' });
    expect(
      rejectedField({
        ...valid,
        lines: [valid.lines[0], { ...valid.lines[0], quantity: '2' }],
      }),
    ).toMatchObject({ field: 'lines[1].offeringId' });
  });

  it.each([
    [{ ...valid, pricingRuleVersionNumber: 0 }, 'pricingRuleVersionNumber'],
    [{ ...valid, pricingRuleVersionNumber: '1' }, 'pricingRuleVersionNumber'],
    [
      {
        ...valid,
        lines: [{ ...valid.lines[0], tariffVersionNumber: 1.5 }],
      },
      'lines[0].tariffVersionNumber',
    ],
    [
      { ...valid, lines: [{ ...valid.lines[0], offeringId: 'bad-id' }] },
      'lines[0].offeringId',
    ],
    [{ ...valid, lines: [{ ...valid.lines[0], currency: 'EUR' }] }, 'lines[0]'],
    [{ ...valid, calculatedAt: '2026-01-01T00:00:00Z' }, 'pricingSnapshot'],
  ])('refuses invalid or server-owned input on %s', (body, field) => {
    expect(rejectedField(body)).toMatchObject({
      code: 'VALIDATION_ERROR',
      field,
    });
  });
});
