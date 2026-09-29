import { expect, test } from '@playwright/test';

for (const movement of ['layout expansion', 'scroll'] as const) {
  test(`shared Select remains usable after ${movement} moves its open anchor offscreen`, async ({
    page,
  }, testInfo) => {
    await page.addInitScript(() => {
      sessionStorage.setItem('deterministic-auth-state', 'signed-out');
    });
    await page.goto('/');
    const trigger = page.getByRole('combobox', { name: 'Interface language' });
    await expect(trigger).toBeVisible();

    // Isolate the real shared Select in a controlled flow layout. No business
    // loading state, Select geometry or option behavior is mocked.
    await page.addStyleTag({
      content: `
      html { overflow-anchor: none; scroll-behavior: auto; }
      #root { display: flow-root; min-height: 2200px; }
      .public-welcome { display: none; }
      .interface-locale-control {
        position: relative;
        inset: auto;
        width: 240px;
        margin: 100px auto;
      }
    `,
    });
    await trigger.evaluate((element) => {
      const control = element.closest('.interface-locale-control');
      if (!control) throw new Error('Expected the language control');
      const delayedContent = document.createElement('div');
      delayedContent.id = 'select-delayed-content';
      delayedContent.style.height = '0px';
      control.before(delayedContent);
    });

    await trigger.click();
    const listbox = page.getByRole('listbox');
    const popup = page.locator('.shared-select__portal');
    await expect(listbox).toBeVisible();
    await expect(trigger).toHaveAttribute('data-value', 'en');

    if (movement === 'layout expansion') {
      // Release the above-anchor expansion only AFTER opening the menu.
      await page.locator('#select-delayed-content').evaluate((element) => {
        element.style.height = '1100px';
      });
      expect(
        await trigger.evaluate(
          (element) => element.getBoundingClientRect().top > window.innerHeight,
        ),
      ).toBe(true);
      await expect(popup).toHaveCSS('bottom', '8px');
    } else {
      await trigger.evaluate((element) => {
        window.scrollTo({
          top: window.scrollY + element.getBoundingClientRect().bottom + 100,
          behavior: 'instant',
        });
      });
      expect(
        await trigger.evaluate(
          (element) => element.getBoundingClientRect().bottom < 0,
        ),
      ).toBe(true);
      await expect(popup).toHaveCSS('top', '8px');
    }

    const bounds = await popup.boundingBox();
    const viewport = page.viewportSize();
    if (!bounds || !viewport)
      throw new Error('Expected popup and viewport geometry');
    expect(bounds.y).toBeGreaterThanOrEqual(8);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height - 8);
    expect(bounds.x).toBeGreaterThanOrEqual(8);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width - 8);
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(trigger).toHaveAttribute('data-value', 'en');
    await page.screenshot({
      path: testInfo.outputPath(
        `select-${movement.replaceAll(' ', '-')}-${testInfo.project.name}.png`,
      ),
    });

    if (movement === 'scroll') {
      // Additionally prove internal option scrolling in a short viewport.
      // The expansion case completes its real click at the original viewport.
      await page.setViewportSize({ width: viewport.width, height: 140 });
      await expect(popup).toHaveCSS('max-height', '124px');
      expect(
        await listbox.evaluate(
          (element) => element.scrollHeight > element.clientHeight,
        ),
      ).toBe(true);
    }
    await listbox
      .getByRole('option', { name: 'Français', exact: true })
      .click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByRole('combobox')).toHaveAttribute(
      'data-value',
      'fr',
    );
    await expect(page.getByRole('combobox')).toBeFocused();
    await expect(listbox).toHaveCount(0);
  });
}
