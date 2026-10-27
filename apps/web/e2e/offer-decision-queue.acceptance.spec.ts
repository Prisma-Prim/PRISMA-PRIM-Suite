import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { selectOption } from './select-option';
import {
  object,
  text,
  prepareOfferDecisionQueue,
  readQueueClockOffset,
  writeQueueClockOffset,
} from './offer-decision-queue.acceptance.fixture';

let initialClockOffset = 0;
test.beforeEach(async () => {
  initialClockOffset = await readQueueClockOffset();
});
test.afterEach(async () => {
  await writeQueueClockOffset(initialClockOffset);
});

test('discovers page2, reviews the exact Offer, preserves an uncertain approval and refreshes its removal', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const narrow = testInfo.project.name.endsWith('narrow'),
    suffix = narrow ? 'Narrow' : 'Desktop';
  const f = await prepareOfferDecisionQueue(page, suffix);
  let queueReads = 0;
  page.on('request', (request) => {
    if (
      new URL(request.url()).pathname.endsWith('/offer-decision-queue') &&
      request.headers()['x-company-context-id'] === f.companyId
    )
      queueReads++;
  });
  const client = await page.request.get(`${f.origin}/clients/${f.clientId}`, {
    headers: { ...f.identities.approver, 'x-company-context-id': f.companyId },
  });
  expect(client.status()).toBe(403);
  await page.goto('/');
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(page.getByLabel('Active Company', { exact: true }), {
    label: f.companyName,
  });
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
  const queue = page.getByRole('region', {
    name: 'Offers awaiting an internal decision',
    exact: true,
  });
  await expect(queue.getByRole('listitem')).toHaveCount(25);
  await queue.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(queue.getByRole('listitem')).toHaveCount(2);
  const target = f.versions[25];
  if (!target) throw new Error('Missing exact second-page target');
  await expect(queue.getByText(target.title, { exact: true })).toBeVisible();
  const readsBeforeLocale = queueReads;
  const language = page.getByRole('combobox', {
    name: /^(?:Interface language|Limba interfeței|Язык интерфейса|Langue de l’interface)$/u,
  });
  for (const [locale, title] of [
    ['ro', 'Oferte în așteptarea deciziei interne'],
    ['ru', 'Предложения, ожидающие внутреннего решения'],
    ['fr', 'Offres en attente de décision interne'],
    ['en', 'Offers awaiting an internal decision'],
  ]) {
    await selectOption(language, { value: locale });
    await expect(
      page
        .getByRole('region', { name: title, exact: true })
        .getByText(target.title, { exact: true }),
    ).toBeVisible();
  }
  expect(queueReads).toBe(readsBeforeLocale);
  await queue.screenshot({
    path: testInfo.outputPath(
      `pending-offers-page2-${suffix.toLowerCase()}.png`,
    ),
  });
  await queue
    .getByRole('button', {
      name: `Review Offer ${target.reference}, version 1`,
      exact: true,
    })
    .click();
  await expect(
    queue.getByRole('button', { name: 'Run Quality Checks', exact: true }),
  ).toBeVisible();
  await queue
    .getByRole('button', { name: 'Run Quality Checks', exact: true })
    .click();
  await expect(
    queue.getByText('All Quality Checks passed.', { exact: true }),
  ).toBeVisible();
  const attempts: {
    path: string;
    body: string | null;
    key: string | undefined;
  }[] = [];
  const base = `/offers/opportunities/${target.opportunityId}/versions/${target.versionId}`;
  await page.route(`**/api${base}/approve`, async (route) => {
    const request = route.request();
    attempts.push({
      path: new URL(request.url()).pathname,
      body: request.postData(),
      key: request.headers()['idempotency-key'],
    });
    const response = await route.fetch();
    expect(response.status()).toBe(201);
    if (attempts.length === 1) await route.abort('failed');
    else await route.fulfill({ response });
  });
  await queue
    .getByRole('button', { name: 'Approve this version', exact: true })
    .click();
  await expect(
    queue.getByRole('button', { name: 'Retry the same decision', exact: true }),
  ).toBeVisible();
  await expect(
    queue.getByRole('button', { name: 'Back to pending Offers', exact: true }),
  ).toBeDisabled();
  await queue
    .getByRole('button', { name: 'Retry the same decision', exact: true })
    .click();
  await expect(
    queue.getByText('Version approved.', { exact: true }),
  ).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  const exact = await page.request.get(`${f.origin}${base}`, {
    headers: { ...f.identities.approver, 'x-company-context-id': f.companyId },
  });
  expect(exact.status()).toBe(200);
  const frozen = object(object(await exact.json()).offer);
  expect(text(frozen.id)).toBe(target.offerId);
  await expect(queue.locator('iframe')).toHaveAttribute(
    'srcdoc',
    text(object(object(frozen.version).representation).html),
  );
  await queue.locator('iframe').scrollIntoViewIfNeeded();
  await expect(
    queue
      .frameLocator('iframe')
      .getByRole('heading', { name: 'Illustrative Offer', exact: true }),
  ).toBeVisible();
  expect(object(frozen.version)).toMatchObject({
    id: target.versionId,
    decisionState: 'APPROVED',
    transmissionState: 'NOT_TRANSMITTED',
    clientResponseState: 'NONE',
  });
  await queue.screenshot({
    path: testInfo.outputPath(
      `pending-offer-exact-decision-${suffix.toLowerCase()}.png`,
    ),
  });
  await queue
    .getByRole('button', { name: 'Back to pending Offers', exact: true })
    .click();
  await expect(queue.getByRole('listitem')).toHaveCount(25);
  await expect(queue.getByText(target.title, { exact: true })).toHaveCount(0);
  await queue.getByRole('button', { name: 'Next page', exact: true }).click();
  await expect(queue.getByRole('listitem')).toHaveCount(1);
  await expect(queue.getByText(target.title, { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const revoke = await page.request.delete(
    `${f.origin}/company-offer-approver-assignments/${f.approverId}/${f.companyId}`,
    { headers: { ...f.identities.owner, 'idempotency-key': randomUUID() } },
  );
  expect(revoke.status()).toBe(200);
  await page.reload();
  await expect(
    page.getByLabel('Active Company', { exact: true }),
  ).toBeEnabled();
  await expect(queue).toHaveCount(0);
});
