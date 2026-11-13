import { expect, test } from '@playwright/test';
import {
  openRequestCase,
  waitForRequestPage,
} from './opportunity-follow-up-case';

test('opens the Request when the last-page button disappears during its visibility check', async ({
  page,
}) => {
  await page.setContent(`
    <section class="commercial-intake-workspace">
      <ul class="commercial-intake-list"><li>Another Request</li></ul>
      <button>Show older Requests</button>
    </section>
  `);
  const target = {
    subject: 'Discovery 00',
    originalText: 'The preserved original Request.',
  };
  await page.evaluate((target) => {
    const intake = document.querySelector('.commercial-intake-workspace');
    const list = document.querySelector('.commercial-intake-list');
    const older = document.querySelector('button');
    if (!intake || !list || !older)
      throw new Error('Missing browser regression fixture.');
    older.onclick = () => {
      older.remove();
      const row = document.createElement('li');
      const open = document.createElement('button');
      open.textContent = target.subject;
      open.onclick = () => {
        const article = document.createElement('article');
        article.setAttribute('aria-label', target.subject);
        article.textContent = target.originalText;
        intake.append(article);
      };
      row.append(open);
      list.append(row);
    };
  }, target);

  const intake = page.locator('.commercial-intake-workspace');
  const row = intake
    .locator('.commercial-intake-list > li')
    .filter({ hasText: target.subject });
  const older = intake.getByRole('button', {
    name: 'Show older Requests',
    exact: true,
    disabled: false,
  });
  const readVisible = older.isVisible.bind(older);
  // Keep the real browser query and its actual result, but synchronize the
  // completed last-page render immediately after that result is captured.
  // The next locator lookup therefore sees exactly the missing-button state
  // recorded in the CI trace; no locator result or auto-wait is mocked.
  older.isVisible = async (options) => {
    const visible = await readVisible(options);
    if (visible)
      await older.evaluate((button) => {
        if (!(button instanceof HTMLButtonElement))
          throw new Error('Expected the native continuation button.');
        button.click();
      });
    return visible;
  };
  await waitForRequestPage(row, older);
  // The regression must exercise the completed final-page render before
  // opening the Request, rather than pass by clicking the older button later.
  await expect(older).toHaveCount(0);
  await expect(row).toBeVisible();
  await openRequestCase(intake, target);
  await expect(
    page.getByRole('button', { name: 'Show older Requests', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('article', { name: target.subject, exact: true }),
  ).toBeVisible();
});

test('opens an attached Request once it becomes visible without a continuation button', async ({
  page,
}) => {
  const target = {
    subject: 'Discovery 00',
    originalText: 'The preserved original Request.',
  };
  await page.setContent(`
    <section class="commercial-intake-workspace">
      <ul class="commercial-intake-list">
        <li>Another Request</li>
        <li hidden><button>Discovery 00</button></li>
      </ul>
    </section>
  `);
  await page.evaluate((target) => {
    const button = document.querySelector('button');
    const intake = document.querySelector('.commercial-intake-workspace');
    if (!button || !intake)
      throw new Error('Missing browser regression fixture.');
    button.onclick = () => {
      const article = document.createElement('article');
      article.setAttribute('aria-label', target.subject);
      article.textContent = target.originalText;
      intake.append(article);
    };
  }, target);
  const intake = page.locator('.commercial-intake-workspace');
  const row = intake
    .locator('.commercial-intake-list > li')
    .filter({ hasText: target.subject });
  const readVisible = row.isVisible.bind(row);
  row.isVisible = async (options) => {
    const visible = await readVisible(options);
    if (!visible)
      await row.evaluate((element) => element.removeAttribute('hidden'));
    return visible;
  };
  await waitForRequestPage(
    row,
    intake.getByRole('button', {
      name: 'Show older Requests',
      exact: true,
      disabled: false,
    }),
  );
  await openRequestCase(intake, target);
  await expect(
    intake.getByRole('article', { name: target.subject, exact: true }),
  ).toBeVisible();
});
