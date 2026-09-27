import {
  TAX_RATE_PERCENT_SCALE,
  UNIT_AMOUNT_SCALE,
  QUANTITY_SCALE,
  scaledDecimal,
} from './pricing-decimal.js';

const RAW_SCALE = UNIT_AMOUNT_SCALE + QUANTITY_SCALE;
const MONEY_SCALE = 2;
const TAX_RESULT_SCALE = MONEY_SCALE + TAX_RATE_PERCENT_SCALE + 2;

export interface PricingCalculationInputLine {
  readonly unitAmount: string;
  readonly quantity: string;
  readonly taxRatePercent: string;
}

export interface PricingCalculationResultLine {
  readonly rawLineAmount: string;
  readonly lineNet: string;
  readonly rawLineTax: string;
  readonly lineTax: string;
}

export interface PricingCalculationResult {
  readonly lines: PricingCalculationResultLine[];
  readonly subtotal: string;
  readonly taxTotal: string;
  readonly total: string;
}

// Monetary, quantity and rate inputs stay as scaled integers for their whole
// path. Formatting is the only conversion, and it converts BigInt to text.
export function calculatePricingLines(
  inputLines: readonly PricingCalculationInputLine[],
): PricingCalculationResult {
  let subtotal = 0n;
  let taxTotal = 0n;
  const lines = inputLines.map((input): PricingCalculationResultLine => {
    const unitAmount = scaledDecimal(input.unitAmount, UNIT_AMOUNT_SCALE);
    const quantity = scaledDecimal(input.quantity, QUANTITY_SCALE);
    const taxRatePercent = scaledDecimal(
      input.taxRatePercent,
      TAX_RATE_PERCENT_SCALE,
    );
    const rawLineAmount = unitAmount * quantity;
    const lineNet = roundHalfUp(rawLineAmount, RAW_SCALE, MONEY_SCALE);
    // lineNet(scale 2) * tax rate(scale 2) / 100 has scale 6. Store the
    // complete result at scale 7, matching the raw amount trace column.
    const rawLineTax =
      lineNet * taxRatePercent * powerOfTen(RAW_SCALE - TAX_RESULT_SCALE);
    const lineTax = roundHalfUp(rawLineTax, RAW_SCALE, MONEY_SCALE);
    subtotal += lineNet;
    taxTotal += lineTax;
    return {
      rawLineAmount: formatScaled(rawLineAmount, RAW_SCALE),
      lineNet: formatScaled(lineNet, MONEY_SCALE),
      rawLineTax: formatScaled(rawLineTax, RAW_SCALE),
      lineTax: formatScaled(lineTax, MONEY_SCALE),
    };
  });
  return {
    lines,
    subtotal: formatScaled(subtotal, MONEY_SCALE),
    taxTotal: formatScaled(taxTotal, MONEY_SCALE),
    total: formatScaled(subtotal + taxTotal, MONEY_SCALE),
  };
}

function roundHalfUp(
  value: bigint,
  fromScale: number,
  toScale: number,
): bigint {
  const divisor = powerOfTen(fromScale - toScale);
  const whole = value / divisor;
  const remainder = value % divisor;
  return remainder * 2n >= divisor ? whole + 1n : whole;
}

function formatScaled(value: bigint, scale: number): string {
  const digits = value.toString().padStart(scale + 1, '0');
  if (scale === 0) return digits;
  return `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

function powerOfTen(scale: number): bigint {
  return 10n ** BigInt(scale);
}
