import { expect, test } from '@playwright/test';
import { prepareDossier } from './dossier-analysis.acceptance-fixture';
import { openSelect, selectOption } from './select-option';

test('an editor uses a subscription harness inside PRISMA and reviews exact native evidence', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const narrow = info.project.name.endsWith('narrow');
  const fixture = await prepareDossier(
    page.request,
    narrow ? 'Harness Narrow' : 'Harness Desktop',
  );
  await page.goto('/');
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(
    page.getByRole('combobox', { name: 'Active Company', exact: true }),
    fixture.companyId,
  );
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Projects', exact: true })
    .click();
  const projects = page.locator('.project-workspace');
  await projects
    .getByRole('list', { name: 'Projects', exact: true })
    .getByRole('button')
    .filter({ hasText: fixture.title })
    .click();
  await page.getByRole('tab', { name: 'Dossier analysis' }).focus();
  await page.keyboard.press('Enter');
  const selector = page.getByLabel('Document and version');
  const documents = await openSelect(selector);
  await documents
    .getByRole('option', { name: /Dossier Original.*dossier\.pdf/ })
    .click();
  await page.getByRole('button', { name: 'Add PDF' }).click();
  await page.getByLabel('Choose file').setInputFiles({
    name: 'supplement.docx',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: fixture.docx,
  });
  await page.getByRole('button', { name: 'Upload DOCX' }).click();
  await expect(page.getByText('supplement.docx')).toBeVisible();
  await page.getByRole('button', { name: 'Create run' }).click();
  await page.getByRole('button', { name: 'Open run' }).first().click();
  await expect(
    page.getByRole('button', { name: 'Context JSON' }),
  ).toBeVisible();

  const panel = page.locator('.dossier-harness');
  // The provider's browser login is the external boundary; PRISMA OAuth/API/DB stay native.
  await page.context().route('https://auth.openai.com/**', async (route) => {
    const auth = new URL(route.request().url());
    const callback = new URL(auth.searchParams.get('redirect_uri') ?? '');
    callback.searchParams.set('state', auth.searchParams.get('state') ?? '');
    callback.searchParams.set('code', auth.searchParams.get('nonce') ?? '');
    await route.fulfill({
      status: 302,
      headers: { location: callback.href },
      body: '',
    });
  });
  await panel
    .getByRole('button', { name: 'Continue with ChatGPT', exact: true })
    .click();
  await expect(
    panel.getByText('Connected account: fictional-plan@example.test', {
      exact: true,
    }),
  ).toBeVisible();
  await selectOption(
    panel.getByRole('combobox', { name: 'Analysis language' }),
    'ru',
  );
  await expect(
    panel.getByRole('button', { name: 'Start document review', exact: true }),
  ).toBeDisabled();
  await panel.getByRole('checkbox').check();
  await panel
    .getByRole('button', { name: 'Start document review', exact: true })
    .click();
  await expect(
    panel.getByText('Review completed', { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText('Проверить документ', { exact: true }),
  ).toBeVisible();
  await expect(panel.locator('blockquote')).toHaveCount(1);
  await panel
    .getByRole('button', { name: 'Import proposals for review', exact: true })
    .click();
  await expect(
    panel.getByText(
      'Proposals imported. Review them below before confirming anything.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page
      .locator('.dossier-analysis')
      .getByRole('button', { name: 'Confirm', exact: true }),
  ).toBeVisible();
  await selectOption(
    page.getByRole('combobox', { name: 'Interface language', exact: true }),
    narrow ? 'ru' : 'ro',
  );
  await expect(
    panel.getByText(narrow ? 'Проверка завершена' : 'Verificare finalizată', {
      exact: true,
    }),
  ).toBeVisible();
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath(
      narrow
        ? 'subscription-harness-narrow.png'
        : 'subscription-harness-desktop.png',
    ),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
