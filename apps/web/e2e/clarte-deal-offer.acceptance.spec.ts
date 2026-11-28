import { expect, test, type Page, type Route } from '@playwright/test';
import {
  commercialClient,
  commercialRequest,
  createDealCommercialApi,
} from '../src/clarte/deals/commercial-stages.test-fixture';
import { pdfReply } from '../src/commercial-pdf/commercial-pdf.test-fixture';
import { isPhoneLayout, openClarte } from './clarte.fixture';
import { selectOption } from './select-option';

/** Every API request is answered by the shared fictional deal API. */
async function serveDeal(page: Page) {
  const api = createDealCommercialApi();
  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.endsWith('/pdf')) {
      const reply = await pdfReply(api.pdfTarget());
      return route.fulfill({
        status: reply.status,
        headers: Object.fromEntries(reply.headers),
        body: Buffer.from(await reply.arrayBuffer()),
      });
    }
    const contentType = request.headers()['content-type'] ?? '';
    const reply = api.reply({
      method: request.method(),
      url,
      body: contentType.startsWith('application/json')
        ? request.postDataJSON()
        : undefined,
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

const dealTitle = commercialRequest.initialOpportunity.title;

test('records a snapshot, approves an estimate, then prepares, checks, approves and sends an Offer to its accepted PDF', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const api = await serveDeal(page);
  await openClarte(page, '/#requests');
  await page.getByRole('button', { name: dealTitle }).click();
  await expect(
    page.getByRole('heading', { level: 2, name: dealTitle }),
  ).toBeFocused();
  const thread = page.getByRole('list', { name: 'Deal stages' });

  // Costing: a recorded snapshot, then an estimate approved beside it.
  await thread.getByRole('button', { name: /Costing/u }).click();
  const costing = page.getByRole('region', { name: 'Costing', exact: true });
  const pricing = costing.getByRole('region', { name: 'Illustrative pricing' });
  await pricing
    .getByRole('checkbox', { name: 'ISO 22000 certification audit' })
    .check();
  await pricing.getByLabel('Quantity').fill('5');
  await pricing.getByRole('button', { name: 'Calculate and save' }).click();
  await expect(
    pricing.getByRole('button', { name: 'Close snapshot' }),
  ).toBeVisible();
  await expect(thread.getByRole('button', { name: /Costing/u })).toContainText(
    'Current stage',
  );
  const estimate = costing.getByRole('region', {
    name: 'Profitability Estimate',
  });
  for (const [label, value] of [
    ['ISO currency', 'MDL'],
    ['Executor cost', '9800.00'],
    ['Confirmed fiscal cost', '1700.00'],
    ['Explicit allocated overhead', '1200.00'],
    ['Proposed commercial price', '21000.00'],
    ['Target profitability (%)', '30'],
  ] as const)
    await estimate.getByLabel(label, { exact: true }).fill(value);
  await selectOption(estimate.getByLabel('Executor type'), {
    label: 'Director or employee',
  });
  await selectOption(estimate.getByLabel('Pricing intent'), {
    label: 'Ordinary pricing',
  });
  await estimate.getByRole('checkbox').check();
  await estimate
    .getByRole('button', { name: 'Save confirmed version' })
    .click();
  const decision = estimate.getByRole('region', {
    name: 'Decision for this version',
  });
  await expect(decision).toBeVisible();
  if (!isPhoneLayout(page)) {
    // The decision sits beside the exact figures it decides.
    const figures = await estimate
      .locator('.profitability-version-record')
      .boundingBox();
    const form = await decision.boundingBox();
    expect(figures && form && form.x > figures.x + figures.width - 1).toBe(
      true,
    );
  }
  await noHorizontalScroll(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await screenshot(page, 'deal-costing');
  await decision.scrollIntoViewIfNeeded();
  await screenshot(page, 'deal-costing-decision');
  await decision.getByRole('button', { name: 'Approve this version' }).click();
  await expect(decision).toContainText('Approved');
  await expect(
    costing.getByRole('region', { name: 'At a glance' }),
  ).toContainText('Approved');

  // Offer: version 1 from the snapshot, checked and approved beside it.
  await thread.getByRole('button', { name: /Offer/u }).click();
  const stage = page.getByRole('region', { name: 'Offer', exact: true });
  await stage
    .getByLabel('Commercial conditions')
    .fill('Half on signature, half after the audit');
  await stage.getByRole('button', { name: 'Prepare version 1' }).click();
  await expect(
    stage.getByTitle('Illustrative Offer representation'),
  ).toBeVisible();
  await expect(thread.getByRole('button', { name: /Offer/u })).toContainText(
    'Current stage',
  );
  const commands = stage.locator('.offer-version-commands');
  await commands.getByRole('button', { name: 'Run Quality Checks' }).click();
  await expect(commands.getByText('All Quality Checks passed.')).toBeVisible();
  const approval = commands.getByRole('region', { name: 'Internal decision' });
  if (!isPhoneLayout(page)) {
    const document = await stage
      .locator('.offer-version-document')
      .boundingBox();
    const form = await approval.boundingBox();
    expect(document && form && form.x > document.x + document.width - 1).toBe(
      true,
    );
  }
  await noHorizontalScroll(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await screenshot(page, 'deal-offer');
  await approval.scrollIntoViewIfNeeded();
  await screenshot(page, 'deal-offer-decision');
  await approval.getByRole('button', { name: 'Approve this version' }).click();
  await expect(stage.getByText('Version approved.')).toBeVisible();

  // The simulated transmission and the Client's acceptance.
  await commands
    .getByLabel('Simulation note')
    .fill('Sent by e-mail to the Client');
  await commands
    .getByRole('button', { name: 'Record simulated transmission' })
    .click();
  await commands
    .getByLabel('Reported received time (UTC)')
    .fill('2026-10-03T12:35:00.000Z');
  await commands
    .getByRole('button', { name: 'Record simulated acceptance' })
    .click();
  await expect(
    stage.getByText('Simulated Client acceptance recorded'),
  ).toBeVisible();
  await expect(stage.getByRole('region', { name: 'Offer path' })).toContainText(
    'Accepted by the Client',
  );

  // The exact unofficial PDF of the accepted version.
  const download = page.waitForEvent('download');
  await stage
    .locator('.offer-version-document')
    .getByRole('button', { name: 'Download non-official PDF' })
    .click();
  expect((await download).suggestedFilename()).toBe(
    'offer-12-v1-non-official-en.pdf',
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await screenshot(page, 'deal-offer-accepted');

  expect(api.writes.map((write) => write.split('/').at(-1))).toEqual([
    'snapshots',
    'profitability-estimates',
    'decision',
    commercialRequest.initialOpportunity.id,
    'quality-checks',
    'approve',
    'transmission',
    'client-response',
  ]);
  expect(api.dealReads()).toBeGreaterThanOrEqual(9);
  expect(
    [...api.unhandled].filter((request) =>
      /\/api\/(deals|commercial-intake|pricing\/|opportunities\/|offers)/u.test(
        request,
      ),
    ),
  ).toEqual([]);
  await expect(
    page.locator('.clarte-deal-head').getByText(commercialClient.displayName),
  ).toBeVisible();
});
