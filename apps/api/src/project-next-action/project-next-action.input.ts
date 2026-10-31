import { BadRequestException } from '@nestjs/common';
import { requireIdempotencyKey } from '../access/access-command-validation.js';

export const MAX_NEXT_ACTION_REVISION = 2147483647;
export function normalizeNextActionText(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string')
    throw new BadRequestException('Expected nullable plain next-action text.');
  for (const scalar of value) {
    const unit = scalar.charCodeAt(0);
    if (unit === 0 || (scalar.length === 1 && unit >= 0xd800 && unit <= 0xdfff))
      throw new BadRequestException('Expected valid Unicode scalar text.');
  }
  const text = value.trim();
  if ([...text].length > 500)
    throw new BadRequestException(
      'Next action exceeds 500 Unicode code points.',
    );
  return text || null;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new BadRequestException('Expected an exact next-action request.');
  return Object.fromEntries(Object.entries(value));
}
export function nextActionInput(body: unknown) {
  const value = object(body);
  if (
    Object.keys(value).length !== 3 ||
    !Object.hasOwn(value, 'text') ||
    !Object.hasOwn(value, 'expectedRevision') ||
    !Object.hasOwn(value, 'expectedLifecycleRevision')
  )
    throw new BadRequestException(
      'Expected exactly the observed revisions and text.',
    );
  const expectedRevision = revision(value.expectedRevision);
  const expectedLifecycleRevision = revision(value.expectedLifecycleRevision);
  return {
    expectedRevision,
    expectedLifecycleRevision,
    text: normalizeNextActionText(value.text),
  };
}
function revision(value: unknown) {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_NEXT_ACTION_REVISION
  )
    throw new BadRequestException('Expected a bounded integer revision.');
  return value;
}
export function nextActionQuery(query: unknown) {
  const value = object(query);
  if (Object.keys(value).some((key) => key !== 'beforeRevision'))
    throw new BadRequestException('Unknown next-action query.');
  if (!Object.hasOwn(value, 'beforeRevision')) return undefined;
  if (
    typeof value.beforeRevision !== 'string' ||
    !/^[1-9][0-9]*$/.test(value.beforeRevision)
  )
    throw new BadRequestException('Expected one canonical history cursor.');
  return revision(Number(value.beforeRevision));
}
export { requireIdempotencyKey as nextActionKey };
export type NextActionInput = ReturnType<typeof nextActionInput>;
