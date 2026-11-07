import { BadRequestException } from '@nestjs/common';

export function requireUuid(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  ) {
    throw new BadRequestException('A valid UUID is required.');
  }
  return value.toLowerCase();
}

export function requireIdempotencyKey(value: string | undefined): string {
  if (!value?.trim())
    throw new BadRequestException('Idempotency-Key header is required.');
  return value.trim();
}

/**
 * A required Idempotency-Key whose store accepts at most `maxLength`
 * characters, counted as the database counts them (code points).
 */
export function requireBoundedIdempotencyKey(
  value: string | undefined,
  maxLength: number,
): string {
  const key = requireIdempotencyKey(value);
  if ([...key].length > maxLength)
    throw new BadRequestException(
      `Idempotency-Key must be at most ${maxLength} characters.`,
    );
  return key;
}
