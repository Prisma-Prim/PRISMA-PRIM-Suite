import { BadRequestException } from '@nestjs/common';
import { requireIdempotencyKey } from '../access/access-command-validation.js';

export function fields(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Expected a follow-up object.');
  const result = Object.fromEntries(Object.entries(value));
  if (
    required.some((key) => !Object.hasOwn(result, key)) ||
    Object.keys(result).some(
      (key) => !required.includes(key) && !optional.includes(key),
    )
  )
    throw new BadRequestException('Unexpected follow-up fields.');
  return result;
}
export function safeRevision(value: unknown, minimum = 0): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum
  )
    throw new BadRequestException('Expected a safe integer revision.');
  return value;
}
export function literalFollowUpDate(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value))
    throw new BadRequestException('Expected a literal calendar date.');
  const year = Number(value.slice(0, 4)),
    month = Number(value.slice(5, 7)),
    day = Number(value.slice(8));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const maximum = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    month - 1
  ];
  if (year === 0 || maximum === undefined || day < 1 || day > maximum)
    throw new BadRequestException('Expected a real Gregorian day.');
  return value;
}
export function literalFollowUpReason(value: unknown): string | null {
  if (value === null) return null;
  if (
    typeof value !== 'string' ||
    value.length > 500 ||
    value.trim().length === 0
  )
    throw new BadRequestException(
      'Expected a nonblank reason of at most 500 UTF-16 units.',
    );
  for (const scalar of value) {
    const unit = scalar.charCodeAt(0);
    if (unit === 0 || (scalar.length === 1 && unit >= 0xd800 && unit <= 0xdfff))
      throw new BadRequestException('Expected valid Unicode text.');
  }
  return value;
}
export function followUpInput(value: unknown) {
  const body = fields(value, [
    'expectedRevision',
    'observedOpportunityVersion',
    'followUpOn',
    'reason',
  ]);
  return {
    expectedRevision: safeRevision(body.expectedRevision),
    observedOpportunityVersion: safeRevision(
      body.observedOpportunityVersion,
      1,
    ),
    followUpOn:
      body.followUpOn === null ? null : literalFollowUpDate(body.followUpOn),
    reason: literalFollowUpReason(body.reason),
  };
}
export function followUpQuery(
  value: unknown,
  mode: 'current' | 'history' | 'discovery',
) {
  if (mode === 'current') {
    fields(value, []);
    return {};
  }
  const query = fields(
    value,
    mode === 'history' ? ['cursor'] : ['through'],
    mode === 'history' ? [] : ['cursor'],
  );
  const cursor = query.cursor;
  if (
    cursor !== undefined &&
    (typeof cursor !== 'string' || cursor.length < 1 || cursor.length > 2048)
  )
    throw new BadRequestException('Expected one bounded cursor.');
  return {
    through:
      mode === 'discovery' ? literalFollowUpDate(query.through) : undefined,
    cursor,
  };
}
export { requireIdempotencyKey as followUpKey };
export type FollowUpInput = ReturnType<typeof followUpInput>;
