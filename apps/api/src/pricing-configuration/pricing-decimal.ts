// Exact decimal values as scaled integers (PRD section 8.1). An amount or a
// rate never passes through Number or parseFloat; it is compared as a BigInt
// scaled by its column's decimal places.
export const UNIT_AMOUNT_SCALE = 4;
export const TAX_RATE_PERCENT_SCALE = 2;

const PLAIN_DECIMAL = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/u;

// Accepts a decimal string already proven by a grammar or read from a numeric
// column; anything else, or more places than the scale, is a defect.
export function scaledDecimal(value: string, scale: number): bigint {
  const parts = PLAIN_DECIMAL.exec(value);
  const integer = parts?.[1];
  const fraction = parts?.[2] ?? '';
  if (integer === undefined || fraction.length > scale)
    throw new Error('The decimal value exceeds its scale.');
  return BigInt(`${integer}${fraction.padEnd(scale, '0')}`);
}

// A numeric column read back as text carries exactly its column scale, such as
// 12.5000 for numeric(11,4). That spelling is valid under the input grammar
// and numerically equal to the submitted value.
export function decimalAtScale(value: string, scale: number): string {
  const parts = PLAIN_DECIMAL.exec(value);
  if (parts?.[2]?.length !== scale)
    throw new Error('The stored decimal is not at its column scale.');
  return value;
}
