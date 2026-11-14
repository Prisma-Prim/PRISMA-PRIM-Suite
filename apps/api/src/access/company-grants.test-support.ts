import { expect } from 'vitest';

/**
 * A recorded predecessor read of `GET /access/current-actor` predates the
 * additive `activeCompany.grants` list (#1332). This returns a current read
 * of that path without the list, after checking that it is a list, so the
 * rest of the read is still compared exactly with the recorded one.
 * `company-grants.rest.test.ts` proves that the list describes the same
 * grants as the per-bundle fields. Any other path or value is returned as is.
 */
export function withoutGrantsList(path: string, value: unknown): unknown {
  if (path !== '/access/current-actor' || !isRecord(value)) return value;
  const company = value.activeCompany;
  if (!isRecord(company) || !Object.hasOwn(company, 'grants')) return value;
  expect(Array.isArray(company.grants), 'activeCompany.grants').toBe(true);
  return {
    ...value,
    activeCompany: Object.fromEntries(
      Object.entries(company).filter(([key]) => key !== 'grants'),
    ),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
