import { BadRequestException } from '@nestjs/common';

export interface CatalogueCursor {
  readonly createdAt: string;
  readonly id: string;
}

const DEFAULT_LIMIT = 25;
const MAXIMUM_LIMIT = 50;

export function readCatalogueLimit(value: unknown): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) invalidPage();
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAXIMUM_LIMIT)
    invalidPage();
  return limit;
}

export function readCatalogueCursor(
  value: unknown,
): CatalogueCursor | undefined {
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
    !('createdAt' in decoded) ||
    typeof decoded.createdAt !== 'string' ||
    !('id' in decoded) ||
    typeof decoded.id !== 'string'
  )
    invalidPage();
  const createdAt = decoded.createdAt;
  const millisecondTimestamp = createdAt.replace(/(\.\d{3})\d{3}Z$/u, '$1Z');
  const parsedTimestamp = new Date(millisecondTimestamp);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u.test(createdAt) ||
    Number.isNaN(parsedTimestamp.getTime()) ||
    parsedTimestamp.toISOString() !== millisecondTimestamp ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      decoded.id,
    )
  )
    invalidPage();
  return { createdAt, id: decoded.id };
}

export function catalogueCursor(value: CatalogueCursor): string {
  return Buffer.from(
    JSON.stringify({ createdAt: value.createdAt, id: value.id }),
  ).toString('base64url');
}

function invalidPage(): never {
  throw new BadRequestException({
    code: 'INVALID_PAGE',
    message: 'Reload the catalogue and try again.',
  });
}
