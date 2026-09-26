import { expect, type Page } from '@playwright/test';

/** Exercise legacy URL compatibility without a removed product control or remount. */
export async function enterClassicCompatibility(page: Page) {
  await page.evaluate(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('frame', 'classic');
    window.history.pushState(window.history.state, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('button', { name: 'Try Prisme' })).toBeVisible();
}
