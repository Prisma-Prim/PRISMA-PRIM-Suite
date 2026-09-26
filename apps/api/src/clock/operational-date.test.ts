import { describe, expect, it } from 'vitest';
import {
  OPERATIONAL_TIME_ZONE,
  calendarDaysBetween,
  operationalDate,
} from './operational-date.js';

describe('operational calendar date', () => {
  it('uses the provisional Europe/Chisinau Workspace default', () => {
    expect(OPERATIONAL_TIME_ZONE).toBe('Europe/Chisinau');
  });

  it.each([
    // Chisinau is already on the 27th while the UTC date is still the 26th.
    ['2026-09-26T21:30:00.000Z', '2026-09-27'],
    ['2026-09-26T20:59:59.999Z', '2026-09-26'],
    ['2026-09-26T21:00:00.000Z', '2026-09-27'],
    // Winter time is UTC+2.
    ['2026-12-31T21:59:59.999Z', '2026-12-31'],
    ['2026-12-31T22:00:00.000Z', '2027-01-01'],
    // The spring-forward and fall-back days keep their calendar dates.
    ['2026-03-29T00:30:00.000Z', '2026-03-29'],
    ['2026-10-25T21:30:00.000Z', '2026-10-25'],
    ['2026-10-25T22:00:00.000Z', '2026-10-26'],
  ])('derives the calendar date of %s as %s', (instant, date) => {
    expect(operationalDate(new Date(instant))).toBe(date);
  });

  it('counts whole calendar days between exact dates across months, years and DST', () => {
    expect(calendarDaysBetween('2026-09-26', '2026-09-27')).toBe(1);
    expect(calendarDaysBetween('2026-09-20', '2026-09-27')).toBe(7);
    expect(calendarDaysBetween('2026-10-24', '2026-10-27')).toBe(3);
    expect(calendarDaysBetween('2025-12-31', '2026-01-01')).toBe(1);
    expect(calendarDaysBetween('0099-12-31', '0100-01-01')).toBe(1);
    expect(calendarDaysBetween('2026-09-27', '2026-09-27')).toBe(0);
  });

  it('rejects a value that is not an exact calendar date', () => {
    expect(() => calendarDaysBetween('2026-9-1', '2026-09-27')).toThrow();
    expect(() => calendarDaysBetween('2026-09-27', 'not a date')).toThrow();
  });
});
