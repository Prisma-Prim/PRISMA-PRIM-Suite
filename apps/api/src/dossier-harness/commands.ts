import { BadRequestException } from '@nestjs/common';

export function commandBody(value: unknown, keys: readonly string[]) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !keys.includes(k))
  )
    throw new BadRequestException('Invalid harness command.');
  return Object.fromEntries(Object.entries(value));
}
export function commandText(value: unknown, max: number) {
  if (typeof value !== 'string' || !value.trim() || value.length > max)
    throw new BadRequestException('Invalid harness command.');
  return value;
}
