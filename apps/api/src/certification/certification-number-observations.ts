/** The own draft numbers already issued elsewhere, observed in a Case command. */
export interface NumberObservation {
  caseRevision: number;
  numbers: readonly string[];
}

/** Persisted source snapshots are strict: silently losing a number rewrites history. */
export function observedNumbers(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('Unreadable number observation.');
  const numbers: string[] = [];
  for (const number of value) {
    if (
      typeof number !== 'string' ||
      number.length < 1 ||
      number.length > 64 ||
      number !== number.trim() ||
      numbers.includes(number)
    )
      throw new Error('Unreadable number observation.');
    numbers.push(number);
  }
  return numbers;
}
