import { TAX_RATE_PERCENT_SCALE, scaledDecimal } from './pricing-decimal.js';
import type { PricingCalculationResultLine } from './pricing-calculation.js';

const MONEY_SCALE = 2;
const RAW_SCALE = 7;
const TAX_RESULT_SCALE = MONEY_SCALE + TAX_RATE_PERCENT_SCALE + 2;
const ZERO_MONEY = '0.00';

export interface ValidatedFixedNetDiscount {
  readonly netReduction: string;
  readonly reason: string;
}

export type ValidatedPricingAdjustmentInputLine = Pick<
  PricingCalculationResultLine,
  'lineNet' | 'lineTax'
> & {
  readonly taxRatePercent: string;
  readonly adjustment: ValidatedFixedNetDiscount | null;
};

export interface AppliedFixedNetDiscount {
  readonly type: 'FIXED_NET_DISCOUNT';
  readonly netReduction: string;
  readonly reason: string;
}

export interface PricingAdjustmentResultLine {
  readonly adjustment: AppliedFixedNetDiscount | null;
  readonly netReduction: string;
  readonly taxReduction: string;
  readonly adjustedLineNet: string;
  readonly adjustedRawLineTax: string;
  readonly adjustedLineTax: string;
}

export interface PricingAdjustmentResult {
  readonly lines: PricingAdjustmentResultLine[];
  readonly subtotal: string;
  readonly taxTotal: string;
  readonly total: string;
}

// The public boundary owns field grammar and reason validation. This module
// receives that validated input and owns only the exact adjustment arithmetic.
export function applyPricingAdjustments(
  inputLines: readonly ValidatedPricingAdjustmentInputLine[],
): PricingAdjustmentResult {
  let subtotal = 0n;
  let taxTotal = 0n;

  const lines = inputLines.map((input): PricingAdjustmentResultLine => {
    const originalLineNet = scaledDecimal(input.lineNet, MONEY_SCALE);
    const originalLineTax = scaledDecimal(input.lineTax, MONEY_SCALE);
    const taxRatePercent = scaledDecimal(
      input.taxRatePercent,
      TAX_RATE_PERCENT_SCALE,
    );
    const netReduction =
      input.adjustment === null
        ? 0n
        : scaledDecimal(input.adjustment.netReduction, MONEY_SCALE);

    if (input.adjustment !== null && netReduction <= 0n)
      throw new Error('The fixed net discount must be positive.');
    if (netReduction > originalLineNet)
      throw new Error('The fixed net discount exceeds the original line net.');

    const adjustedLineNet = originalLineNet - netReduction;
    const adjustedRawLineTax =
      adjustedLineNet *
      taxRatePercent *
      powerOfTen(RAW_SCALE - TAX_RESULT_SCALE);
    const adjustedLineTax = roundHalfUp(
      adjustedRawLineTax,
      RAW_SCALE,
      MONEY_SCALE,
    );
    const taxReduction = originalLineTax - adjustedLineTax;

    subtotal += adjustedLineNet;
    taxTotal += adjustedLineTax;

    return {
      adjustment:
        input.adjustment === null
          ? null
          : {
              type: 'FIXED_NET_DISCOUNT',
              netReduction: input.adjustment.netReduction,
              reason: input.adjustment.reason,
            },
      netReduction:
        input.adjustment === null ? ZERO_MONEY : input.adjustment.netReduction,
      taxReduction: formatScaled(taxReduction, MONEY_SCALE),
      adjustedLineNet: formatScaled(adjustedLineNet, MONEY_SCALE),
      adjustedRawLineTax: formatScaled(adjustedRawLineTax, RAW_SCALE),
      adjustedLineTax: formatScaled(adjustedLineTax, MONEY_SCALE),
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
