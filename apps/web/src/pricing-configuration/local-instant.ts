import { localInstantCopy as copy } from './local-instant.copy';

// The browser-local instant reading shared by every Pricing Configuration
// publication form. A datetime-local value names a wall-clock time in the
// browser time zone; it is converted once to the explicit instant the server
// receives, or refused.

export type LocalInstant =
  | { kind: 'instant'; instant: string }
  | { kind: 'malformed' | 'skipped' | 'repeated' };

const localDateTimePattern =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/u;
const dayMilliseconds = 24 * 60 * 60 * 1000;

// A wall-clock reading names one instant in the browser time zone, none when
// a clock change skips it, or two when a clock change repeats it. Only a
// reading that names exactly one instant is converted; the others are
// refused, never moved to a neighbouring instant or resolved to either one.
export function localInstant(value: string): LocalInstant {
  const match = localDateTimePattern.exec(value);
  if (!match) return { kind: 'malformed' };
  const [, minutes, seconds = '00', fraction = ''] = match;
  // The reading spelled as the UTC instant that shows the same reading.
  const reading = `${minutes}:${seconds}.${fraction.padEnd(3, '0')}Z`;
  const wallClock = Date.parse(reading);
  if (Number.isNaN(wallClock) || new Date(wallClock).toISOString() !== reading)
    return { kind: 'malformed' };
  // A clock change near the reading shows as a different offset a day either
  // side of it. Each offset that holds at the instant it implies makes that
  // instant show the reading.
  const instants = [
    ...new Set(
      [wallClock - dayMilliseconds, wallClock + dayMilliseconds].map(offsetAt),
    ),
  ]
    .map((offset) => wallClock - offset)
    .filter((instant) => instant + offsetAt(instant) === wallClock);
  if (instants.length === 0) return { kind: 'skipped' };
  if (instants.length > 1) return { kind: 'repeated' };
  return { kind: 'instant', instant: new Date(instants[0]).toISOString() };
}

// A local time that a clock change skips or repeats names no single instant,
// so it is refused with the field and the zone rather than moved to a
// neighbouring one.
export function clockChangeRefusal(
  field: 'effectiveFrom' | 'effectiveTo',
  reason: 'skipped' | 'repeated',
  zone: string,
): string {
  return reason === 'skipped'
    ? copy.skippedTime[field](zone)
    : copy.repeatedTime[field](zone);
}

// The browser time zone's offset from UTC at an instant, in milliseconds.
function offsetAt(instant: number): number {
  return -new Date(instant).getTimezoneOffset() * 60 * 1000;
}
