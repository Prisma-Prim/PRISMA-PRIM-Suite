export function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function exact(value: Record<string, unknown>, keys: readonly string[]) {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
export function uuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  );
}
export function positive(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= 2147483647
  );
}
export function literal(value: unknown, maximum: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    value.trim().length > 0 &&
    !/[\uD800-\uDFFF]/u.test(value) &&
    !/\p{Cc}/u.test(value)
  );
}
export function calendar(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^(?!0000)[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/u.test(value)
  )
    return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8));
  const days = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  const limit = days[month - 1];
  return limit !== undefined && day <= limit;
}
export function utc(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?Z$/u.test(
      value,
    ) &&
    calendar(value.slice(0, 10)) &&
    Number.isFinite(Date.parse(value))
  );
}
export function currency(
  value: unknown,
): value is 'MDL' | 'EUR' | 'RON' | 'USD' {
  return (
    value === 'MDL' || value === 'EUR' || value === 'RON' || value === 'USD'
  );
}
function minor(value: unknown): value is string {
  return typeof value === 'string' && /^(?:0|[1-9][0-9]{0,13})$/u.test(value);
}
export type InvoiceValues = {
  externalSystem: string;
  externalNumber: string;
  issuedOn: string;
  dueOn: string | null;
  currency: 'MDL' | 'EUR' | 'RON' | 'USD';
  grossMinor: string;
  netMinor: string | null;
  taxMinor: string | null;
};
export function isInvoiceValues(value: unknown): value is InvoiceValues {
  return (
    object(value) &&
    exact(value, [
      'externalSystem',
      'externalNumber',
      'issuedOn',
      'dueOn',
      'currency',
      'grossMinor',
      'netMinor',
      'taxMinor',
    ]) &&
    literal(value.externalSystem, 120) &&
    literal(value.externalNumber, 200) &&
    calendar(value.issuedOn) &&
    (value.dueOn === null || calendar(value.dueOn)) &&
    currency(value.currency) &&
    minor(value.grossMinor) &&
    value.grossMinor !== '0' &&
    (value.netMinor === null || minor(value.netMinor)) &&
    (value.taxMinor === null || minor(value.taxMinor))
  );
}
export function sameValues(left: InvoiceValues, right: InvoiceValues) {
  return (
    left.externalSystem === right.externalSystem &&
    left.externalNumber === right.externalNumber &&
    left.issuedOn === right.issuedOn &&
    left.dueOn === right.dueOn &&
    left.currency === right.currency &&
    left.grossMinor === right.grossMinor &&
    left.netMinor === right.netMinor &&
    left.taxMinor === right.taxMinor
  );
}
