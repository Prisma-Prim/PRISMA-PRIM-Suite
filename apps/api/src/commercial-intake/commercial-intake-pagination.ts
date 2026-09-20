import { BadRequestException } from '@nestjs/common';

export interface CommercialIntakeCursor {
  readonly capturedAt: string;
  readonly id: string;
}

export function readCommercialIntakeLimit(value: unknown): number {
  if (value === undefined) return 25;
  if (typeof value !== 'string' || !/^\d+$/.test(value)) invalidPage();
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) invalidPage();
  return limit;
}

export function readCommercialIntakeCursor(
  value: unknown,
): CommercialIntakeCursor | undefined {
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
    !('capturedAt' in decoded) ||
    typeof decoded.capturedAt !== 'string' ||
    !('id' in decoded) ||
    typeof decoded.id !== 'string'
  )
    invalidPage();
  const capturedAt = decoded.capturedAt;
  const millisecondTimestamp = capturedAt.replace(/(\.\d{3})\d{3}Z$/u, '$1Z');
  const parsedTimestamp = new Date(millisecondTimestamp);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/u.test(capturedAt) ||
    Number.isNaN(parsedTimestamp.getTime()) ||
    parsedTimestamp.toISOString() !== millisecondTimestamp ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      decoded.id,
    )
  )
    invalidPage();
  return { capturedAt, id: decoded.id };
}

export function commercialIntakeCursor(value: CommercialIntakeCursor): string {
  return Buffer.from(
    JSON.stringify({
      capturedAt: value.capturedAt,
      id: value.id,
    }),
  ).toString('base64url');
}

function invalidPage(): never {
  throw new BadRequestException({
    code: 'INVALID_PAGE',
    message: 'Reload the Request list and try again.',
  });
}
