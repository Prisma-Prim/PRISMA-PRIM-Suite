import { describe, expect, it } from 'vitest';
import { latestBusinessDate, sameName } from './certification-attribution.js';

describe('certification attribution helpers', () => {
  it('accepts the date that is already today in the most advanced time zone', () => {
    expect(latestBusinessDate(new Date('2026-11-06T23:30:00.000Z'))).toBe(
      '2026-11-07',
    );
    expect(latestBusinessDate(new Date('2026-11-06T09:59:00.000Z'))).toBe(
      '2026-11-06',
    );
  });

  it('compares names without case, accents or repeated spaces', () => {
    expect(sameName('Ana  Ionescu', 'ANA IONESCU')).toBe(true);
    expect(sameName('Ştefan Demo', 'stefan demo')).toBe(true);
    expect(sameName('Ana Demo', 'Ana Demos')).toBe(false);
  });
});
