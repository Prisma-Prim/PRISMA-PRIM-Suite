import { describe, expect, it } from 'vitest';
import {
  MAXIMUM_PRICING_RULE_VERSION_NUMBER,
  decidePricingRulePublication,
  pricingRuleVersionState,
  type PricingRuleHead,
} from './pricing-rule-version.policy.js';
import type { PublishPricingRuleVersionCommand } from './pricing-configuration.types.js';

const instant = (value: string) => new Date(value);

// PRD section 7: three versions published in order; v1 and v2 received their
// supersededFrom from the successor's effectiveFrom.
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

describe('derived Pricing Rule Version state', () => {
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
      state: pricingRuleVersionState(version, instant(now)),
    }));
    expect(
      states.filter(({ state }) => state === 'CURRENT').map(({ name }) => name),
    ).toEqual(current === 'none' ? [] : [current]);
  });

  it('keeps a future successor SCHEDULED and its predecessor CURRENT until the takeover instant', () => {
    const now = instant('2026-02-15T12:00:00Z');
    expect(
      chain.map((version) => pricingRuleVersionState(version, now)),
    ).toEqual(['CURRENT', 'SCHEDULED', 'SCHEDULED']);
    expect(
      chain.map((version) =>
        pricingRuleVersionState(version, instant('2026-04-01T00:00:00Z')),
      ),
    ).toEqual(['SUPERSEDED', 'SUPERSEDED', 'CURRENT']);
  });

  it('treats an expired head without successor as SUPERSEDED', () => {
    expect(
      pricingRuleVersionState(chain[2], instant('2026-05-01T00:00:00Z')),
    ).toBe('SUPERSEDED');
  });
});

