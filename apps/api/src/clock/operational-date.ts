/**
 * The one owner of the operational time zone and of the calendar date an
 * instant falls on there (Operational Dashboard PRD §17.1). A read samples the
 * server clock once and derives its "today" here; no other module derives it.
 * `Europe/Chisinau` is the provisional Workspace default; configurable
 * Workspace or Company time zones are deferred.
 */
export const OPERATIONAL_TIME_ZONE = 'Europe/Chisinau';

const operationalCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: OPERATIONAL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** The exact `YYYY-MM-DD` calendar date of an instant in the operational time zone. */
export function operationalDate(instant: Date): string {
  const parts = new Map(
    operationalCalendar
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  const year = parts.get('year');
  const month = parts.get('month');
  const day = parts.get('day');
  if (!year || !month || !day)
    throw new Error('The operational calendar date could not be derived.');
  return `${year.padStart(4, '0')}-${month}-${day}`;
}

/**
 * Whole calendar days from one exact `YYYY-MM-DD` date to a later one. Both
 * are calendar values, so no time zone applies.
 */
export function calendarDaysBetween(from: string, to: string): number {
  return (calendarDayNumber(to) - calendarDayNumber(from)) / 86_400_000;
}

function calendarDayNumber(date: string): number {
  // The ISO form keeps years 0001–0099 literal, unlike Date.UTC.
  const value = Date.parse(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || !Number.isFinite(value))
    throw new Error('Invalid calendar date.');
  return value;
}
