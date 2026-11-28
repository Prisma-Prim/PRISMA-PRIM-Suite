import {
  expect,
  test,
  type Locator,
  type Page,
  type Route,
} from '@playwright/test';
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
  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route: Route) => {
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
    },
  );
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

async function bounds(locator: Locator) {
  const box = await locator.boundingBox({ timeout: 5_000 });
  if (!box) throw new Error(`Expected a visible element: ${locator}`);
  return box;
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
  const estimateAction = decisions.getByRole('button', {
    name: 'Review version 2',
  });
  const offerAction = decisions.getByRole('button', {
    name: `Review Offer ${todayDecisions.offer.illustrativeReference}, version ${todayDecisions.offer.versionNumber}`,
  });
  await expect(offerAction).toBeVisible();
  await expect(
    decisions.getByRole('heading', { name: 'Decide on the Offer' }),
  ).toBeVisible();
  const week = page.getByRole('region', { name: 'This week' });
  await expect(week.getByText(todayTasks.stageOne.title)).toBeAttached();
  const summary = page.getByRole('region', { name: 'Company summary' });
  const companiesOpener = summary.getByRole('button', {
    name: 'All Companies summaries',
  });
  await expect(companiesOpener).toBeVisible();
  const start = page.getByRole('button', { name: 'Work in order' });
  if (isPhoneLayout(page)) {
    const capture = await bounds(
      page.getByRole('button', { name: 'New Client Request' }),
    );
    const direct = await bounds(
      page.getByRole('button', { name: 'Direct Contract' }),
    );
    expect(capture.y).toBeCloseTo(direct.y, 0);
    expect((await bounds(start)).y).toBeLessThan(capture.y);
    await expect(estimateAction).toBeInViewport({ ratio: 1 });
  } else {
    const estimateCard = await bounds(
      decisions.getByRole('listitem').filter({
        hasText: todayDecisions.profitability.opportunityTitle,
      }),
    );
    const offerCard = await bounds(
      decisions.getByRole('listitem').filter({ hasText: offerTitle }),
    );
    expect(estimateCard.y).toBeCloseTo(offerCard.y, 0);
    expect(estimateCard.height).toBeCloseTo(offerCard.height, 0);
    expect((await bounds(estimateAction)).y).toBeCloseTo(
      (await bounds(offerAction)).y,
      0,
    );
    const counterRow = await summary.getByRole('listitem').all();
    expect(counterRow).toHaveLength(3);
    const counters = await Promise.all(counterRow.map(bounds));
    expect(new Set(counters.map(({ y }) => Math.round(y))).size).toBe(1);
    await expect(
      week.getByRole('heading', { name: 'This week' }),
    ).toBeInViewport();
  }
  await noHorizontalScroll(page);
  await screenshot(page, 'today');

  // Work in order, one item at a time to the end.
  await start.click();
  const work = page.getByRole('region', { name: 'Work in order' });
  const queue = work.getByRole('navigation', { name: 'Items in order' });
  const item = work.getByRole('article');
  await expect(item).toContainText('Item 1 of 8');
  await expect(item.getByRole('heading', { level: 3 })).toHaveText(
    todayDecisions.profitability.opportunityTitle,
  );
  const headingBox = await bounds(
    work.getByRole('heading', { name: 'Work in order' }),
  );
  const backBox = await bounds(
    work.getByRole('button', { name: 'Back to Today' }),
  );
  const queueBox = await bounds(queue);
  expect(backBox.x).toBeGreaterThan(headingBox.x);
  expect(backBox.y).toBeLessThan(queueBox.y);
  if (isPhoneLayout(page))
    expect(queueBox.y + queueBox.height).toBeLessThan((await bounds(item)).y);
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
  await queue.getByRole('button', { name: new RegExp(offerTitle) }).click();
  await item.getByRole('button', { name: `Open ${offerTitle}` }).click();
  const review = isPhoneLayout(page)
    ? page.getByRole('dialog', { name: offerTitle })
    : work.getByRole('region', { name: offerTitle });
  await expect(
    review.getByRole('button', { name: 'Approve this version' }),
  ).toBeVisible();
  if (!isPhoneLayout(page)) {
    await expect(queue).toBeVisible();
    expect((await bounds(review)).x).toBeGreaterThan(
      queueBox.x + queueBox.width,
    );
  }
  await screenshot(page, 'review');
  await review.getByRole('button', { name: 'Close' }).click();
  await expect(review).toBeHidden();
  await expect(item).toContainText('Item 2 of 8');
  await work.getByRole('button', { name: 'Back to Today' }).click();

  // The Company's overdue Tasks open as their own page.
  await summary.getByRole('button', { name: /^Overdue Tasks: 2\./ }).click();
  const overdue = page.getByRole('region', {
    name: 'Overdue Tasks in PRISMA-PRIM',
  });
  await expect(overdue.getByText(todayTasks.questionnaire.title)).toBeVisible();
  const dueDates = overdue.getByText('Due date', { exact: true });
  await expect(dueDates).toHaveCount(2);
  const dueDate = await bounds(dueDates.first());
  if (isPhoneLayout(page)) {
    const dateValue = await bounds(
      dueDates.first().locator('..').locator('dd'),
    );
    expect(dateValue.y).toBeLessThan(dueDate.y + dueDate.height);
    expect(dueDate.y).toBeLessThan(dateValue.y + dateValue.height);
    expect(dateValue.x).toBeGreaterThan(dueDate.x + dueDate.width);
  } else {
    expect((await bounds(dueDates.last())).x).toBeCloseTo(dueDate.x, 0);
    expect(dueDate.x).toBeGreaterThan(
      (
        await bounds(
          overdue.getByText(todayTasks.questionnaire.title, { exact: true }),
        )
      ).x,
    );
  }
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
  await companiesOpener.click();
  const companies = page.getByRole('region', {
    name: 'All Companies summaries',
  });
  const refresh = companies.getByRole('button', {
    name: 'Refresh All Companies summaries',
  });
  const close = companies.getByRole('button', {
    name: 'Close All Companies summaries',
  });
  const otherClientCount = companies.getByRole('button', {
    name: `${todayOtherCompany.displayName}: Active Clients: 4. Open the Client directory`,
  });
  await expect(otherClientCount).toBeVisible();
  const companiesHeading = companies.getByRole('heading', {
    name: 'All Companies summaries',
  });
  await companiesHeading.scrollIntoViewIfNeeded();
  const [titleBox, refreshBox, closeBox] = await Promise.all(
    [companiesHeading, refresh, close].map(bounds),
  );
  for (const control of [refreshBox, closeBox]) {
    expect(control.x).toBeGreaterThanOrEqual(titleBox.x + titleBox.width);
    expect(control.y).toBeCloseTo(titleBox.y, 0);
    expect(control.width).toBeGreaterThanOrEqual(44);
    expect(control.height).toBeGreaterThanOrEqual(44);
  }
  await noHorizontalScroll(page);
  await screenshot(page, 'companies');
  await refresh.click();
  await expect(otherClientCount).toBeVisible();
  await close.click();
  await expect(companiesOpener).toBeFocused();
  await companiesOpener.click();
  await otherClientCount.click();
  const confirmation = page.getByRole('dialog', {
    name: 'Open Company destination',
  });
  await expect(confirmation).toContainText(todayOtherCompany.displayName);
  await screenshot(page, 'company-confirmation');
  await confirmation.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/#clients$/u);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Clients');
  expect([...api.unhandled]).toEqual([]);
});
