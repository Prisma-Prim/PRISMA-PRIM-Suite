import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import {
  prepareDossier,
  revokeUpload,
  startNativeVersion,
} from './dossier-analysis.acceptance-fixture';
import { openSelect, selectOption } from './select-option';

test('an editor follows an exact native dossier source through analysis and context export', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  const narrow = info.project.name.endsWith('narrow');
  const fixture = await prepareDossier(
    page.request,
    narrow ? 'Narrow' : 'Desktop',
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
  const contextDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Context JSON' }).click();
  const contextPath = await (await contextDownload).path();
  if (!contextPath) throw new Error('Missing context download');
  const context: unknown = JSON.parse(await readFile(contextPath, 'utf8'));
  expect(JSON.stringify(context)).toContain(fixture.versionId);
  await expect(page.getByText(/partial/i).first()).toBeVisible();
  await page.getByLabel('Query').fill('RO12345678');
  const currentSearch = page.waitForResponse((response) =>
    response.url().includes('/search?'),
  );
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  expect((await currentSearch).status()).toBe(200);
  await expect(page.getByText(/Tax ID: RO12345678/).first()).toBeVisible();
  const originalButton = page
    .locator('blockquote')
    .filter({ hasText: 'RO12345678' })
    .first()
    .getByRole('button', { name: 'Open original', exact: true });
  await expect(originalButton).toBeVisible();
  const originalDownload = page.waitForEvent('download');
  await originalButton.click();
  const originalPath = await (await originalDownload).path();
  if (!originalPath) throw new Error('Missing original download');
  expect(await readFile(originalPath)).toEqual(fixture.bytes);
  const docxPassage = page
    .locator('blockquote')
    .filter({ hasText: 'RO87654321' })
    .first();
  await expect(docxPassage).toBeVisible();
  const docxDownload = page.waitForEvent('download');
  await docxPassage.getByRole('button', { name: 'Open original' }).click();
  const docxPath = await (await docxDownload).path();
  if (!docxPath) throw new Error('Missing supplementary original download');
  expect(await readFile(docxPath)).toEqual(fixture.docx);
  const manual = page.getByRole('group', { name: 'Manual suggestion' });
  await manual.getByLabel('Value', { exact: true }).fill('RO12345678');
  await manual
    .getByLabel('Rationale')
    .fill('Review the synthetic tax identifier');
  const citation = manual.getByLabel('Citation passage');
  const citationOptions = await openSelect(citation);
  await citationOptions
    .getByRole('option', { name: /page:1.*RO12345678/ })
    .click();
  await manual.getByRole('button', { name: 'Submit' }).click();
  await page.getByLabel('Replacement value').fill('RO12345679');
  await page.getByRole('button', { name: 'Correct', exact: true }).click();
  await expect(page.getByText('RO12345679', { exact: false })).toBeVisible();
  await expect(
    page
      .getByRole('paragraph')
      .filter({ hasText: 'Review the synthetic tax identifier' }),
  ).toBeVisible();
  await startNativeVersion(page.request, fixture.companyId, fixture.documentId);
  await page.getByRole('button', { name: 'Open run' }).first().click();
  await expect(page.getByText('Historical / stale').first()).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Open run' }).first().locator('..'),
  ).toContainText('Historical / stale');
  await expect(
    page.getByRole('button', { name: 'Correct', exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath(
      `dossier-analysis-${narrow ? 'narrow' : 'desktop'}.png`,
    ),
    fullPage: true,
  });
  await revokeUpload(page.request, fixture.companyId);
  await page.reload();
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
  await page
    .locator('.project-workspace')
    .getByRole('list', { name: 'Projects', exact: true })
    .getByRole('button')
    .filter({ hasText: fixture.title })
    .click();
  await page.getByRole('tab', { name: 'Dossier analysis' }).click();
  await page.getByRole('button', { name: 'Open run' }).first().click();
  await expect(
    page.getByRole('button', { name: 'Context JSON' }),
  ).toBeVisible();
  await page.getByLabel('Query').fill('RO12345678');
  await expect(
    page.getByRole('button', { name: 'Search', exact: true }),
  ).toBeDisabled();
  await page
    .getByRole('checkbox', { name: 'Search this historical run' })
    .check();
  const historicalSearch = page.waitForResponse((response) =>
    response.url().includes('/search?'),
  );
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const historicalResult = await historicalSearch;
  expect(historicalResult.status()).toBe(200);
  expect(new URL(historicalResult.url()).searchParams.get('history')).toBe(
    'true',
  );
  const readerPassage = page
    .locator('blockquote')
    .filter({ hasText: 'RO12345678' })
    .first();
  await expect(readerPassage).toBeVisible();
  const readerDownload = page.waitForEvent('download');
  await readerPassage.getByRole('button', { name: 'Open original' }).click();
  const readerPath = await (await readerDownload).path();
  if (!readerPath) throw new Error('Missing reader original download');
  expect(await readFile(readerPath)).toEqual(fixture.bytes);
  await expect(page.getByRole('button', { name: 'Create run' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add PDF' })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Correct', exact: true }),
  ).toHaveCount(0);
});
