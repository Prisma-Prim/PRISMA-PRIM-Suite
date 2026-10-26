import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { selectOption } from './select-option';

const origin = 'http://127.0.0.1:4174/api';
const owner = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};
const reader = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'local-demonstration-user',
  'x-test-display-name': 'Ada Ionescu',
  'x-test-email': 'ada@example.test',
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected public response.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected public identity.');
  return value;
}

test('continues an older Client affair from the inline dossier through exact independently authorized economics', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'Narrow' : 'Desktop';
  const companyName = `Client commercial DEMO ${suffix}`;
  const clientName = `Client dossier DEMO ${suffix}`;
  const subject = `Oldest Client affair DEMO ${suffix} — synthetic consulting preparation`;
  async function command(
    path: string,
    body: unknown,
    identity = owner,
    companyId?: string,
  ) {
    const response = await page.request.post(origin + path, {
      headers: {
        ...identity,
        ...(companyId ? { 'x-company-context-id': companyId } : {}),
        'idempotency-key': randomUUID(),
      },
      data: body,
    });
    expect(response.status(), path).toBe(201);
    return object(await response.json());
  }
  const companyId = text(
    (await command('/companies', { displayName: companyName })).id,
  );
  const currentActor = await page.request.get(
    origin + '/access/current-actor',
    { headers: reader },
  );
  expect(currentActor.status()).toBe(200);
  const memberId = text(
    object(await currentActor.json()).workspaceMembershipId,
  );
  for (const bundle of [
    'company-context',
    'company-director-client',
    'company-commercial-intake',
    'company-opportunity-manager',
    'company-profitability-contributor',
  ])
    await command(`/${bundle}-assignments`, {
      companyId,
      workspaceMembershipId: memberId,
    });
  const clientId = text(
    (await command('/clients', { displayName: clientName }, reader, companyId))
      .id,
  );
  const capture = (title: string, linked: boolean) =>
    command(
      '/commercial-intake/requests',
      {
        sourceLabel: 'Synthetic Client commercial acceptance',
        originalText: `Synthetic original source: ${title}`,
        subject: title,
        ...(linked ? { clientAccountId: clientId } : {}),
        opportunity: {
          title,
          scope: 'Synthetic consulting only; no real Client data.',
          nextAction: `Review economics: ${title}`,
        },
      },
      reader,
      companyId,
    );
  const oldest = await capture(subject, true);
  const requestId = text(oldest.id);
  const opportunityId = text(object(oldest.initialOpportunity).id);
  const estimatePath = `/opportunities/${opportunityId}/profitability-estimates`;
  const estimate = await command(
    estimatePath,
    {
      expectedLatestVersionNumber: null,
      currency: 'EUR',
      executorType: 'PATENT_CONSULTANT',
      executorCost: '60.00',
      fiscalCost: '10.00',
      allocatedOverhead: '10.00',
      directCosts: [
        {
          key: 'travel',
          category: 'TRAVEL',
          label: 'Synthetic travel',
          amount: '20.00',
          currency: 'EUR',
        },
      ],
      targetProfitability: '20',
      proposedPrice: '125.00',
      pricingIntent: { kind: 'ORDINARY' },
      costConfirmation: true,
    },
    reader,
    companyId,
  );
  const won = await page.request.post(
    `${origin}/commercial-intake/opportunities/${opportunityId}/outcome`,
    {
      headers: {
        ...reader,
        'x-company-context-id': companyId,
        'idempotency-key': randomUUID(),
      },
      data: { expectedVersion: 1, status: 'WON' },
    },
  );
  expect(won.status()).toBe(200);
  for (let index = 1; index < 26; index += 1)
    await capture(`Matching Client affair DEMO ${suffix} ${index}`, true);
  for (let index = 0; index < 52; index += 1)
    await capture(`Unrelated Company affair DEMO ${suffix} ${index}`, false);
  const ordinary = await page.request.get(
    origin + '/commercial-intake/requests',
    { headers: { ...reader, 'x-company-context-id': companyId } },
  );
  expect(ordinary.status()).toBe(200);
  expect(JSON.stringify(await ordinary.json())).not.toContain(requestId);

  await page.goto('/');
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(page.getByLabel('Active Company', { exact: true }), {
    label: companyName,
  });
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
  async function openDossier() {
    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name: 'Clients', exact: true })
      .click();
    await page
      .locator('.client-directory li')
      .filter({ has: page.getByText(clientName, { exact: true }) })
      .getByRole('button', { name: 'Open dossier', exact: true })
      .click();
    return page.getByRole('region', {
      name: 'Commercial affairs',
      exact: true,
    });
  }
  let commercial = await openDossier();
  await expect(
    commercial.locator('.client-commercial-affairs-list > li'),
  ).toHaveCount(25);
  await expect(
    commercial.getByText(companyName, { exact: true }),
  ).toBeVisible();
  await expect(commercial.getByText(/Unrelated Company affair/u)).toHaveCount(
    0,
  );
  await commercial
    .getByRole('heading', { name: 'Commercial affairs' })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath(
      `client-commercial-first-${suffix.toLowerCase()}.png`,
    ),
  });
  await commercial.getByRole('button', { name: 'Older affairs' }).click();
  await expect(
    commercial.locator('.client-commercial-affairs-list > li'),
  ).toHaveCount(1);
  await expect(
    commercial.getByText(`Review economics: ${subject}`, { exact: true }),
  ).toBeVisible();
  await expect(
    commercial.getByText('Ada Ionescu', { exact: true }),
  ).toBeVisible();
  await expect(commercial.getByText('Won', { exact: true })).toBeVisible();
  await expect(
    commercial.getByRole('heading', { name: 'Commercial affairs' }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await commercial.screenshot({
    path: testInfo.outputPath(
      `client-commercial-older-${suffix.toLowerCase()}.png`,
    ),
  });
  await commercial
    .getByRole('button', { name: `Open Request: ${subject}`, exact: true })
    .click();
  const intake = page.locator('.commercial-intake-workspace');
  await expect(
    intake.getByText(`Synthetic original source: ${subject}`, { exact: true }),
  ).toBeVisible();
  await expect(intake.locator('#commercial-intake-detail-title')).toBeFocused();
  const economics = intake.getByRole('region', {
    name: 'Profitability Estimate',
    exact: true,
  });
  await economics
    .getByRole('button', { name: 'Open version 1', exact: true })
    .click();
  await expect(
    economics.getByRole('article', { name: 'Version 1', exact: true }),
  ).toBeVisible();
  await economics.screenshot({
    path: testInfo.outputPath(
      `client-commercial-economics-${suffix.toLowerCase()}.png`,
    ),
  });

  async function revoke(bundle: string) {
    const response = await page.request.delete(
      `${origin}/${bundle}-assignments/${memberId}/${companyId}`,
      { headers: { ...owner, 'idempotency-key': randomUUID() } },
    );
    expect(response.status(), bundle).toBe(200);
  }
  await revoke('company-profitability-contributor');
  const deniedEconomics = await page.request.get(
    `${origin}${estimatePath}/versions/${text(estimate.id)}`,
    { headers: { ...reader, 'x-company-context-id': companyId } },
  );
  expect(deniedEconomics.status()).toBe(403);
  await page.reload();
  commercial = await openDossier();
  await commercial.getByRole('button', { name: 'Older affairs' }).click();
  await commercial
    .getByRole('button', { name: `Open Request: ${subject}`, exact: true })
    .click();
  await expect(
    intake.getByText(`Synthetic original source: ${subject}`, { exact: true }),
  ).toBeVisible();
  await expect(
    intake.getByRole('region', { name: 'Profitability Estimate', exact: true }),
  ).toHaveCount(0);
  await revoke('company-commercial-intake');
  await page.reload();
  await openDossier();
  await expect(
    page.getByRole('region', { name: 'Commercial affairs', exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .locator('.client-dossier-detail')
      .getByRole('heading', { name: clientName, exact: true }),
  ).toBeVisible();
  const deniedAffairs = await page.request.get(
    `${origin}/commercial-intake/requests?clientDossierId=${clientId}`,
    { headers: { ...reader, 'x-company-context-id': companyId } },
  );
  expect(deniedAffairs.status()).toBe(403);
});
