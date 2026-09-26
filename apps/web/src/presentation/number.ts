/** Formats a whole count with the document's locale, as dates are formatted. */
export function formatApplicationCount(value: number): string {
  const locale = document.documentElement.lang || navigator.language;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(
    value,
  );
}
