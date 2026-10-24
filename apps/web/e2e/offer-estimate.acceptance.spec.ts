import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { selectOption } from './select-option';

const origin = 'http://127.0.0.1:4174/api';
const identities = {
  owner: headers('workspace-owner', 'Workspace Owner'),
  preparer: headers('local-demonstration-user', 'Ada Ionescu'),
  director: headers('responsible-colleague', 'Ion Popa'),
  reader: headers('commercial-readonly-member', 'Commercial Reader'),
};
function headers(subject: string, name: string) {
  return {
    'x-test-external-provider': 'local-demo',
    'x-test-external-subject': subject,
    'x-test-display-name': name,
    'x-test-email': `${subject}@example.test`,
  };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected response object.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected response identity.');
  return value;
}

test('prepares an exact approved-price Offer, retries lost confirmation, versions and reopens both prices, then retires source access independently', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'Narrow' : 'Desktop';
  const companyName = `Approved-price Company DEMO ${suffix}`;
  const subject = `Approved-price Request DEMO ${suffix}`;
  async function command(
    path: string,
    body: unknown,
    identity = identities.owner,
    companyId?: string,
  ) {
    const result = await page.request.post(`${origin}${path}`, {
      headers: {
        ...identity,
        ...(companyId ? { 'x-company-context-id': companyId } : {}),
        'idempotency-key': randomUUID(),
      },
      data: body,
    });
    expect(result.status(), path).toBe(201);
    return object(await result.json());
  }
  async function member(identity: Record<string, string>) {
    const result = await page.request.get(`${origin}/access/current-actor`, {
      headers: identity,
    });
    expect(result.status()).toBe(200);
    return text(object(await result.json()).workspaceMembershipId);
  }
  const companyId = text(
    (await command('/companies', { displayName: companyName })).id,
  );
  const preparerId = await member(identities.preparer),
    directorId = await member(identities.director),
    readerId = await member(identities.reader);
  for (const membershipId of [preparerId, directorId, readerId])
    for (const bundle of ['company-context', 'company-commercial-intake'])
      await command(`/${bundle}-assignments`, {
        companyId,
        workspaceMembershipId: membershipId,
      });
  for (const bundle of [
    'company-director-client',
    'company-offer-preparer',
    'company-profitability-contributor',
  ])
    await command(`/${bundle}-assignments`, {
      companyId,
      workspaceMembershipId: preparerId,
    });
  await command('/company-profitability-director-assignments', {
    companyId,
    workspaceMembershipId: directorId,
  });
  await command('/company-offer-approver-assignments', {
    companyId,
    workspaceMembershipId: readerId,
  });
  const clientId = text(
    (
      await command(
        '/clients',
        {
          displayName: `Approved-price Client DEMO ${suffix}`,
          taxId: `SYNTHETIC-D6-${suffix}`,
          address: '842 Example Street',
        },
        identities.preparer,
        companyId,
      )
    ).id,
  );
  const request = await command(
    '/commercial-intake/requests',
    {
      clientAccountId: clientId,
      subject,
      originalText: 'Synthetic approved-price preparation case.',
      opportunity: {
        title: subject,
        nextAction: 'Prepare the internal approved-price Offer',
      },
    },
    identities.preparer,
    companyId,
  );
  const opportunityId = text(object(request.initialOpportunity).id);
  async function approvedVersion(price: string, prior: number | null) {
    const version = await command(
      `/opportunities/${opportunityId}/profitability-estimates`,
      {
        expectedLatestVersionNumber: prior,
        currency: 'EUR',
        executorType: 'PATENT_CONSULTANT',
        executorCost: '70.00',
        fiscalCost: '10.00',
        allocatedOverhead: '10.00',
        directCosts: [
          {
            key: 'travel',
            category: 'TRAVEL',
            label: 'Synthetic internal travel',
            amount: '10.00',
            currency: 'EUR',
          },
        ],
        targetProfitability: '20',
        proposedPrice: price,
        pricingIntent: { kind: 'ORDINARY' },
        costConfirmation: true,
      },
      identities.preparer,
      companyId,
    );
    const id = text(version.id);
    await command(
      `/opportunities/${opportunityId}/profitability-estimates/versions/${id}/decision`,
      {
        expectedVersionNumber: (prior ?? 0) + 1,
        expectedDecision: null,
        code: 'APPROVE',
      },
      identities.director,
      companyId,
    );
    return id;
  }
  const firstSource = await approvedVersion('125.00', null);
  const attempts: { body: string | null; key: string | undefined }[] = [];
  let confirmationStage = 0;
  await page.route(
    '**/api/offers/opportunities/*/from-approved-estimate',
    async (route) => {
      const request = route.request();
      if (request.method() !== 'POST') return route.continue();
      attempts.push({
        body: request.postData(),
        key: request.headers()['idempotency-key'],
      });
      const actual = await route.fetch();
      expect(actual.status()).toBe(201);
      if (confirmationStage === 0) {
        confirmationStage = 1;
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{}',
        });
      } else if (confirmationStage === 1) {
        confirmationStage = 2;
        const stored = object(await actual.json());
        const version = object(stored.version);
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            ...stored,
            version: {
              ...version,
              priceSource: {
                ...object(version.priceSource),
                kind: 'UNKNOWN_SOURCE',
              },
            },
          }),
        });
      } else await route.fulfill({ response: actual });
    },
  );
  async function openCase() {
    await page.goto('/');
    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await selectOption(page.getByLabel('Active Company', { exact: true }), {
      label: companyName,
    });
    if (narrow)
      await page.getByRole('button', { name: 'Close navigation' }).click();
    await navigate(page, 'Client Requests', narrow);
    const workspace = page.locator('.commercial-intake-workspace');
    await workspace
      .getByRole('button')
      .filter({ has: page.getByText(subject, { exact: true }) })
      .click();
    await expect(
      workspace.getByRole('article', { name: subject, exact: true }),
    ).toBeVisible();
    return workspace.locator('.offer-panel');
  }
  let offer = await openCase();
  await offer
    .getByRole('button', { name: 'Prepare from an approved estimate' })
    .click();
  const preparation = offer.locator('.estimate-offer-preparation');
  await expect(
    preparation.getByRole('button', { name: 'Create internal draft' }),
  ).toBeDisabled();
  await preparation
    .getByLabel('Approved estimate version')
    .selectOption(firstSource);
  await preparation
    .getByLabel('Scope note')
    .fill('  Literal internal scope DEMO  ');
  await page.screenshot({
    path: testInfo.outputPath(`estimate-offer-preparation-${suffix}.png`),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await preparation
    .getByRole('button', { name: 'Create internal draft' })
    .click();
  await preparation
    .getByRole('button', { name: 'Retry identical preparation' })
    .click();
  await expect(
    preparation.getByRole('button', { name: 'Retry identical preparation' }),
  ).toBeVisible();
  await expect(preparation.getByLabel('Scope note')).toHaveValue(
    '  Literal internal scope DEMO  ',
  );
  await expect(offer.locator('.offer-summary')).toHaveCount(0);
  await preparation
    .getByRole('button', { name: 'Retry identical preparation' })
    .click();
  await expect(offer.locator('.offer-summary strong')).toHaveText(
    'Internal draft · tax treatment unspecified',
  );
  expect(attempts).toHaveLength(3);
  expect(attempts[2]).toEqual(attempts[0]);
  expect(attempts[1]).toEqual(attempts[0]);
  expect(JSON.parse(attempts[0]?.body ?? '{}')).toMatchObject({
    estimateVersionId: firstSource,
    scopeNote: '  Literal internal scope DEMO  ',
  });
  await expect(offer.locator('.offer-summary')).toContainText('125.00 EUR');
  await expect(offer.locator('iframe')).toHaveCount(0);
  await expect(
    offer.getByRole('button', { name: 'Run Quality Checks' }),
  ).toHaveCount(0);
  await offer
    .getByRole('button', { name: 'Open the exact source estimate' })
    .click();
  await expect(offer.locator('.profitability-version')).toContainText(
    'Executor cost',
  );
  await offer.getByRole('button', { name: 'Close source details' }).click();
  await offer.screenshot({
    path: testInfo.outputPath(`estimate-offer-first-${suffix}.png`),
  });
  const secondSource = await approvedVersion('150.00', 1);
  await offer
    .getByRole('button', { name: 'Prepare from an approved estimate' })
    .click();
  await preparation
    .getByLabel('Approved estimate version')
    .selectOption(secondSource);
  await preparation
    .getByLabel('Scope note')
    .fill('  Retained stale draft DEMO  ');
  await command(
    `/offers/opportunities/${opportunityId}/versions/from-approved-estimate`,
    {
      expectedOfferRevision: 1,
      estimateVersionId: firstSource,
      estimateVersionNumber: 1,
      recipient: { kind: 'PRIMARY' },
      validityDays: 30,
      scopeNote: 'Concurrent draft DEMO',
      commercialConditions: null,
    },
    identities.preparer,
    companyId,
  );
  await preparation
    .getByRole('button', { name: 'Create internal draft' })
    .click();
  await expect(preparation.getByRole('alert')).toHaveText(
    'The Offer changed. Reload before creating a successor.',
  );
  await expect(preparation.getByLabel('Scope note')).toHaveValue(
    '  Retained stale draft DEMO  ',
  );
  await preparation.screenshot({
    path: testInfo.outputPath(`estimate-offer-stale-${suffix}.png`),
  });
  await preparation.getByRole('button', { name: 'Cancel preparation' }).click();
  offer = await openCase();
  await offer
    .getByRole('button', { name: 'Prepare from an approved estimate' })
    .click();
  await preparation
    .getByLabel('Approved estimate version')
    .selectOption(secondSource);
  await preparation.getByLabel('Scope note').fill('Final internal scope DEMO');
  await preparation
    .getByRole('button', { name: 'Create internal draft' })
    .click();
  await expect(offer.locator('.offer-summary')).toContainText('150.00 EUR');
  await offer
    .getByRole('button', { name: 'Open version 1', exact: true })
    .click();
  await expect(offer.locator('.offer-summary')).toContainText('125.00 EUR');
  await expect(offer.getByText('Historical version · read only')).toBeVisible();
  await offer.screenshot({
    path: testInfo.outputPath(`estimate-offer-history-${suffix}.png`),
  });
  // An exact source read may finish after Company replacement. It must not
  // revive any old protected content in the actual owning App.
  let releaseSource: (() => void) | undefined;
  let sourceRetired = false;
  const sourceRoute = `**/api/opportunities/${opportunityId}/profitability-estimates/versions/${firstSource}`;
  await page.route(sourceRoute, async (route) => {
    const actual = await route.fetch();
    await new Promise<void>((resolve) => {
      releaseSource = resolve;
    });
    await route.fulfill({ response: actual }).catch(() => undefined);
    sourceRetired = true;
  });
  await offer
    .getByRole('button', { name: 'Open the exact source estimate' })
    .click();
  await expect.poll(() => releaseSource !== undefined).toBe(true);
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(page.getByLabel('Active Company', { exact: true }), {
    label: 'PRISMA-PRIM',
  });
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
  await expect(
    page.getByRole('article', { name: subject, exact: true }),
  ).toHaveCount(0);
  if (!releaseSource) throw new Error('Source barrier was not reached.');
  releaseSource();
  await expect.poll(() => sourceRetired).toBe(true);
  await expect(page.locator('.profitability-version')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText(firstSource);
  await page.unroute(sourceRoute);
  const revoked = await page.request.delete(
    `${origin}/company-profitability-contributor-assignments/${preparerId}/${companyId}`,
    { headers: { ...identities.owner, 'idempotency-key': randomUUID() } },
  );
  expect(revoked.status()).toBe(200);
  offer = await openCase();
  await expect(offer.locator('.offer-summary')).toContainText('150.00 EUR');
  await expect(
    offer.getByRole('button', { name: 'Open the exact source estimate' }),
  ).toHaveCount(0);
  await expect(
    offer.getByRole('button', { name: 'Prepare from an approved estimate' }),
  ).toHaveCount(0);
  await expect(page.locator('.profitability-version')).toHaveCount(0);
  await offer.screenshot({
    path: testInfo.outputPath(`estimate-offer-revoked-${suffix}.png`),
  });
  const sourceRequests: string[] = [];
  await page.route('**/api/**', async (route) => {
    if (route.request().url().includes('/profitability-estimates'))
      sourceRequests.push(route.request().url());
    await route.continue({
      headers: { ...route.request().headers(), ...identities.reader },
    });
  });
  offer = await openCase();
  await expect(offer.locator('.offer-summary')).toContainText('150.00 EUR');
  await expect(
    offer.getByRole('button', { name: 'Prepare from an approved estimate' }),
  ).toHaveCount(0);
  await expect(
    offer.getByRole('button', { name: 'Open the exact source estimate' }),
  ).toHaveCount(0);
  await expect(offer.locator('.offer-decision')).not.toContainText(
    'The illustrative representation stays unchanged.',
  );
  expect(sourceRequests).toEqual([]);
  await offer.screenshot({
    path: testInfo.outputPath(`estimate-offer-price-reader-${suffix}.png`),
  });
});
async function navigate(page: Page, name: string, narrow: boolean) {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name, exact: true })
    .click();
}
