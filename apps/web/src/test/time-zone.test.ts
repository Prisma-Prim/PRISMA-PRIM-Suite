import { expect, it } from 'vitest';

// Read when the file loads, before any test formats a date.
const zoneAtLoad = Intl.DateTimeFormat().resolvedOptions().timeZone;

it('runs the web unit tests in UTC whatever the machine time zone', () => {
  // The pin itself. CI and developer shells leave TZ unset, so without the
  // `test.env` pin of vite.config.ts this fails even on a UTC machine.
  expect(process.env.TZ).toBe('UTC');
  expect(zoneAtLoad).toBe('UTC');
  // Paris, Kiritimati and Los Angeles each show this instant at another
  // date or hour.
  const instant = new Date('2026-01-15T23:30:00.000Z');
  expect(instant.getTimezoneOffset()).toBe(0);
  expect(
    new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(instant),
  ).toBe('15/01/2026, 23:30');
});
