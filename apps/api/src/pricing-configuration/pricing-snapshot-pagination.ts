import { BadRequestException } from '@nestjs/common';

const DEFAULT_LIMIT = 25;
const MAXIMUM_LIMIT = 50;
const UUID_GRAMMAR =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const INSTANT_GRAMMAR = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

export interface PricingSnapshotCursor {
  readonly calculatedAt: string;
  readonly id: string;
}

export function readPricingSnapshotLimit(value: unknown): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (typeof value !== 'string' || !/^\d+$/u.test(value)) invalidPage();
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAXIMUM_LIMIT)
    invalidPage();
  return limit;
}

export function readPricingSnapshotCursor(
  value: unknown,
): PricingSnapshotCursor | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) invalidPage();
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    invalidPage();
  }
  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    Array.isArray(decoded) ||
    Object.keys(decoded).length !== 2 ||
    !('calculatedAt' in decoded) ||
    typeof decoded.calculatedAt !== 'string' ||
    !INSTANT_GRAMMAR.test(decoded.calculatedAt) ||
    !('id' in decoded) ||
    typeof decoded.id !== 'string' ||
    !UUID_GRAMMAR.test(decoded.id)
  )
    invalidPage();
  const calculatedAt = new Date(decoded.calculatedAt);
  if (
    Number.isNaN(calculatedAt.getTime()) ||
    calculatedAt.toISOString() !== decoded.calculatedAt
  )
    invalidPage();
  return { calculatedAt: decoded.calculatedAt, id: decoded.id.toLowerCase() };
}

export function pricingSnapshotCursor(value: PricingSnapshotCursor): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function invalidPage(): never {
  throw new BadRequestException({
    code: 'INVALID_PAGE',
    message: 'Reload the Pricing Snapshots and try again.',
  });
}
