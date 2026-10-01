export interface ProfitabilityCalculation {
  readonly totalCost: string;
  readonly profit: string;
  readonly estimatedProfitability: string;
  readonly targetDifference: string;
}

export function calculateProfitability(input: {
  readonly price: string;
  readonly costs: readonly string[];
  readonly target: string;
}): ProfitabilityCalculation {
  const price = moneyMinorUnits(input.price);
  const totalCost = input.costs.reduce(
    (total, amount) => total + moneyMinorUnits(amount),
    0n,
  );
  const profit = price - totalCost;
  const target = decimalFraction(input.target);
  const profitabilityHundredths = divideHalfAwayFromZero(
    profit * 10_000n,
    price,
  );
  const differenceHundredths = divideHalfAwayFromZero(
    profit * 10_000n * target.denominator - target.numerator * price * 100n,
    price * target.denominator,
  );
  return {
    totalCost: fixed(totalCost, 2),
    profit: fixed(profit, 2),
    estimatedProfitability: fixed(profitabilityHundredths, 2),
    targetDifference: fixed(differenceHundredths, 2),
  };
}

function moneyMinorUnits(value: string): bigint {
  const match = /^([0-9]+)\.([0-9]{2})$/.exec(value);
  if (!match?.[1] || !match[2]) throw new Error('Invalid monetary value.');
  return BigInt(match[1]) * 100n + BigInt(match[2]);
}

function decimalFraction(value: string): {
  readonly numerator: bigint;
  readonly denominator: bigint;
} {
  const match = /^(-?)([0-9]+)(?:\.([0-9]+))?$/.exec(value);
  if (!match?.[2]) throw new Error('Invalid decimal value.');
  const fraction = match[3] ?? '';
  const denominator = 10n ** BigInt(fraction.length);
  const magnitude = BigInt(`${match[2]}${fraction}`);
  return {
    numerator: match[1] === '-' ? -magnitude : magnitude,
    denominator,
  };
}

function divideHalfAwayFromZero(
  numerator: bigint,
  denominator: bigint,
): bigint {
  if (denominator <= 0n) throw new Error('The divisor must be positive.');
  const negative = numerator < 0n;
  const magnitude = negative ? -numerator : numerator;
  const quotient = magnitude / denominator;
  const rounded =
    (magnitude % denominator) * 2n >= denominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

function fixed(value: bigint, scale: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value)
    .toString()
    .padStart(scale + 1, '0');
  const integer = digits.slice(0, -scale);
  const fraction = digits.slice(-scale);
  return `${negative ? '-' : ''}${integer}.${fraction}`;
}
