import type { InterfaceLocale } from '../localization/interface-locale';

/** Decimal UI grammar is deliberately independent from browser floating point. */
export function decimalToMinor(value: string): string | undefined {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/u.test(value)) return undefined;
  const [whole, fraction = ''] = value.split('.');
  if (whole === undefined) return undefined;
  const minor = `${whole}${fraction.padEnd(2, '0')}`.replace(
    /^0+(?=[0-9])/u,
    '',
  );
  return minor.length <= 14 ? minor : undefined;
}
export function minorToDecimal(value: string) {
  const digits = value.padStart(3, '0');
  return `${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
export function displayMoney({
  minor,
  currency,
  locale,
}: {
  minor: string;
  currency: string;
  locale: InterfaceLocale;
}) {
  const parts = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
  }).formatToParts(1000n);
  const separator = parts.find((part) => part.type === 'decimal')?.value ?? '.';
  const group = parts.find((part) => part.type === 'group')?.value ?? ',';
  const digits = minor.padStart(3, '0');
  const whole = digits
    .slice(0, -2)
    .replace(/\B(?=(?:[0-9]{3})+(?![0-9]))/gu, group);
  return `${whole}${separator}${digits.slice(-2)} ${currency}`;
}
