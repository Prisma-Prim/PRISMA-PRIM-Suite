import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { readPublishPricingRuleVersionCommand } from './pricing-rule-version.validation.js';

const valid = {
  label: 'Illustrative rule A',
  effectiveFrom: '2026-05-01T00:00:00Z',
  expectedActiveVersionNumber: null,
};

function rejectedField(value: unknown): unknown {
  let failure: unknown;
  try {
    readPublishPricingRuleVersionCommand(value);
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

describe('Pricing Rule Version publication payload', () => {
  it('reads explicit instants, an optional end and a null first-publication expectation', () => {
    expect(readPublishPricingRuleVersionCommand(valid)).toEqual({
      label: 'Illustrative rule A',
      effectiveFrom: new Date('2026-05-01T00:00:00.000Z'),
      effectiveTo: null,
      expectedActiveVersionNumber: null,
    });
    expect(
      readPublishPricingRuleVersionCommand({
        ...valid,
        effectiveFrom: '2026-05-01T03:00:00.250+03:00',
        effectiveTo: '2026-06-01T00:00:00-01:30',
        expectedActiveVersionNumber: 2_147_483_647,
      }),
    ).toEqual({
      label: 'Illustrative rule A',
      effectiveFrom: new Date('2026-05-01T00:00:00.250Z'),
      effectiveTo: new Date('2026-06-01T01:30:00.000Z'),
      expectedActiveVersionNumber: 2_147_483_647,
    });
    expect(
      readPublishPricingRuleVersionCommand({ ...valid, effectiveTo: null })
        .effectiveTo,
    ).toBeNull();
  });

  it('keeps the label exactly as submitted', () => {
    expect(
      readPublishPricingRuleVersionCommand({ ...valid, label: '  Rule  A ' })
        .label,
    ).toBe('  Rule  A ');
    expect(
      readPublishPricingRuleVersionCommand({
        ...valid,
        label: '😀'.repeat(120),
      }).label,
    ).toBe('😀'.repeat(120));
    expect(
      readPublishPricingRuleVersionCommand({
        ...valid,
        label: 'Régle étape ✓ 価格 \u{1f600}',
      }).label,
    ).toBe('Régle étape ✓ 価格 \u{1f600}');
  });

  it.each([
    [{ ...valid, label: '' }, 'label'],
    [{ ...valid, label: ' \t\n ' }, 'label'],
    [{ ...valid, label: 'x'.repeat(121) }, 'label'],
    [{ ...valid, label: '😀'.repeat(121) }, 'label'],
    // PostgreSQL text cannot store U+0000, whatever the label's length.
    [{ ...valid, label: '\u0000' }, 'label'],
    [{ ...valid, label: 'Rule\u0000A' }, 'label'],
    [{ ...valid, label: `${'😀'.repeat(119)}\u0000` }, 'label'],
    [{ ...valid, label: 7 }, 'label'],
    [
      { effectiveFrom: valid.effectiveFrom, expectedActiveVersionNumber: null },
      'label',
    ],
    [{ ...valid, effectiveFrom: undefined }, 'effectiveFrom'],
    [{ ...valid, effectiveFrom: '2026-05-01' }, 'effectiveFrom'],
    [{ ...valid, effectiveFrom: '2026-05-01T00:00:00' }, 'effectiveFrom'],
    [{ ...valid, effectiveFrom: '2026-05-01T00:00Z' }, 'effectiveFrom'],
    [{ ...valid, effectiveFrom: '2026-05-01 00:00:00Z' }, 'effectiveFrom'],
    [{ ...valid, effectiveFrom: ' 2026-05-01T00:00:00Z' }, 'effectiveFrom'],
    [{ ...valid, effectiveFrom: '2026-02-29T00:00:00Z' }, 'effectiveFrom'],
    [{ ...valid, effectiveFrom: '2026-02-30T00:00:00Z' }, 'effectiveFrom'],
    [{ ...valid, effectiveFrom: '2026-13-01T00:00:00Z' }, 'effectiveFrom'],
    [{ ...valid, effectiveFrom: '2026-05-01T24:00:00Z' }, 'effectiveFrom'],
    [{ ...valid, effectiveFrom: '2026-05-01T00:60:00Z' }, 'effectiveFrom'],
    [{ ...valid, effectiveFrom: '2026-05-01T00:00:60Z' }, 'effectiveFrom'],
    [{ ...valid, effectiveFrom: '2026-05-01T00:00:00.1234Z' }, 'effectiveFrom'],
    [{ ...valid, effectiveFrom: '2026-05-01T00:00:00+24:00' }, 'effectiveFrom'],
    [{ ...valid, effectiveFrom: '2026-05-01T00:00:00+0300' }, 'effectiveFrom'],
    [{ ...valid, effectiveFrom: '2026-05-01T00:00:00z' }, 'effectiveFrom'],
    [{ ...valid, effectiveFrom: 1_777_593_600_000 }, 'effectiveFrom'],
    [{ ...valid, effectiveTo: '' }, 'effectiveTo'],
    [{ ...valid, effectiveTo: 'tomorrow' }, 'effectiveTo'],
    [{ ...valid, effectiveTo: valid.effectiveFrom }, 'effectiveTo'],
    [{ ...valid, effectiveTo: '2026-05-01T02:00:00+03:00' }, 'effectiveTo'],
    [{ ...valid, effectiveTo: '2026-04-30T23:59:59.999Z' }, 'effectiveTo'],
  ])('rejects %j on its field', (body, field) => {
    expect(rejectedField(body)).toMatchObject({
      code: 'VALIDATION_ERROR',
      field,
    });
  });

  it.each([0, -1, 1.5, '1', 2_147_483_648, Number.MAX_SAFE_INTEGER, true, {}])(
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

  it('requires the expected head number to be stated, even as null', () => {
    expect(
      rejectedField({
        label: valid.label,
        effectiveFrom: valid.effectiveFrom,
      }),
    ).toMatchObject({
      code: 'VALIDATION_ERROR',
      field: 'expectedActiveVersionNumber',
    });
  });

  it.each([
    ['provenance', 'REAL'],
    ['versionNumber', 3],
    ['ruleShape', 'UNIT_PRICE_TIMES_QUANTITY'],
    ['roundingMode', 'HALF_EVEN'],
    ['roundingScale', 4],
    ['taxApplication', 'PER_LINE'],
    ['createdAt', '2026-05-01T00:00:00Z'],
    ['supersededFrom', '2026-06-01T00:00:00Z'],
  ])('refuses the server-owned field %s', (field, value) => {
    expect(rejectedField({ ...valid, [field]: value })).toMatchObject({
      code: 'VALIDATION_ERROR',
      field: 'ruleVersion',
    });
  });

  it.each([null, [], 'rule', 3])('refuses a non-object payload %j', (body) => {
    expect(rejectedField(body)).toMatchObject({
      code: 'VALIDATION_ERROR',
      field: 'ruleVersion',
    });
  });
});
