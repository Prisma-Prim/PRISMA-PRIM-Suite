import { describe, expect, it } from 'vitest';
import type { PublishTariffVersionCommand } from './pricing-configuration.types.js';
import {
  decideTariffPublication,
  tariffVersionState,
  type TariffHead,
} from './tariff-version.policy.js';

const instant = (value: string) => new Date(value);

// PRD section 7: one offering holds three Tariff Versions published in order;
// v1 and v2 received their supersededFrom from the successor's effectiveFrom.
const chain = [
  {
    name: 'v1',
    effectiveFrom: instant('2026-01-01T00:00:00Z'),
    effectiveTo: null,
    supersededFrom: instant('2026-03-01T00:00:00Z'),
  },
  {
    name: 'v2',
    effectiveFrom: instant('2026-03-01T00:00:00Z'),
    effectiveTo: instant('2026-06-01T00:00:00Z'),
    supersededFrom: instant('2026-04-01T00:00:00Z'),
  },
  {
    name: 'v3',
    effectiveFrom: instant('2026-04-01T00:00:00Z'),
    effectiveTo: instant('2026-05-01T00:00:00Z'),
    supersededFrom: null,
  },
] as const;

describe('derived Tariff Version state', () => {
  it.each([
    ['2025-12-31T23:59:59Z', 'none'],
    ['2026-01-01T00:00:00Z', 'v1'],
    ['2026-02-15T12:00:00Z', 'v1'],
    ['2026-03-01T00:00:00Z', 'v2'],
    ['2026-04-01T00:00:00Z', 'v3'],
    ['2026-04-30T23:59:59Z', 'v3'],
    ['2026-05-01T00:00:00Z', 'none'],
    ['2026-07-01T00:00:00Z', 'none'],
  ])('holds the section 7 CURRENT column at %s', (now, current) => {
    const states = chain.map((version) => ({
      name: version.name,
      state: tariffVersionState(version, instant(now)),
    }));
    expect(
      states.filter(({ state }) => state === 'CURRENT').map(({ name }) => name),
    ).toEqual(current === 'none' ? [] : [current]);
  });
});

