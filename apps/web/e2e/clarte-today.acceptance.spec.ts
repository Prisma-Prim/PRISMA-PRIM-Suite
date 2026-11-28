import { expect, test, type Page, type Route } from '@playwright/test';
import {
  createClarteTodayApi,
  todayClient,
  todayDecisions,
  todayDirectRequest,
  todayOtherCompany,
  todayTasks,
} from '../src/clarte/today/clarte-today.test-fixture';
import { isPhoneLayout, openClarte } from './clarte.fixture';

/** Every API request is answered by the shared fictional Today API. */
async function serveToday(page: Page) {
  const api = createClarteTodayApi();
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const contentType = request.headers()['content-type'] ?? '';
    const reply = api.reply({
      method: request.method(),
      url: new URL(request.url()),
      body: contentType.startsWith('application/json')
        ? request.postDataJSON()
        : undefined,
      companyId: request.headers()['x-company-context-id'] ?? null,
    });
    return route.fulfill({ status: reply.status, json: reply.json });
  });
  return api;
}

async function screenshot(page: Page, name: string) {
  const width = isPhoneLayout(page) ? '390' : '1440';
  await page.screenshot({
    path: test.info().outputPath(`${name}-${width}.png`),
    fullPage: false,
  });
}

async function noHorizontalScroll(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

const offerTitle = todayDecisions.offer.opportunityTitle;

test('walks Today in order, reviews an Offer, records a Client Request and continues to another Company', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const api = await serveToday(page);
  await openClarte(page, '/#overview');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Today');
  const decisions = page.getByRole('region', { name: 'To decide' });
  await expect(
    decisions.getByRole('button', {
      name: `Review Offer ${todayDecisions.offer.illustrativeReference}, version ${todayDecisions.offer.versionNumber}`,
    }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'This week' })
      .getByText(todayTasks.stageOne.title),
  ).toBeAttached();
  await noHorizontalScroll(page);
  await screenshot(page, 'today');

  // Work in order, one item at a time to the end.
  await page.getByRole('button', { name: 'Work in order' }).click();
  const work = page.getByRole('region', { name: 'Work in order' });
  const item = work.getByRole('article');
  await expect(item).toContainText('Item 1 of 8');
  await expect(item.getByRole('heading', { level: 3 })).toHaveText(
    todayDecisions.profitability.opportunityTitle,
  );
  await noHorizontalScroll(page);
  await screenshot(page, 'work');
  for (let position = 2; position <= 8; position++) {
    await item.getByRole('button', { name: 'Next' }).click();
    await expect(item).toContainText(`Item ${position} of 8`);
  }
  await expect(item.getByRole('heading', { level: 3 })).toHaveText(
    todayTasks.stageOne.title,
  );
  await expect(item.getByRole('button', { name: 'Next' })).toBeDisabled();

  // One Offer decision opens in its existing review, then Today comes back.
  await work
    .getByRole('navigation', { name: 'Items in order' })
    .getByRole('button', { name: new RegExp(offerTitle) })
    .click();
  await item.getByRole('button', { name: `Open ${offerTitle}` }).click();
  const review = page.getByRole('dialog', { name: offerTitle });
  await expect(
    review.getByRole('button', { name: 'Approve this version' }),
  ).toBeVisible();
  await screenshot(page, 'review');
  await review.getByRole('button', { name: 'Close' }).click();
  await expect(review).toBeHidden();
  await expect(item).toContainText('Item 2 of 8');
  await work.getByRole('button', { name: 'Back to Today' }).click();

  // The Company's overdue Tasks open as their own page.
  await page
    .getByRole('region', { name: 'Company summary' })
    .getByRole('button', { name: /^Overdue Tasks: 2\./ })
    .click();
  const overdue = page.getByRole('region', {
    name: 'Overdue Tasks in PRISMA-PRIM',
  });
  await expect(overdue.getByText(todayTasks.questionnaire.title)).toBeVisible();
  await noHorizontalScroll(page);
  await screenshot(page, 'overdue');
  await overdue
    .getByRole('button', { name: 'Close the overdue Tasks' })
    .click();

  // A Client Request with its initial Opportunity, from the quick action.
  await page.getByRole('button', { name: 'New Client Request' }).click();
  const capture = page.getByRole('dialog', { name: 'New Client Request' });
  await capture
    .getByLabel('Original request text')
    .fill('We would like an ISO 22000 audit next spring.');
  await capture.getByLabel('Source label').fill('E-mail');
  await capture.getByLabel('Subject').fill('ISO 22000 audit');
  await capture
    .getByLabel('Opportunity title')
    .fill('ISO 22000 certification for Lumen Dairy');
  await capture.getByLabel('Next action').fill('Call the quality manager');
  await screenshot(page, 'capture');
  await capture.getByRole('button', { name: 'Capture Request' }).click();
  await expect(
    capture.getByText(
      'Client Request recorded: ISO 22000 certification for Lumen Dairy.',
    ),
  ).toBeVisible();
  expect(api.writes).toEqual(['POST /api/commercial-intake/requests']);
  await capture.getByRole('button', { name: 'Close' }).click();

  // A direct Contract starts from the deal it belongs to.
  await page.getByRole('button', { name: 'Direct Contract' }).click();
  const direct = page.getByRole('dialog', { name: 'Direct Contract' });
  await direct
    .getByRole('button', {
      name: `Prepare a direct Contract for ${todayDirectRequest.initialOpportunity.title} (${todayClient.displayName})`,
    })
    .click();
  await expect(direct.getByLabel('Internal direct reason')).toBeVisible();
  await screenshot(page, 'direct-contract');
  await direct.getByRole('button', { name: 'Close' }).click();

  // Another Company, only after confirmation.
  await page.getByRole('button', { name: 'All Companies summaries' }).click();
  await page
    .getByRole('button', {
      name: `${todayOtherCompany.displayName}: Active Clients: 4. Open the Client directory`,
    })
    .click();
  const confirmation = page.getByRole('dialog', {
    name: 'Open Company destination',
  });
  await expect(confirmation).toContainText(todayOtherCompany.displayName);
  await screenshot(page, 'companies');
  await confirmation.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/#clients$/u);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Clients');
  expect([...api.unhandled]).toEqual([]);
});
