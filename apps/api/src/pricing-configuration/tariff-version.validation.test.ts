import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { readPublishTariffVersionCommand } from './tariff-version.validation.js';

// Synthetic values only: no real unit, price or tax.
const valid = {
  unit: 'illustrative-unit',
  unitAmount: '123.4500',
  currency: 'EUR',
  taxRatePercent: '12.34',
  taxLabel: 'Illustrative tax',
  effectiveFrom: '2026-05-01T00:00:00Z',
  expectedActiveVersionNumber: null,
};

function rejectedField(value: unknown): unknown {
  let failure: unknown;
  try {
    readPublishTariffVersionCommand(value);
  } catch (error) {
    failure = error;
  }
  if (!(failure instanceof BadRequestException))
    throw new Error('Expected a validation failure.', { cause: failure });
  const response = failure.getResponse();
  if (typeof response !== 'object' || response === null)
    throw new Error('Expected a structured validation response.');
  return Object.fromEntries(Object.entries(response));
}

describe('Tariff Version publication payload', () => {
  it('keeps every value exactly as submitted, with explicit instants and a null first-publication expectation', () => {
    expect(readPublishTariffVersionCommand(valid)).toEqual({
      unit: 'illustrative-unit',
      unitAmount: '123.4500',
      currency: 'EUR',
      taxRatePercent: '12.34',
      taxLabel: 'Illustrative tax',
      effectiveFrom: new Date('2026-05-01T00:00:00.000Z'),
      effectiveTo: null,
      expectedActiveVersionNumber: null,
    });
    expect(
      readPublishTariffVersionCommand({
        ...valid,
        unit: '  unit  ',
        unitAmount: '12.5',
        currency: 'MDL',
        taxRatePercent: '0',
        taxLabel: 'Taxe ✓ 税 \u{1f600}',
        effectiveFrom: '2026-05-01T03:00:00.250+03:00',
        effectiveTo: '2026-06-01T00:00:00-01:30',
        expectedActiveVersionNumber: 2_147_483_647,
      }),
    ).toEqual({
      unit: '  unit  ',
      unitAmount: '12.5',
      currency: 'MDL',
      taxRatePercent: '0',
      taxLabel: 'Taxe ✓ 税 \u{1f600}',
      effectiveFrom: new Date('2026-05-01T00:00:00.250Z'),
      effectiveTo: new Date('2026-06-01T01:30:00.000Z'),
      expectedActiveVersionNumber: 2_147_483_647,
    });
  });

  it.each([
    '0.0001',
    '0.50',
    '1',
    '12.5',
    '12.5000',
    '9999999',
    '9999999.9999',
  ])('accepts the unit amount %j verbatim', (unitAmount) => {
    expect(
      readPublishTariffVersionCommand({ ...valid, unitAmount }).unitAmount,
    ).toBe(unitAmount);
  });

  it.each([
    '0',
    '0.5',
    '0.50',
    '1',
    '12.34',
    '99.99',
    '100',
    '100.0',
    '100.00',
  ])('accepts the tax rate %j verbatim', (taxRatePercent) => {
    expect(
      readPublishTariffVersionCommand({ ...valid, taxRatePercent })
        .taxRatePercent,
    ).toBe(taxRatePercent);
  });

  it.each(['MDL', 'EUR', 'RON', 'USD'])(
    'accepts the currency %s',
    (currency) => {
      expect(
        readPublishTariffVersionCommand({ ...valid, currency }).currency,
      ).toBe(currency);
    },
  );

  // Leading zeros, signs, exponents, separators, whitespace, non-ASCII
  // digits, non-numbers and JSON numbers are refused, never coerced.
  const refusedDecimals: unknown[] = [
    '00',
    '01',
    '00.50',
    '+1',
    '-1',
    '1e2',
    '1E2',
    '1,5',
    '1_000',
    '1 000',
    ' 1',
    '1 ',
    '\t1',
    '1\n',
    '.5',
    '5.',
    '١٢',
    '１２',
    'NaN',
    'Infinity',
    '',
    12.5,
    0,
    null,
    true,
  ];

  it.each([...refusedDecimals, '0', '0.0', '0.0000', '10000000', '12.34567'])(
    'refuses the unit amount %j on its field',
    (unitAmount) => {
      expect(rejectedField({ ...valid, unitAmount })).toMatchObject({
        code: 'VALIDATION_ERROR',
        field: 'unitAmount',
      });
    },
  );

  it.each([...refusedDecimals, '100.01', '100.000', '101', '1000', '12.345'])(
    'refuses the tax rate %j on its field',
    (taxRatePercent) => {
      expect(rejectedField({ ...valid, taxRatePercent })).toMatchObject({
        code: 'VALIDATION_ERROR',
        field: 'taxRatePercent',
      });
    },
  );

  it.each(['eur', 'Eur', 'GBP', 'EURO', ' EUR', '', 978, null])(
    'refuses the currency %j on its field',
    (currency) => {
      expect(rejectedField({ ...valid, currency })).toMatchObject({
        code: 'VALIDATION_ERROR',
        field: 'currency',
      });
    },
  );

  it.each([
    [{ ...valid, unit: '' }, 'unit'],
    [{ ...valid, unit: ' \t\n ' }, 'unit'],
    [{ ...valid, unit: 'x'.repeat(25) }, 'unit'],
    [{ ...valid, unit: '😀'.repeat(25) }, 'unit'],
    // PostgreSQL text cannot store U+0000, whatever the text's length.
    [{ ...valid, unit: '\u0000' }, 'unit'],
    [{ ...valid, unit: 'unit\u0000A' }, 'unit'],
    [{ ...valid, unit: 7 }, 'unit'],
    [{ ...valid, taxLabel: '' }, 'taxLabel'],
    [{ ...valid, taxLabel: '   ' }, 'taxLabel'],
    [{ ...valid, taxLabel: 'x'.repeat(61) }, 'taxLabel'],
    [{ ...valid, taxLabel: '😀'.repeat(61) }, 'taxLabel'],
    [{ ...valid, taxLabel: 'Tax\u0000label' }, 'taxLabel'],
    [{ ...valid, taxLabel: `${'😀'.repeat(59)}\u0000` }, 'taxLabel'],
    [{ ...valid, effectiveFrom: '2026-05-01T00:00:00' }, 'effectiveFrom'],
    [{ ...valid, effectiveFrom: '2026-02-30T00:00:00Z' }, 'effectiveFrom'],
    [{ ...valid, effectiveFrom: '2026-05-01T24:00:00Z' }, 'effectiveFrom'],
    [{ ...valid, effectiveFrom: 1_777_593_600_000 }, 'effectiveFrom'],
    [{ ...valid, effectiveTo: 'tomorrow' }, 'effectiveTo'],
    [{ ...valid, effectiveTo: valid.effectiveFrom }, 'effectiveTo'],
    [{ ...valid, effectiveTo: '2026-05-01T02:00:00+03:00' }, 'effectiveTo'],
  ])('rejects %j on its field', (body, field) => {
    expect(rejectedField(body)).toMatchObject({
      code: 'VALIDATION_ERROR',
      field,
    });
  });

  it('keeps the unit and tax label at their code-point limits verbatim', () => {
    const command = readPublishTariffVersionCommand({
      ...valid,
      unit: '😀'.repeat(24),
      taxLabel: '😀'.repeat(60),
    });
    expect(command.unit).toBe('😀'.repeat(24));
    expect(command.taxLabel).toBe('😀'.repeat(60));
  });

  it.each([0, -1, 1.5, '1', 2_147_483_648, true, {}, undefined])(
    'rejects the expected head number %j as field validation',
    (expectedActiveVersionNumber) => {
      expect(
        rejectedField({ ...valid, expectedActiveVersionNumber }),
      ).toMatchObject({
        code: 'VALIDATION_ERROR',
        field: 'expectedActiveVersionNumber',
      });
    },
  );

  it.each([
    ['offeringId', '00000000-0000-4000-8000-000000000001'],
    ['provenance', 'REAL'],
    ['versionNumber', 3],
    ['createdAt', '2026-05-01T00:00:00Z'],
    ['supersededFrom', '2026-06-01T00:00:00Z'],
    ['label', 'Rule label'],
  ])('refuses the server-owned or foreign field %s', (field, value) => {
    expect(rejectedField({ ...valid, [field]: value })).toMatchObject({
      code: 'VALIDATION_ERROR',
      field: 'tariffVersion',
    });
  });

  it.each([null, [], 'tariff', 3])(
    'refuses a non-object payload %j',
    (body) => {
      expect(rejectedField(body)).toMatchObject({
        code: 'VALIDATION_ERROR',
        field: 'tariffVersion',
      });
    },
  );
});
