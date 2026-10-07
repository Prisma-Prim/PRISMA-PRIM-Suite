import type { ProfitabilityInputs } from './profitability-estimate.types.js';

// Only validated input reaches this deterministic boundary. Decimal strings
// remain text externally and scaled integers/rationals throughout arithmetic.
export function calculateProfitability(inputs: ProfitabilityInputs) {
  const total =
    money(inputs.executorCost) +
    money(inputs.fiscalCost) +
    money(inputs.allocatedOverhead) +
    inputs.directCosts.reduce((sum, line) => sum + money(line.amount), 0n);
  const price = money(inputs.proposedPrice);
  const profit = price - total;
  const percentageNumerator = profit * 100n;
  const target = decimal(inputs.targetProfitability);
  return {
    totalCost: atScaleTwo(total),
    profit: atScaleTwo(profit),
    profitabilityPercent: roundedRatio(percentageNumerator, price),
    // Round the exact difference independently, including negative halves.
    targetDifferencePercentagePoints: roundedRatio(
      percentageNumerator * target.denominator - target.numerator * price,
      price * target.denominator,
    ),
  };
}

function money(value: string): bigint {
  return BigInt(value.replace('.', ''));
}

function decimal(value: string): { numerator: bigint; denominator: bigint } {
  const negative = value.startsWith('-');
  const unsigned = value.replace(/^[+-]/u, '');
  const [integer = '0', fraction = ''] = unsigned.split('.');
  return {
    numerator: BigInt(`${integer}${fraction}`) * (negative ? -1n : 1n),
    denominator: 10n ** BigInt(fraction.length),
  };
}

function roundedRatio(numerator: bigint, denominator: bigint): string {
  const negative = numerator < 0n;
  const scaled = (negative ? -numerator : numerator) * 100n;
  const quotient = scaled / denominator;
  const remainder = scaled % denominator;
  const rounded = quotient + (remainder * 2n >= denominator ? 1n : 0n);
  return atScaleTwo(negative ? -rounded : rounded);
}

function atScaleTwo(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  return `${negative ? '-' : ''}${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;
}
