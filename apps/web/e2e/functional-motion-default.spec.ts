import { expect, test } from '@playwright/test';
import { actorContextFixture } from './actor-context.fixture';

test('starts functional journeys with still graphics and can enable live motion', async ({
  page,
}, testInfo) => {
  await page.route('**/api/access/current-actor', (route) =>
    route.fulfill({ json: actorContextFixture }),
  );
  await page.route('**/api/companies', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/activity-log', (route) =>
    route.fulfill({ json: { events: [] } }),
  );

  await page.goto('/?frame=prisme');
  await expect(
    page.getByRole('button', { name: 'Reduced motion', exact: true }),
  ).toBeDisabled();
  const motion = page.locator('.fiber-motion');
  const canvas = motion.locator('canvas');
  await expect(motion).toHaveAttribute('data-motion-state', 'still');
  await expect(canvas).toHaveAttribute('data-phase', '0.0000');
  // Observe a time interval: reduced motion must keep the real renderer still.
  await page.waitForTimeout(180);
  await expect(canvas).toHaveAttribute('data-phase', '0.0000');
  await page.locator('.prisme-hero').screenshot({
    path: testInfo.outputPath(`functional-still-${testInfo.project.name}.png`),
  });

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(
    page.getByRole('button', { name: 'Pause animation', exact: true }),
  ).toBeEnabled();
  await expect(motion).toHaveAttribute('data-motion-state', 'animated');
  await expect(canvas).not.toHaveAttribute('data-phase', '0.0000');
});
