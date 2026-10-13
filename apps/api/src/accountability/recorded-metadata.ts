/**
 * Shape checks for persisted commercial event rows. A row read back from the
 * database is an external boundary, so each family projection proves exactly
 * its recorded shape with these checks and fails closed otherwise.
 */

const UUID_GRAMMAR =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** The metadata carries exactly these fields, no more and no fewer. */
export function hasExactly(
  metadata: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  const recorded = Object.keys(metadata).sort();
  const expected = [...fields].sort();
  return (
    recorded.length === expected.length &&
    recorded.every((field, index) => field === expected[index])
  );
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function isIdentifier(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_GRAMMAR.test(value);
}

/**
 * A list of distinct members of one closed vocabulary, such as the warning
 * codes a quality rule set can acknowledge. Any other value fails closed.
 */
export function hasDistinctMembers(
  value: unknown,
  vocabulary: readonly string[],
): boolean {
  return (
    Array.isArray(value) &&
    new Set(value).size === value.length &&
    value.every((member) => vocabulary.some((known) => known === member))
  );
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
