import { randomUUID } from 'node:crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { openSelect, selectOption } from './select-option';
import { expectSelectAppearance } from './select-appearance';

const apiOrigin = 'http://127.0.0.1:4174';
const owner = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};
const member = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'local-demonstration-user',
  'x-test-display-name': 'Ada Ionescu',
  'x-test-email': 'ada@example.test',
};
type Role = 'reader' | 'recorder' | 'reviewer';
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing acceptance environment ${name}.`);
  return value;
}
async function assign(request: APIRequestContext, role: Role, active: boolean) {
  const companyId = required('ACCEPTANCE_PRIMARY_COMPANY_ID');
  const workspaceMembershipId = required('ACCEPTANCE_PRIMARY_MEMBERSHIP_ID');
  const route = `${apiOrigin}/api/company-ideas-${role}-assignments`;
  const response = active
    ? await request.post(route, {
        headers: { ...owner, 'idempotency-key': randomUUID() },
        data: { companyId, workspaceMembershipId },
      })
    : await request.delete(`${route}/${workspaceMembershipId}/${companyId}`, {
        headers: { ...owner, 'idempotency-key': randomUUID() },
      });
  expect(response.status()).toBe(active ? 201 : 200);
}
async function openIdeas(page: Page, narrow: boolean) {
  await page.goto('/');
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(page.getByLabel('Active Company', { exact: true }), {
    label: 'PRISMA-PRIM',
  });
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Ideas', exact: true })
    .click();
  await expect(page.locator('.ideas-workspace')).toBeVisible();
}

test('records and reopens the literal Idea, appends both attributed dispositions, and enforces independent live rights through real App and PostgreSQL', async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'narrow' : 'desktop';
  const description = `  Synthetic Ideas acceptance ${suffix}\nÎmbunătățire — Идея\nA preserved suggestion with enough detail to inspect wrapping, keyboard access, original attribution and narrow layout without approving work or spending.  `;
  const origin = '  Synthetic internal suggestion — origine / источник  ';
  const deferredReason =
    '  Defer for a deliberate later review. Preserve this first reason, its reviewer and the declared date even after a different disposition is recorded.\nMotiv — причина  ';
  const rejectedReason =
    '  Reject after the later review. Preserve both independent reasons and the complete original suggestion.\nRefus — respingere — отказ  ';
  const screenshot = async (name: string) =>
    page.screenshot({
      path: testInfo.outputPath(`ideas-${name}-${suffix}.png`),
      fullPage: true,
    });
  for (const role of ['reader', 'recorder', 'reviewer'] as const)
    await assign(page.request, role, true);
  try {
    await openIdeas(page, narrow);
    const ideas = page.locator('.ideas-workspace');
    await expect(ideas.locator('.ideas-register')).toBeVisible();
    await expect(
      ideas.getByText(
        'This read failed. Refresh before treating this page as current.',
        { exact: true },
      ),
    ).toHaveCount(0);
    await ideas
      .getByRole('button', { name: 'Record Idea', exact: true })
      .click();
    await expect(ideas.locator('#idea-validation')).toContainText(
      'Enter nonblank text',
    );
    await expect(
      ideas.getByLabel('Description', { exact: true }),
    ).toHaveAttribute('aria-invalid', 'true');
    await screenshot('validation');
    await ideas.getByLabel('Description', { exact: true }).fill(description);
    await ideas.getByLabel('Origin', { exact: true }).fill(origin);
    const submission = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/ideas') &&
        response.request().method() === 'POST',
    );
    await ideas
      .getByRole('button', { name: 'Record Idea', exact: true })
      .click();
    const recorded = await submission;
    expect(recorded.status()).toBe(201);
    const value: unknown = await recorded.json();
    if (
      !value ||
      typeof value !== 'object' ||
      !('id' in value) ||
      typeof value.id !== 'string'
    )
      throw new Error('Invalid recorded Idea.');
    const ideaId = value.id;
    await expect(ideas.getByText(/Saved. The confirmed result/u)).toBeVisible();
    await page.reload();
    const row = ideas.locator('.ideas-list').getByRole('button', {
      name: `Synthetic Ideas acceptance ${suffix}`,
      exact: true,
    });
    await row.focus();
    await page.keyboard.press('Enter');
    const article = ideas.locator('article');
    await expect(
      article.getByRole('heading', { name: 'Original submission' }),
    ).toBeFocused();
    expect(await article.locator('.ideas-literal').nth(0).textContent()).toBe(
      description,
    );
    expect(await article.locator('.ideas-literal').nth(1).textContent()).toBe(
      origin,
    );
    await expect(
      article.getByText('Submitted by: Ada Ionescu', { exact: true }),
    ).toBeVisible();
    await expectSelectAppearance(
      article.getByLabel('Disposition', { exact: true }),
    );
    await openSelect(article.getByLabel('Disposition', { exact: true }));
    await screenshot('disposition-select-open');
    await page.keyboard.press('Escape');
    await article.getByLabel('Reason', { exact: true }).fill(deferredReason);
    await article
      .getByLabel('Reconsideration date (optional)', { exact: true })
      .fill('2026-01-15');
    const deferred = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/ideas/${ideaId}/dispositions`) &&
        response.request().method() === 'POST',
    );
    await article
      .getByRole('button', { name: 'Record disposition', exact: true })
      .click();
    expect((await deferred).status()).toBe(201);
    await expect(article.locator('.ideas-history li')).toHaveCount(1);
    expect(
      await article
        .locator('.ideas-history .ideas-literal')
        .first()
        .textContent(),
    ).toBe(deferredReason);
    await screenshot('deferred');
    await selectOption(
      article.getByLabel('Disposition', { exact: true }),
      'rejected',
    );
    await expect(
      article.getByLabel('Reconsideration date (optional)', { exact: true }),
    ).toHaveCount(0);
    await article.getByLabel('Reason', { exact: true }).fill(rejectedReason);
    const rejected = page.waitForResponse(
      (response) =>
        response.url().endsWith(`/api/ideas/${ideaId}/dispositions`) &&
        response.request().method() === 'POST',
    );
    await article
      .getByRole('button', { name: 'Record disposition', exact: true })
      .click();
    expect((await rejected).status()).toBe(201);
    await expect(article.locator('.ideas-history li')).toHaveCount(2);
    await page.reload();
    await row.click();
    await expect(article.locator('.ideas-history li')).toHaveCount(2);
    expect(
      await article.locator('.ideas-history .ideas-literal').allTextContents(),
    ).toEqual([rejectedReason, deferredReason]);
    for (const locale of ['ro', 'ru', 'fr', 'en']) {
      await selectOption(page.locator('#interface-locale'), locale);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      expect(
        await article.locator('.ideas-literal').first().textContent(),
      ).toBe(description);
      await screenshot(`history-${locale}`);
    }
    const dimensions = await page.evaluate(() => ({
      page: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
    }));
    expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport);
    await assign(page.request, 'recorder', false);
    await assign(page.request, 'reviewer', false);
    await page.reload();
    await row.click();
    await expect(article.locator('.ideas-history li')).toHaveCount(2);
    await expect(ideas.getByLabel('Description', { exact: true })).toHaveCount(
      0,
    );
    await expect(article.getByLabel('Reason', { exact: true })).toHaveCount(0);
    await screenshot('reader-only');
    const deniedWrite = await page.request.post(
      `${apiOrigin}/api/ideas/${ideaId}/dispositions`,
      {
        headers: {
          ...member,
          'x-company-context-id': required('ACCEPTANCE_PRIMARY_COMPANY_ID'),
          'idempotency-key': randomUUID(),
        },
        data: {
          kind: 'rejected',
          expectedRevision: 3,
          reason: 'Synthetic denied review',
        },
      },
    );
    expect(deniedWrite.status()).toBe(403);
    await assign(page.request, 'reader', false);
    await page.reload();
    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(
      page
        .getByRole('navigation', { name: 'Primary navigation' })
        .getByRole('link', { name: 'Ideas', exact: true }),
    ).toHaveCount(0);
  } finally {
    for (const role of ['reviewer', 'recorder', 'reader'] as const)
      await assign(page.request, role, false);
  }
});
