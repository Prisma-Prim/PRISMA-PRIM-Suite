import { expect, test } from '@playwright/test';

test('preserves published synthetic baseline routes, tabs and analysis choices', async ({
  page,
}, info) => {
  await page.goto('/#overview');
  await expect(page.locator('main.production-content')).toBeVisible();

  await page.goto('/ui-baseline#/not-a-page');
  await expect(
    page.getByRole('heading', { name: 'Décisions et performance' }),
  ).toBeVisible();

  await page.goto('/ui-baseline#/request/REQ-0281/analysis');
  await expect(page.getByText('Scénarios de démonstration')).toBeVisible();
  await page
    .getByRole('button', { name: 'Résultat partiel', exact: true })
    .click();
  await expect(
    page.getByText('Quatre pages sont illisibles.', { exact: false }),
  ).toBeVisible();

  await page.goto('/ui-baseline#/users');
  await expect(
    page.getByRole('heading', { name: 'Utilisateurs', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Invitations', exact: true }).click();
  await expect(
    page.getByText('Victor Munteanu', { exact: true }),
  ).toBeVisible();

  await page.goto('/ui-baseline#/catalog');
  await expect(
    page.getByRole('heading', { name: 'Services et tarifs', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Archivés', exact: true }).click();
  const archivedService = page.getByRole('row', { name: /Audit interne/ });
  await expect(
    archivedService.getByRole('cell', { name: /^TAR-AUDIT v2/ }),
  ).toBeVisible();
  const screenshot = info.outputPath('synthetic-baseline-catalog.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await info.attach('synthetic-baseline-catalog', {
    path: screenshot,
    contentType: 'image/png',
  });
});
