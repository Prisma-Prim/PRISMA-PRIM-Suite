import { isDeepStrictEqual } from 'node:util';

export function sameJsonValue(left: unknown, right: unknown): boolean {
  return isDeepStrictEqual(left, right);
}