describe('Tariff publication decisions', () => {
  // Synthetic values only: no real unit, price or tax.
  const head: TariffHead = {
    versionNumber: 1,
    unit: 'illustrative-unit',
    unitAmount: '12.5000',
    currency: 'EUR',
    taxRatePercent: '20.00',
    taxLabel: 'Illustrative tax',
    effectiveFrom: instant('2026-04-01T00:00:00Z'),
    effectiveTo: instant('2026-05-01T00:00:00Z'),
  };
  const identical = (
    overrides: Partial<PublishTariffVersionCommand> = {},
  ): PublishTariffVersionCommand => ({
    unit: head.unit,
    unitAmount: head.unitAmount,
    currency: head.currency,
    taxRatePercent: head.taxRatePercent,
    taxLabel: head.taxLabel,
    effectiveFrom: head.effectiveFrom,
    effectiveTo: head.effectiveTo,
    expectedActiveVersionNumber: 1,
    ...overrides,
  });
  const now = instant('2026-04-15T00:00:00Z');

  it('allocates version 1 for the first publication of an offering', () => {
    expect(
      decideTariffPublication({
        head: undefined,
        command: identical({
          effectiveFrom: now,
          expectedActiveVersionNumber: null,
        }),
        now,
      }),
    ).toEqual({ kind: 'publish', versionNumber: 1, predecessor: undefined });
  });

  it('names only the offering head number on a stale expectation, before any content or time rule', () => {
    expect(
      decideTariffPublication({
        head,
        command: identical({ expectedActiveVersionNumber: null }),
        now,
      }),
    ).toEqual({ kind: 'stale', headVersionNumber: 1 });
    expect(
      decideTariffPublication({
        head: undefined,
        command: identical({ expectedActiveVersionNumber: 1 }),
        now,
      }),
    ).toEqual({ kind: 'stale', headVersionNumber: null });
  });

  it.each([
    ['12.5', '20'],
    ['12.50', '20.0'],
    ['12.5000', '20.00'],
  ])(
    'compares the amount %s and the rate %s by numeric value, returning UNCHANGED after the head starts and expires',
    (unitAmount, taxRatePercent) => {
      for (const at of [
        '2026-03-01T00:00:00Z',
        '2026-04-15T00:00:00Z',
        '2026-06-01T00:00:00Z',
      ])
        expect(
          decideTariffPublication({
            head,
            command: identical({ unitAmount, taxRatePercent }),
            now: instant(at),
          }),
        ).toEqual({ kind: 'unchanged', head });
    },
  );

  it('compares the window as instants whatever offset spelled it', () => {
    expect(
      decideTariffPublication({
        head,
        command: identical({
          effectiveFrom: instant('2026-04-01T03:00:00+03:00'),
          effectiveTo: instant('2026-05-01T02:00:00+02:00'),
        }),
        now,
      }),
    ).toEqual({ kind: 'unchanged', head });
  });

  it.each([
    ['unit', { unit: 'illustrative-unit ' }],
    ['unit case', { unit: 'Illustrative-unit' }],
    ['amount', { unitAmount: '12.5001' }],
    ['currency', { currency: 'RON' as const }],
    ['rate', { taxRatePercent: '20.01' }],
    ['tax label', { taxLabel: 'Illustrative tax ' }],
    ['end', { effectiveTo: null }],
  ])(
    'treats a different %s as material content, which then meets the time rules',
    (_name, overrides) => {
      // Identical start, so a material successor is back-dated at this instant.
      expect(
        decideTariffPublication({
          head,
          command: identical(overrides),
          now,
        }),
      ).toEqual({ kind: 'rejected', code: 'EFFECTIVE_FROM_PAST' });
    },
  );

  it('lets a successor declare another currency of the closed set', () => {
    expect(
      decideTariffPublication({
        head,
        command: identical({
          currency: 'USD',
          effectiveFrom: instant('2026-05-01T00:00:00Z'),
          effectiveTo: null,
        }),
        now,
      }),
    ).toEqual({ kind: 'publish', versionNumber: 2, predecessor: head });
  });

  it.each([
    ['2026-04-30T12:00:00Z', '2026-04-30T12:00:00Z', { kind: 'publish' }],
    ['2026-04-30T12:00:00Z', '2026-05-01T00:00:00Z', { kind: 'publish' }],
    [
      '2026-04-30T12:00:00Z',
      '2026-05-02T00:00:00Z',
      { kind: 'rejected', code: 'EFFECTIVE_WINDOW_GAP' },
    ],
    ['2026-04-30T23:59:59Z', '2026-05-01T00:00:00Z', { kind: 'publish' }],
    ['2026-05-01T00:00:00Z', '2026-05-02T00:00:00Z', { kind: 'publish' }],
    ['2026-05-02T00:00:00Z', '2026-05-03T00:00:00Z', { kind: 'publish' }],
    [
      '2026-05-02T00:00:00Z',
      '2026-05-01T00:00:00Z',
      { kind: 'rejected', code: 'EFFECTIVE_FROM_PAST' },
    ],
  ])(
    'holds the section 11.3 boundary row published at %s for a successor from %s',
    (publicationInstant, effectiveFrom, expected) => {
      expect(
        decideTariffPublication({
          head,
          command: identical({
            unitAmount: '13',
            effectiveFrom: instant(effectiveFrom),
            effectiveTo: null,
          }),
          now: instant(publicationInstant),
        }),
      ).toEqual(
        expected.kind === 'publish'
          ? { kind: 'publish', versionNumber: 2, predecessor: head }
          : expected,
      );
    },
  );

  it('requires a successor to start strictly after the head start', () => {
    const scheduled = {
      ...head,
      effectiveFrom: instant('2026-06-01T00:00:00Z'),
      effectiveTo: null,
    };
    expect(
      decideTariffPublication({
        head: scheduled,
        command: identical({
          unitAmount: '13',
          effectiveFrom: instant('2026-06-01T00:00:00Z'),
          effectiveTo: null,
        }),
        now,
      }),
    ).toEqual({ kind: 'rejected', code: 'EFFECTIVE_FROM_NOT_ADVANCING' });
  });

  it('refuses a material publication beyond the stored version range but keeps the no-op', () => {
    const maximum = { ...head, versionNumber: 2_147_483_647 };
    expect(
      decideTariffPublication({
        head: maximum,
        command: identical({
          unitAmount: '13',
          effectiveFrom: instant('2026-04-20T00:00:00Z'),
          expectedActiveVersionNumber: 2_147_483_647,
        }),
        now,
      }),
    ).toEqual({ kind: 'rejected', code: 'VERSION_EXHAUSTED' });
    expect(
      decideTariffPublication({
        head: maximum,
        command: identical({ expectedActiveVersionNumber: 2_147_483_647 }),
        now,
      }),
    ).toEqual({ kind: 'unchanged', head: maximum });
  });
});
