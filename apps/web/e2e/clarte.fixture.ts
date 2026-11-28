import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Opens an application path in the Clarté interface the way a tester does:
 * with the `interface=clarte` opt-in parameter, which the page stores for
 * every later load in this browser context and removes from the URL.
 */
export async function openClarte(page: Page, path = '/'): Promise<void> {
  const url = new URL(path, 'http://application.invalid');
  const separator = url.search ? '&' : '?';
  await page.goto(
    `${url.pathname}${url.search}${separator}interface=clarte${url.hash}`,
  );
  await expect(clarteJumpField(page)).toBeVisible();
}

/** True at the phone layout (768 px and below), where the bottom bar replaces the left menu. */
export function isPhoneLayout(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1440) <= 768;
}

/** The jump field on desktop and the search icon on phone: the same control. */
export function clarteJumpField(page: Page): Locator {
  return page.getByRole('button', { name: 'Go to a screen' });
}

/**
 * Opens a Clarté entry from the left menu on desktop, or from the bottom bar
 * and its More panel on phone.
 */
export async function openClarteEntry(page: Page, entry: string) {
  if (!isPhoneLayout(page)) {
    await page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name: entry, exact: true })
      .click();
    return;
  }
  const bar = page.getByRole('navigation', { name: 'Quick navigation' });
  const direct = bar.getByRole('link', { name: entry, exact: true });
  if (await direct.isVisible()) {
    await direct.click();
    return;
  }
  await bar.getByRole('button', { name: 'More' }).click();
  await page
    .getByRole('group', { name: 'More screens' })
    .getByRole('link', { name: entry, exact: true })
    .click();
}
