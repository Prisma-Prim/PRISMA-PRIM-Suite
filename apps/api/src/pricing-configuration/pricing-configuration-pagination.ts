import { BadRequestException } from '@nestjs/common';
import { MAXIMUM_PRICING_RULE_VERSION_NUMBER } from './pricing-rule-version.policy.js';

// List limits are provisional drafting choices (PRD section 13, row 10).
const DEFAULT_LIMIT = 25;
const MAXIMUM_LIMIT = 50;

export function readPricingConfigurationLimit(value: unknown): number {
  if (value === undefined) return DEFAULT_LIMIT;
  if (typeof value !== 'string' || !/^\d+$/u.test(value)) invalidPage();
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAXIMUM_LIMIT)
    invalidPage();
  return limit;
}

// Version numbers are unique and never reused within a Company, so the last
// number returned is a stable position in the newest-first order.
export function readRuleVersionCursor(value: unknown): number | undefined {
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
    Object.keys(decoded).length !== 1 ||
    !('versionNumber' in decoded) ||
    typeof decoded.versionNumber !== 'number' ||
    !Number.isInteger(decoded.versionNumber) ||
    decoded.versionNumber < 1 ||
    decoded.versionNumber > MAXIMUM_PRICING_RULE_VERSION_NUMBER
  )
    invalidPage();
  return decoded.versionNumber;
}

export function ruleVersionCursor(versionNumber: number): string {
  return Buffer.from(JSON.stringify({ versionNumber })).toString('base64url');
}

function invalidPage(): never {
  throw new BadRequestException({
    code: 'INVALID_PAGE',
    message: 'Reload the Pricing Rule Versions and try again.',
  });
}
