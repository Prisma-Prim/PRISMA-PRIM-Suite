import { randomUUID, createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { syntheticContent } from '../src/offer-model/offer-model.fixture';
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

test('generates a complete Romanian Offer, retries committed uncertainty, independently approves, rehearses transmission and preserves exact history', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'Narrow' : 'Desktop';
  const companyName = `Generated-model Company DEMO ${suffix}`;
  const subject = `Generated-model Request DEMO ${suffix}`;
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
          displayName: `Generated-model Client DEMO ${suffix}`,
          taxId: `SYNTHETIC-D7-MODEL-${suffix}`,
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
  for (const bundle of [
    'company-offer-model-editor',
    'company-offer-model-approver',
  ])
    await command(`/${bundle}-assignments`, {
      companyId,
      workspaceMembershipId: directorId,
    });
  const model = object(
    (
      await command(
        '/offer-models/consulting-ro/versions',
        { expectedModelRevision: 0, content: syntheticContent },
        identities.director,
        companyId,
      )
    ).model,
  );
  const modelVersionId = text(object(model.head).id);
  await command(
    `/offer-models/consulting-ro/versions/${modelVersionId}/decision`,
    {
      expectedModelRevision: 1,
      versionNumber: 1,
      outcome: 'APPROVE',
      basis: 'Synthetic full-model review',
    },
    identities.director,
    companyId,
  );
  let currentIdentity = identities.preparer;
  await page.route('**/api/**', (route) =>
    route.fallback({
      headers: { ...route.request().headers(), ...currentIdentity },
    }),
  );
  const attempts: { body: string | null; key: string | undefined }[] = [];
  let firstHtml: string | undefined, firstSha: string | undefined;
  await page.route(
    `**/api/offers/opportunities/${opportunityId}/from-approved-model`,
    async (route) => {
      attempts.push({
        body: route.request().postData(),
        key: route.request().headers()['idempotency-key'],
      });
      const actual = await route.fetch();
      expect(actual.status()).toBe(201);
      const recorded = object(await actual.json());
      const version = object(recorded.version);
      const representation = object(version.representation);
      firstHtml = text(representation.html);
      firstSha = text(representation.sha256);
      if (attempts.length === 1)
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{}',
        });
      else if (attempts.length === 2)
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            ...recorded,
            version: { ...version, modelSource: null },
          }),
        });
      else await route.fulfill({ response: actual });
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
  async function fillPreparation(
    offer: ReturnType<Page['locator']>,
    tax: string,
  ) {
    await offer
      .getByRole('button', { name: 'Prepare full Offer from approved model' })
      .click();
    const form = offer.locator('.estimate-offer-preparation');
    await expect(form.getByText('Etapă 18', { exact: true })).toBeVisible();
    await form
      .getByLabel('Approved estimate version')
      .selectOption(firstSource);
    await form.getByLabel('Select this model version deliberately').check();
    await expect(
      form.getByLabel(
        'I confirm the approved amount is the net amount for this Offer version.',
      ),
    ).not.toBeChecked();
    await form
      .getByLabel(
        'I confirm the approved amount is the net amount for this Offer version.',
      )
      .check();
    await form.getByLabel('Declared tax amount (same currency)').fill(tax);
    await form.getByLabel('Declared tax label').fill('Taxă declarată DEMO');
    await form
      .getByLabel('Internal declaration basis')
      .fill(' Internal basis DEMO\n🌍 ');
    await form
      .getByLabel('Scope note')
      .fill(' Domeniu literal DEMO\n<script>literal()</script> ');
    return form;
  }
  let offer = await openCase();
  const preparation = await fillPreparation(offer, '25.00');
  await preparation.screenshot({
    path: testInfo.outputPath(`generated-offer-source-${suffix}.png`),
  });
  await preparation
    .getByRole('button', { name: 'Create non-official Offer' })
    .click();
  for (let i = 0; i < 2; i++) {
    await expect(
      preparation.getByRole('button', { name: 'Retry identical preparation' }),
    ).toBeVisible();
    await expect(
      preparation.getByLabel('Declared tax amount (same currency)'),
    ).toBeDisabled();
    await preparation
      .getByRole('button', { name: 'Retry identical preparation' })
      .click();
  }
  await expect(
    offer.getByRole('button', { name: 'Download exact Romanian HTML' }),
  ).toBeVisible();
  expect(attempts).toHaveLength(3);
  expect(attempts[0]).toEqual(attempts[1]);
  expect(attempts[1]).toEqual(attempts[2]);
  expect(firstHtml).toBeDefined();
  expect(firstSha).toBe(
    createHash('sha256')
      .update(firstHtml ?? '')
      .digest('hex'),
  );
  expect(firstHtml).not.toContain('Internal basis DEMO');
  expect(firstHtml).toContain('&lt;script&gt;literal()&lt;/script&gt;');
  const iframe = offer.frameLocator('iframe');
  await expect(iframe.locator('html')).toHaveAttribute('lang', 'ro');
  await expect(iframe.locator('tbody tr')).toHaveCount(18);
  await offer.getByRole('button', { name: 'Run Quality Checks' }).click();
  await expect(offer.locator('.offer-quality li')).toHaveCount(13);
  await offer.locator('.offer-representation').screenshot({
    path: testInfo.outputPath(`generated-offer-representation-${suffix}.png`),
  });
  currentIdentity = identities.reader;
  offer = await openCase();
  await expect(offer.locator('.model-offer-details')).toContainText(
    'Internal basis DEMO',
  );
  await expect(offer.locator('.profitability-version')).toHaveCount(0);
  for (const checkbox of await offer
    .locator('.offer-decision input[type=checkbox]')
    .all())
    await checkbox.check();
  await offer
    .getByRole('button', { name: 'Approve this version', exact: true })
    .click();
  await expect(
    offer.getByText('Version approved.', { exact: true }),
  ).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await offer
    .getByRole('button', { name: 'Download exact Romanian HTML' })
    .click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  if (!downloadPath)
    throw new Error('Missing downloaded exact representation.');
  expect(await readFile(downloadPath, 'utf8')).toBe(firstHtml);
  currentIdentity = identities.preparer;
  offer = await openCase();
  await offer
    .getByRole('button', { name: 'Record simulated transmission', exact: true })
    .click();
  await expect(offer.locator('.offer-transmission-evidence')).toContainText(
    firstSha ?? '',
  );
  const successor = await fillPreparation(offer, '9007199254740993.00');
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  const draftLanguage = page.getByRole('combobox', {
    name: /^(?:Interface language|Limba interfeței|Язык интерфейса|Langue de l’interface)$/u,
  });
  await selectOption(draftLanguage, { value: 'fr' });
  await expect(successor).toContainText(
    `${new Intl.NumberFormat('fr').format(9007199254741118n)},00 EUR`,
  );
  await selectOption(draftLanguage, { value: 'en' });
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
  await expect(
    successor.getByLabel('Declared tax amount (same currency)'),
  ).toHaveValue('9007199254740993.00');
  await expect(successor.getByLabel('Approved estimate version')).toHaveValue(
    firstSource,
  );
  await expect(
    successor.getByLabel('Select this model version deliberately'),
  ).toBeChecked();
  await expect(
    successor.getByLabel(
      'I confirm the approved amount is the net amount for this Offer version.',
    ),
  ).toBeChecked();
  await expect(successor.getByLabel('Internal declaration basis')).toHaveValue(
    ' Internal basis DEMO\n🌍 ',
  );
  await successor
    .getByRole('button', { name: 'Create non-official Offer' })
    .click();
  await expect(offer.locator('.model-offer-details')).toContainText(
    '125.00 EUR',
  );
  await expect(offer.locator('.model-offer-details')).toContainText(
    '9,007,199,254,740,993.00 EUR',
  );
  await expect(offer.locator('.model-offer-details')).toContainText(
    '9,007,199,254,741,118.00 EUR',
  );
  await offer
    .getByRole('button', { name: 'Open version 1', exact: true })
    .click();
  await expect(offer.getByText('Historical version · read only')).toBeVisible();
  await expect(offer.locator('iframe')).toHaveAttribute(
    'srcdoc',
    firstHtml ?? '',
  );
  await offer.locator('.offer-version-history').screenshot({
    path: testInfo.outputPath(`generated-offer-history-${suffix}.png`),
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  const language = page.getByRole('combobox', {
    name: /^(?:Interface language|Limba interfeței|Язык интерфейса|Langue de l’interface)$/u,
  });
  await selectOption(language, { value: 'fr' });
  await expect(offer.locator('iframe')).toHaveAttribute(
    'srcdoc',
    firstHtml ?? '',
  );
  await selectOption(language, { value: 'en' });
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
  let releaseSource: (() => void) | undefined;
  let retiredSource = false;
  await page.route(
    `**/api/opportunities/${opportunityId}/profitability-estimates/versions/${firstSource}`,
    async (route) => {
      const actual = await route.fetch();
      await new Promise<void>((resolve) => {
        releaseSource = resolve;
      });
      await route.fulfill({ response: actual }).catch(() => undefined);
      retiredSource = true;
    },
  );
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
  await expect(page.locator('.model-offer-details')).toHaveCount(0);
  releaseSource?.();
  await expect.poll(() => retiredSource).toBe(true);
  await expect(page.locator('.profitability-version')).toHaveCount(0);
  await expect(page.locator('.model-offer-details')).toHaveCount(0);
});
async function navigate(page: Page, name: string, narrow: boolean) {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name, exact: true })
    .click();
}
