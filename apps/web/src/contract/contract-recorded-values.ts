import { useInterfaceLocale } from '../localization/interface-locale';

/** Presentation of immutable recorded Contract values, never command values. */
export function useContractRecordedValues() {
  const { locale, formatDate, formatNumber } = useInterfaceLocale();
  const integerFormatter = new Intl.NumberFormat(locale);
  const decimalSeparator =
    new Intl.NumberFormat(locale, { minimumFractionDigits: 1 })
      .formatToParts(1n)
      .find((part) => part.type === 'decimal')?.value ?? '.';

  function formatDecimal(value: string): string {
    const parts = /^(-?)(\d+)(?:\.(\d+))?$/u.exec(value);
    if (!parts) return value;
    const [, sign = '', integer = '0', fraction] = parts;
    // Keep every fractional digit; only group the exact integer for display.
    return `${sign}${integerFormatter.format(BigInt(integer))}${fraction === undefined ? '' : decimalSeparator + fraction}`;
  }

  function formatCalendarDate(value: string): string {
    // Differences accept literal strings. Only recognized calendar days have
    // date presentation; malformed or noncanonical values stay safe literals.
    if (
      !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
      !Number.isFinite(Date.parse(value)) ||
      new Date(value).toISOString().slice(0, 10) !== value
    )
      return value;
    return formatDate(value);
  }

  return { formatDecimal, formatCalendarDate, formatNumber };
}
