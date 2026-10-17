import type { Locator } from '@playwright/test';

export function unionLocators(locators: readonly Locator[]): Locator {
  const [first, ...remaining] = locators;
  if (first === undefined)
    throw new Error('At least one locator is required for a union.');
  return remaining.reduce((combined, locator) => combined.or(locator), first);
}
