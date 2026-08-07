import { expect, test } from '@playwright/test';

test('design lab index and a placeholder route render', async ({
  page,
}, testInfo) => {
  await page.goto('/design-lab');

  await expect(
    page.getByRole('heading', { name: 'Design direction lab' }),
  ).toBeVisible();
  await expect(page.getByTestId('direction-slot')).toHaveCount(6);
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('design-lab-index.png'),
  });

  await page.goto('/design-lab/institutional-assurance/dashboard');

  await expect(
    page.getByRole('heading', { name: 'Institutional assurance' }),
  ).toBeVisible();
  await expect(page.getByText('Direction slot reserved')).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('direction-placeholder.png'),
  });
});