describe('Pricing Rule publication decisions', () => {
  const head: PricingRuleHead = {
    versionNumber: 1,
    label: 'Illustrative rule A',
    effectiveFrom: instant('2026-04-01T00:00:00Z'),
    effectiveTo: instant('2026-05-01T00:00:00Z'),
  };
  const successor = (
    effectiveFrom: string,
    overrides: Partial<PublishPricingRuleVersionCommand> = {},
  ): PublishPricingRuleVersionCommand => ({
    label: 'Illustrative rule B',
    effectiveFrom: instant(effectiveFrom),
    effectiveTo: null,
    expectedActiveVersionNumber: 1,
    ...overrides,
  });

  it('allocates version 1 for the first publication of a Company', () => {
    expect(
      decidePricingRulePublication({
        head: undefined,
        command: successor('2026-04-01T00:00:00Z', {
          expectedActiveVersionNumber: null,
        }),
        now: instant('2026-04-01T00:00:00Z'),
      }),
    ).toEqual({ kind: 'publish', versionNumber: 1, predecessor: undefined });
  });

  it.each([
    [undefined, 1, null],
    [head, null, 1],
    [{ ...head, versionNumber: 2 }, 1, 2],
  ])(
    'names only the current head number on a stale expectation',
    (currentHead, expected, headVersionNumber) => {
      expect(
        decidePricingRulePublication({
          head: currentHead,
          command: successor('2026-06-01T00:00:00Z', {
            expectedActiveVersionNumber: expected,
          }),
          now: instant('2026-04-15T00:00:00Z'),
        }),
      ).toEqual({ kind: 'stale', headVersionNumber });
    },
  );

  it.each([
    ['2026-04-30T12:00:00Z', '2026-05-01T00:00:00Z', { kind: 'publish' }],
    [
      '2026-04-30T12:00:00Z',
      '2026-05-02T00:00:00Z',
      { kind: 'rejected', code: 'EFFECTIVE_WINDOW_GAP' },
    ],
    ['2026-05-01T00:00:00Z', '2026-05-02T00:00:00Z', { kind: 'publish' }],
    ['2026-05-02T00:00:00Z', '2026-05-03T00:00:00Z', { kind: 'publish' }],
    [
      '2026-05-02T00:00:00Z',
      '2026-05-01T00:00:00Z',
      { kind: 'rejected', code: 'EFFECTIVE_FROM_PAST' },
    ],
  ])(
    'holds the section 11.3 boundary row committed at %s for a successor from %s',
    (commitInstant, effectiveFrom, expected) => {
      expect(
        decidePricingRulePublication({
          head,
          command: successor(effectiveFrom),
          now: instant(commitInstant),
        }),
      ).toEqual(
        expected.kind === 'publish'
          ? { kind: 'publish', versionNumber: 2, predecessor: head }
          : expected,
      );
    },
  );

  it('accepts a start exactly at the commit instant and rejects a start before it', () => {
    const now = instant('2026-04-15T00:00:00Z');
    const open = { ...head, effectiveTo: null };
    expect(
      decidePricingRulePublication({
        head: open,
        command: successor('2026-04-15T00:00:00Z'),
        now,
      }),
    ).toEqual({ kind: 'publish', versionNumber: 2, predecessor: open });
    expect(
      decidePricingRulePublication({
        head: open,
        command: successor('2026-04-14T23:59:59.999Z'),
        now,
      }),
    ).toEqual({ kind: 'rejected', code: 'EFFECTIVE_FROM_PAST' });
  });

  it('requires a successor to start strictly after the head, including a scheduled head', () => {
    const scheduled = {
      ...head,
      effectiveFrom: instant('2026-06-01T00:00:00Z'),
      effectiveTo: null,
    };
    for (const effectiveFrom of [
      '2026-06-01T00:00:00Z',
      '2026-05-31T00:00:00Z',
    ])
      expect(
        decidePricingRulePublication({
          head: scheduled,
          command: successor(effectiveFrom),
          now: instant('2026-04-15T00:00:00Z'),
        }),
      ).toEqual({ kind: 'rejected', code: 'EFFECTIVE_FROM_NOT_ADVANCING' });
    expect(
      decidePricingRulePublication({
        head: scheduled,
        command: successor('2026-06-01T00:00:00.001Z'),
        now: instant('2026-04-15T00:00:00Z'),
      }),
    ).toEqual({ kind: 'publish', versionNumber: 2, predecessor: scheduled });
  });

  it('reports back-dating before a non-advancing start', () => {
    expect(
      decidePricingRulePublication({
        head: { ...head, effectiveTo: null },
        command: successor('2026-03-01T00:00:00Z'),
        now: instant('2026-04-15T00:00:00Z'),
      }),
    ).toEqual({ kind: 'rejected', code: 'EFFECTIVE_FROM_PAST' });
  });

  it('never creates a gap from an open-ended head', () => {
    const open = { ...head, effectiveTo: null };
    expect(
      decidePricingRulePublication({
        head: open,
        command: successor('2027-01-01T00:00:00Z'),
        now: instant('2026-04-15T00:00:00Z'),
      }),
    ).toEqual({ kind: 'publish', versionNumber: 2, predecessor: open });
  });

  it('returns UNCHANGED for identical head content after its start and after its expiry', () => {
    const identical = successor('2026-04-01T00:00:00Z', {
      label: head.label,
      effectiveTo: instant('2026-05-01T00:00:00Z'),
    });
    for (const now of [
      '2026-03-01T00:00:00Z',
      '2026-04-15T00:00:00Z',
      '2026-06-01T00:00:00Z',
    ])
      expect(
        decidePricingRulePublication({
          head,
          command: identical,
          now: instant(now),
        }),
      ).toEqual({ kind: 'unchanged', head });
  });

  it('compares the label exactly and the window as instants', () => {
    const now = instant('2026-04-15T00:00:00Z');
    expect(
      decidePricingRulePublication({
        head,
        command: successor('2026-04-01T00:00:00Z', {
          label: `${head.label} `,
          effectiveTo: head.effectiveTo,
        }),
        now,
      }),
    ).toEqual({ kind: 'rejected', code: 'EFFECTIVE_FROM_PAST' });
    expect(
      decidePricingRulePublication({
        head,
        command: successor('2026-04-01T00:00:00Z', {
          label: head.label,
          effectiveTo: null,
        }),
        now,
      }),
    ).toEqual({ kind: 'rejected', code: 'EFFECTIVE_FROM_PAST' });
    expect(
      decidePricingRulePublication({
        head,
        command: successor('2026-04-01T03:00:00+03:00', {
          label: head.label,
          effectiveTo: instant('2026-05-01T02:00:00+02:00'),
        }),
        now,
      }),
    ).toEqual({ kind: 'unchanged', head });
  });

  it('refuses a material publication beyond the stored version range but keeps the no-op', () => {
    const maximum = {
      ...head,
      versionNumber: MAXIMUM_PRICING_RULE_VERSION_NUMBER,
      effectiveTo: null,
    };
    const now = instant('2026-04-15T00:00:00Z');
    expect(MAXIMUM_PRICING_RULE_VERSION_NUMBER).toBe(2_147_483_647);
    expect(
      decidePricingRulePublication({
        head: maximum,
        command: successor('2026-06-01T00:00:00Z', {
          expectedActiveVersionNumber: MAXIMUM_PRICING_RULE_VERSION_NUMBER,
        }),
        now,
      }),
    ).toEqual({ kind: 'rejected', code: 'VERSION_EXHAUSTED' });
    expect(
      decidePricingRulePublication({
        head: maximum,
        command: successor('2026-04-01T00:00:00Z', {
          label: head.label,
          expectedActiveVersionNumber: MAXIMUM_PRICING_RULE_VERSION_NUMBER,
        }),
        now,
      }),
    ).toEqual({ kind: 'unchanged', head: maximum });
  });
});
