import { BadRequestException } from '@nestjs/common';
import { MAXIMUM_VERSION_NUMBER } from './effective-dated-version.policy.js';

// Payload grammar shared by every effective-dated version publication. Each
// failure is a field-specific VALIDATION_ERROR raised before any write.

// An explicit instant: calendar date, time to the second with at most
// millisecond precision, and a mandatory UTC designator or numeric offset.
const INSTANT_GRAMMAR =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(?:Z|([+-])(\d{2}):(\d{2}))$/u;

const instantMessage =
  'Enter an explicit instant with its time zone, such as 2026-05-01T00:00:00Z.';

// A JSON object carrying no field outside the publication's own. Every other
// version field is server-owned.
export function readPublicationBody(
  value: unknown,
  {
    field,
    fields,
    message,
  }: { field: string; fields: ReadonlySet<string>; message: string },
): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    invalid(field, message);
  const body = Object.fromEntries(Object.entries(value));
  if (Object.keys(body).some((key) => !fields.has(key)))
    invalid(field, 'Remove unsupported fields.');
  return body;
}

// Applies the delivered catalogue name rule: at least one non-whitespace
// character and at most the limit in Unicode code points, stored verbatim.
// PostgreSQL text cannot store U+0000, so that one character is refused here
// rather than failing the insert.
export function readVersionText(
  value: unknown,
  {
    field,
    maximum,
    nullMessage,
  }: { field: string; maximum: number; nullMessage: string },
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    Array.from(value).length > maximum
  )
    invalid(field, `Enter between 1 and ${maximum} characters.`);
  if (value.includes('\u0000')) invalid(field, nullMessage);
  return value;
}

// The declared window: a required start and an optional end strictly later.
export function readEffectiveWindow(body: Record<string, unknown>): {
  effectiveFrom: Date;
  effectiveTo: Date | null;
} {
  const effectiveFrom = readInstant(body.effectiveFrom, 'effectiveFrom');
  const effectiveTo =
    body.effectiveTo === undefined || body.effectiveTo === null
      ? null
      : readInstant(body.effectiveTo, 'effectiveTo');
  if (effectiveTo && effectiveTo.getTime() <= effectiveFrom.getTime())
    invalid('effectiveTo', 'Enter an end strictly later than the start.');
  return { effectiveFrom, effectiveTo };
}

// Required, even as null for a first publication, and within the stored
// version range.
export function readExpectedActiveVersionNumber(
  value: unknown,
  message: string,
): number | null {
  if (value === null) return null;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAXIMUM_VERSION_NUMBER
  )
    invalid('expectedActiveVersionNumber', message);
  return value;
}

function readInstant(value: unknown, field: string): Date {
  const parts = typeof value === 'string' ? INSTANT_GRAMMAR.exec(value) : null;
  if (!parts) return invalid(field, instantMessage);
  const [year, month, day, hour, minute, second] = parts
    .slice(1, 7)
    .map(Number);
  const millisecond = Number((parts[7] ?? '').padEnd(3, '0'));
  const offsetSign = parts[8] === '-' ? -1 : 1;
  const offsetHours = Number(parts[9] ?? '0');
  const offsetMinutes = Number(parts[10] ?? '0');
  if (
    year === undefined ||
    month === undefined ||
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    second === undefined ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHours > 23 ||
    offsetMinutes > 59
  )
    return invalid(field, instantMessage);
  // setUTCFullYear keeps years below 100 literal, unlike Date.UTC.
  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(hour, minute, second, millisecond);
  if (
    local.getUTCFullYear() !== year ||
    local.getUTCMonth() !== month - 1 ||
    local.getUTCDate() !== day
  )
    return invalid(field, instantMessage);
  return new Date(
    local.getTime() - offsetSign * (offsetHours * 60 + offsetMinutes) * 60_000,
  );
}

export function invalid(field: string, message: string): never {
  throw new BadRequestException({ code: 'VALIDATION_ERROR', field, message });
}
