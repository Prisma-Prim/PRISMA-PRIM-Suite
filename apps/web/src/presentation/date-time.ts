export function formatApplicationDateTime(value: string): string {
  const locale = document.documentElement.lang || navigator.language;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
