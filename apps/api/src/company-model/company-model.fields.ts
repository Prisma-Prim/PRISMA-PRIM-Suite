/**
 * The field readers one Company model kind uses for its commands, content,
 * history pages and receipts. Each refuses with the kind's own error, so a
 * refusal names the kind whose command carried the field.
 */
export interface CompanyModelFields {
  /** A plain object holding every required key and no unknown key. */
  readonly exactRecord: (
    value: unknown,
    required: readonly string[],
    optional?: readonly string[],
  ) => Record<string, unknown>;
  /** Non-blank text without NUL or lone surrogates, at most `limit` units. */
  readonly text: (value: unknown, limit: number) => string;
  /** A PostgreSQL integer at least `minimum`. */
  readonly modelInteger: (value: unknown, minimum: number) => number;
  /** Whether the content was supplied by the Company or is illustrative. */
  readonly sourceKind: (value: unknown) => 'ILLUSTRATIVE' | 'COMPANY_SUPPLIED';
}

export function companyModelFields(invalid: () => Error): CompanyModelFields {
  return {
    exactRecord(value, required, optional = []) {
      if (typeof value !== 'object' || value === null || Array.isArray(value))
        throw invalid();
      const record = Object.fromEntries(Object.entries(value));
      if (
        required.some((key) => !Object.hasOwn(record, key)) ||
        Object.keys(record).some(
          (key) => !required.includes(key) && !optional.includes(key),
        )
      )
        throw invalid();
      return record;
    },
    text(value, limit) {
      if (
        typeof value !== 'string' ||
        !value.trim() ||
        value.includes('\u0000') ||
        /[\uD800-\uDFFF]/u.test(value) ||
        value.length > limit
      )
        throw invalid();
      return value;
    },
    modelInteger(value, minimum) {
      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < minimum ||
        value > 2_147_483_647
      )
        throw invalid();
      return value;
    },
    sourceKind(value) {
      if (value === 'ILLUSTRATIVE' || value === 'COMPANY_SUPPLIED')
        return value;
      throw invalid();
    },
  };
}
