import { BadRequestException } from '@nestjs/common';
import type { PublishPricingRuleVersionCommand } from './pricing-configuration.types.js';
import { MAXIMUM_PRICING_RULE_VERSION_NUMBER } from './pricing-rule-version.policy.js';

// The label length is a provisional drafting choice (PRD section 13, row 19),
// not an approved business limit. Every other version field is server-owned.
const PUBLICATION_FIELDS = new Set([
  'label',
  'effectiveFrom',
  'effectiveTo',
  'expectedActiveVersionNumber',
]);
const LABEL_MAXIMUM = 120;
// An explicit instant: calendar date, time to the second with at most
// millisecond precision, and a mandatory UTC designator or numeric offset.
const INSTANT_GRAMMAR =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(?:Z|([+-])(\d{2}):(\d{2}))$/u;

export function readPublishPricingRuleVersionCommand(
  value: unknown,
): PublishPricingRuleVersionCommand {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    invalid('ruleVersion', 'Enter a valid Pricing Rule Version.');
  const body = Object.fromEntries(Object.entries(value));
  if (Object.keys(body).some((key) => !PUBLICATION_FIELDS.has(key)))
    invalid('ruleVersion', 'Remove unsupported fields.');
  const label = readLabel(body.label);
  const effectiveFrom = readInstant(body.effectiveFrom, 'effectiveFrom');
  const effectiveTo =
    body.effectiveTo === undefined || body.effectiveTo === null
      ? null
      : readInstant(body.effectiveTo, 'effectiveTo');
  if (effectiveTo && effectiveTo.getTime() <= effectiveFrom.getTime())
    invalid('effectiveTo', 'Enter an end strictly later than the start.');
  return {
    label,
    effectiveFrom,
    effectiveTo,
    expectedActiveVersionNumber: readExpectedActiveVersionNumber(body),
  };
}

// Applies the delivered catalogue name rule: at least one non-whitespace
// character and at most the limit in Unicode code points, stored verbatim.
function readLabel(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    Array.from(value).length > LABEL_MAXIMUM
  )
    invalid('label', `Enter between 1 and ${LABEL_MAXIMUM} characters.`);
  return value;
}

function readExpectedActiveVersionNumber(
  body: Record<string, unknown>,
): number | null {
  const value = body.expectedActiveVersionNumber;
  if (value === null) return null;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAXIMUM_PRICING_RULE_VERSION_NUMBER
  )
    invalid(
      'expectedActiveVersionNumber',
      'Reload the Pricing Rule Versions before publishing.',
    );
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

const instantMessage =
  'Enter an explicit instant with its time zone, such as 2026-05-01T00:00:00Z.';

function invalid(field: string, message: string): never {
  throw new BadRequestException({ code: 'VALIDATION_ERROR', field, message });
}
