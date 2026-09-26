import { BadRequestException } from '@nestjs/common';
import { MAXIMUM_VERSION_NUMBER } from './effective-dated-version.policy.js';

// List limits are provisional drafting choices (PRD section 13, row 10).
const DEFAULT_LIMIT = 25;
const MAXIMUM_LIMIT = 50;

// The versions a list pages through, named in its INVALID_PAGE answer.
export type VersionList = 'Pricing Rule Versions' | 'Tariff Versions';

export function readPricingConfigurationLimit(
  value: unknown,
  list: VersionList,
): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (typeof value !== 'string' || !/^\d+$/u.test(value)) invalidPage(list);
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAXIMUM_LIMIT)
    invalidPage(list);
  return limit;
}

// Version numbers are unique and never reused within a scope, so the last
// number returned is a stable position in the newest-first order. The cursor
// carries that number only: no Company, offering or other scope data.
export function readVersionCursor(
  value: unknown,
  list: VersionList,
): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length === 0) invalidPage(list);
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    invalidPage(list);
  }
  if (
    typeof decoded !== 'object' ||
    decoded === null ||
    Array.isArray(decoded) ||
    Object.keys(decoded).length !== 1 ||
    !('versionNumber' in decoded) ||
    typeof decoded.versionNumber !== 'number' ||
    !Number.isInteger(decoded.versionNumber) ||
    decoded.versionNumber < 1 ||
    decoded.versionNumber > MAXIMUM_VERSION_NUMBER
  )
    invalidPage(list);
  return decoded.versionNumber;
}

export function versionCursor(versionNumber: number): string {
  return Buffer.from(JSON.stringify({ versionNumber })).toString('base64url');
}

function invalidPage(list: VersionList): never {
  throw new BadRequestException({
    code: 'INVALID_PAGE',
    message: `Reload the ${list} and try again.`,
  });
}
