import type { InterfaceLocale } from '../../localization/interface-locale';

/**
 * Calendar dates of Today. A business date is an exact `YYYY-MM-DD` value
 * from the server, formatted at UTC midnight so no time zone shifts its day,
 * as `formatDate` does for every other date of the application.
 */
export function longDate(locale: InterfaceLocale, date: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'full',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}

/** The short weekday and the day of the month of one business date. */
export function weekdayParts(
  locale: InterfaceLocale,
  date: string,
): { weekday: string; day: string } {
  const value = new Date(`${date}T00:00:00Z`);
  return {
    weekday: new Intl.DateTimeFormat(locale, {
      weekday: 'short',
      timeZone: 'UTC',
    }).format(value),
    day: new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      timeZone: 'UTC',
    }).format(value),
  };
}

/** The browser's own calendar date, until the server's business date is read. */
export function browserDate(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
