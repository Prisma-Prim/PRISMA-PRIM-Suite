import {
  useInterfaceLocale,
  type InterfaceLocale,
} from '../localization/interface-locale';

// Only presentation changes: integer grouping uses BigInt, and the original
// fractional digits never pass through floating-point arithmetic or rounding.
function formatDecimal(value: string, locale: InterfaceLocale): string {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/u.exec(value);
  if (!match) return value;
  const [, sign, integer, fraction] = match;
  if (integer === undefined || sign === undefined) return value;
  const formatter = new Intl.NumberFormat(locale);
  const grouped = formatter.format(BigInt(integer));
  const decimal = formatter
    .formatToParts(1.1)
    .find((part) => part.type === 'decimal')?.value;
  return `${sign}${grouped}${fraction === undefined ? '' : `${decimal ?? '.'}${fraction}`}`;
}

export function useOfferPresentation() {
  const { locale, formatDateTime, formatNumber } = useInterfaceLocale();
  return {
    formatDateTime,
    formatNumber,
    formatDecimal: (value: string) => formatDecimal(value, locale),
  };
}
