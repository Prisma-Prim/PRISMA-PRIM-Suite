import { BadRequestException } from '@nestjs/common';

export function submission(value: unknown): {
  description: string;
  origin: string;
} {
  const body = inputObject(value, ['description', 'origin']);
  return {
    description: inputText(body.description, 5000),
    origin: inputText(body.origin, 300),
  };
}
export function disposition(value: unknown): {
  expectedRevision: number;
  reason: string;
} & (
  | { kind: 'deferred'; reconsiderationDate: string | null }
  | { kind: 'rejected'; reconsiderationDate: null }
) {
  const body = inputObject(value, [
    'kind',
    'reason',
    'expectedRevision',
    'reconsiderationDate',
  ]);
  const expectedRevision = body.expectedRevision;
  if (
    typeof expectedRevision !== 'number' ||
    !Number.isSafeInteger(expectedRevision) ||
    expectedRevision < 1 ||
    expectedRevision >= 2147483647
  )
    invalid();
  const reason = inputText(body.reason, 2000);
  if (body.kind === 'rejected') {
    if (Object.hasOwn(body, 'reconsiderationDate')) invalid();
    return {
      kind: 'rejected',
      reason,
      expectedRevision,
      reconsiderationDate: null,
    };
  }
  if (body.kind !== 'deferred') invalid();
  const date = body.reconsiderationDate;
  if (date !== undefined && date !== null && !calendarDate(date)) invalid();
  return {
    kind: 'deferred',
    reason,
    expectedRevision,
    reconsiderationDate: date ?? null,
  };
}
export function calendarDate(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/u.test(value) ||
    value.startsWith('0000-')
  )
    return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function inputObject(
  value: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const body = Object.fromEntries(Object.entries(value));
  if (Object.keys(body).some((key) => !fields.includes(key))) invalid();
  return body;
}
function inputText(value: unknown, limit: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > limit)
    invalid();
  return value;
}
function invalid(): never {
  throw new BadRequestException({
    code: 'INVALID_IDEA_INPUT',
    message: 'Invalid Idea input.',
  });
}
