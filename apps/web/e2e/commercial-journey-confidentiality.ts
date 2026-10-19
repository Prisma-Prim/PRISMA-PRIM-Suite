/** Forbidden commercial values found anywhere in a public JSON response. */
export function findConfidentialCommercialValues({
  body,
  forbidden,
}: {
  body: string;
  forbidden: readonly string[];
}): string[] {
  const payload: unknown = JSON.parse(body);
  return forbidden.filter((value) => {
    const amount = /^\d+\.\d+$/u.test(value) ? Number(value) : null;
    if (amount === null && body.includes(value)) return true;
    function contains(candidate: unknown): boolean {
      if (typeof candidate === 'string') {
        if (amount === null) return candidate.includes(value);
        // A complete numeric string/key may omit or add trailing zeroes.
        if (/^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/u.test(candidate))
          return Number(candidate) === amount;
        // Consume a clock time as one lexical token, so its fractional
        // seconds are not prices. Other decimals in the same string still
        // count; integer UUID segments never become monetary tokens.
        return Array.from(
          candidate.matchAll(
            /(?<![\d.])(?:\d{2}:\d{2}:\d{2}(?:\.\d+)?|\d+\.\d+(?:[eE][+-]?\d+)?)(?![\d.])/gu,
          ),
        ).some(([decimal]) => Number(decimal) === amount);
      }
      // JSON numbers do not preserve trailing zeroes: 4.5 is also 4.50.
      if (typeof candidate === 'number')
        return amount !== null
          ? candidate === amount
          : String(candidate).includes(value);
      if (candidate === null || typeof candidate !== 'object') return false;
      if (Array.isArray(candidate)) {
        const items: unknown[] = candidate;
        return items.some(contains);
      }
      const entries: [string, unknown][] = Object.entries(candidate);
      return entries.some(([key, item]) => contains(key) || contains(item));
    }
    return contains(payload);
  });
}
