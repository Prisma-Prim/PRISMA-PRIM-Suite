import { expect, test } from '@playwright/test';

test('design lab index and an implemented direction route render', async ({
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
    page.getByRole('heading', { name: 'Assurance register' }),
  ).toBeVisible();
  await expect(page.getByText('Human review required')).toBeVisible();
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath('implemented-direction.png'),
  });
});
