import { expect, type Page } from '@playwright/test';

/** Exercise legacy URL compatibility without a removed product control or remount. */
export async function enterClassicCompatibility(page: Page) {
  // The removed control used to wait for the initial Prisme render before
  // navigation. Keep that precondition when exercising a history transition.
  await expect(page.locator('.prisme-shell')).toBeVisible();
  await page.evaluate(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('frame', 'classic');
    window.history.pushState(window.history.state, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('button', { name: 'Try Prisme' })).toBeVisible();
}
