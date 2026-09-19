import { expect, test, type Route } from '@playwright/test';
import { actorContextFixture } from './actor-context.fixture';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/access/current-actor', (route) =>
    route.fulfill({ json: actorContextFixture }),
  );
  await page.route('**/api/companies', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/activity-log', (route) =>
    route.fulfill({ json: { events: [] } }),
  );
});

test('pauses the fiber at its current phase and honors live reduced motion', async ({
  page,
}, testInfo) => {
  await page.goto('/?frame=prisme');
  const pause = page.getByRole('button', { name: 'Pause animation' });
  await expect(pause).toBeVisible();
  const canvas = page.locator('.fiber-motion canvas');
  await expect(canvas).toHaveCount(1);
  await pause.click();
  const phase = await canvas.getAttribute('data-phase');
  await page.waitForTimeout(180);
  await expect(canvas).toHaveAttribute('data-phase', phase ?? 'missing');
  await page.locator('.prisme-hero').screenshot({
    path: testInfo.outputPath(`fiber-paused-${testInfo.project.name}.png`),
  });
  await page.getByRole('button', { name: 'Resume animation' }).click();
  await expect.poll(() => canvas.getAttribute('data-phase')).not.toBe(phase);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(
    page.getByRole('button', { name: 'Reduced motion' }),
  ).toBeDisabled();
  const reducedPhase = await canvas.getAttribute('data-phase');
  await page.waitForTimeout(180);
  await expect(canvas).toHaveAttribute('data-phase', reducedPhase ?? 'missing');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect
    .poll(() => canvas.getAttribute('data-phase'))
    .not.toBe(reducedPhase);
});

test('uses the original local artwork when WebGL is unavailable', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    // Only the browser graphics boundary is unavailable; API and React run normally.
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  await page.goto('/?frame=prisme');
  await expect(
    page.getByRole('button', { name: 'Static artwork' }),
  ).toBeDisabled();
  const fallback = page.locator('.fiber-fallback img');
  expect(
    await fallback.evaluate(
      (element) =>
        element instanceof HTMLImageElement &&
        element.complete &&
        element.naturalWidth > 0,
    ),
  ).toBe(true);
  await expect(page.locator('.fiber-motion canvas')).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath(`fiber-fallback-${testInfo.project.name}.png`),
    fullPage: true,
  });
  await page
    .locator('.prisme-capabilities')
    .getByRole('link', { name: /Companies/ })
    .click();
  await expect(page.getByLabel('Company display name')).toBeVisible();
});

test('recovers from context loss and disposes the previous canvas on navigation', async ({
  page,
}) => {
  await page.goto('/?frame=prisme');
  await expect(
    page.getByRole('button', { name: 'Pause animation' }),
  ).toBeVisible();
  const canvas = page.locator('.fiber-motion canvas');
  const oldCanvas = await canvas.elementHandle();
  if (!oldCanvas) throw new Error('Expected mounted fiber canvas');
  const extension = await canvas.evaluateHandle((element) => {
    if (!(element instanceof HTMLCanvasElement))
      throw new Error('Expected canvas');
    const loseContext = element
      .getContext('webgl2')
      ?.getExtension('WEBGL_lose_context');
    if (!loseContext)
      throw new Error('Chromium must expose WebGL context loss');
    loseContext.loseContext();
    return loseContext;
  });
  await expect(
    page.getByRole('button', { name: 'Static artwork' }),
  ).toBeDisabled();
  await expect(canvas).toBeHidden();
  await extension.evaluate((context) => context.restoreContext());
  await expect(
    page.getByRole('button', { name: 'Pause animation' }),
  ).toBeVisible();
  for (let iteration = 0; iteration < 3; iteration++) {
    await page
      .locator('.prisme-capabilities')
      .getByRole('link', { name: /Companies/ })
      .click();
    await expect(page.getByLabel('Company display name')).toBeVisible();
    await expect(canvas).toHaveCount(0);
    await page.evaluate(() => {
      window.location.hash = 'overview';
    });
    await expect(
      page.getByRole('button', { name: 'Pause animation' }),
    ).toBeVisible();
    await expect(canvas).toHaveCount(1);
  }
  expect(
    await oldCanvas.evaluate(
      (element) =>
        !element.isConnected &&
        element instanceof HTMLCanvasElement &&
        element.getContext('webgl2')?.isContextLost(),
    ),
  ).toBe(true);
});

test('stops frames while hidden or offscreen and caps high-density raster size', async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 4,
    }),
  );
  await page.goto('/?frame=prisme');
  await expect(
    page.getByRole('button', { name: 'Pause animation' }),
  ).toBeVisible();
  const canvas = page.locator('.fiber-motion canvas');
  expect(
    await canvas.evaluate(
      (element) =>
        element instanceof HTMLCanvasElement &&
        element.width * element.height <=
          (innerWidth <= 700 ? 1050000 : 2100000),
    ),
  ).toBe(true);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const hiddenPhase = await canvas.getAttribute('data-phase');
  await page.waitForTimeout(180);
  await expect(canvas).toHaveAttribute('data-phase', hiddenPhase ?? 'missing');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect
    .poll(() => canvas.getAttribute('data-phase'))
    .not.toBe(hiddenPhase);
  await page.setViewportSize({ width: 390, height: 300 });
  await page.locator('.prisme-context-card').scrollIntoViewIfNeeded();
  await expect(canvas).not.toBeInViewport();
  await page.waitForTimeout(100);
  const offscreenPhase = await canvas.getAttribute('data-phase');
  await page.waitForTimeout(180);
  await expect(canvas).toHaveAttribute(
    'data-phase',
    offscreenPhase ?? 'missing',
  );
  await page.locator('.prisme-hero').scrollIntoViewIfNeeded();
  await expect
    .poll(() => canvas.getAttribute('data-phase'))
    .not.toBe(offscreenPhase);
});

test('keeps forms usable while the graphics chunk is delayed and cancels its late mount', async ({
  page,
}) => {
  let pendingGraphics: Route | undefined;
  await page.route('**/assets/fiber-renderer-*.js', (route) => {
    pendingGraphics = route;
  });
  await page.goto('/?frame=prisme');
  await expect(
    page.getByRole('heading', { name: 'Hello, Ada Ionescu.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Loading animation' }),
  ).toBeDisabled();
  await expect.poll(() => Boolean(pendingGraphics)).toBe(true);
  await page
    .locator('.prisme-capabilities')
    .getByRole('link', { name: /Companies/ })
    .click();
  await page
    .getByLabel('Company display name')
    .fill('Usable during graphics loading');
  if (!pendingGraphics)
    throw new Error('Expected delayed local graphics chunk');
  await pendingGraphics.continue();
  await expect(page.getByLabel('Company display name')).toHaveValue(
    'Usable during graphics loading',
  );
  await expect(page.locator('.fiber-motion canvas')).toHaveCount(0);
  await page.evaluate(() => {
    window.location.hash = 'overview';
  });
  await expect(
    page.getByRole('button', { name: 'Pause animation' }),
  ).toBeVisible();
  await expect(page.locator('.fiber-motion canvas')).toHaveCount(1);
});
