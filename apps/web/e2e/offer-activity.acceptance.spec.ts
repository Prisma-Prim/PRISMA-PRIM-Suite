import { readFile, writeFile } from 'node:fs/promises';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { selectOption } from './select-option';

// Synthetic data only. Every Offer here is illustrative and provisional.
const api = 'http://127.0.0.1:4174/api';
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
const OFFER_BUNDLES = ['company-offer-preparer', 'company-offer-approver'];

let initialOffset = 0;
function clockFile(): string {
  const path = process.env.ACCEPTANCE_CLOCK_OFFSET_FILE;
  if (!path) throw new Error('Missing synthetic acceptance clock');
  return path;
}
test.beforeEach(async () => {
  const value: unknown = JSON.parse(await readFile(clockFile(), 'utf8'));
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new Error('Invalid synthetic clock');
  initialOffset = value;
});
test.afterEach(async () => {
  await writeFile(clockFile(), JSON.stringify(initialOffset));
});

test('reads Offer events in the commercial Activity Log and opens each exact Offer Version', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'Narrow' : 'Desktop';
  const companyName = `Offer History Company ${suffix}`;
  const membership = text(
    object(
      await body(
        await request.get(`${api}/access/current-actor`, { headers: reader }),
      ),
    ).workspaceMembershipId,
  );
  const companyId = text(
    object(
      await command(request, {
        path: '/companies',
        data: { displayName: companyName },
        key: `oa-company-${suffix}`,
        administrator: true,
      }),
    ).id,
  );
  for (const route of [
    'company-context',
    'company-director-client',
    'company-commercial-intake',
    'company-service-catalogue',
    'company-pricing-configuration',
    'company-pricing-user',
    ...OFFER_BUNDLES,
    'company-commercial-activity-reader',
  ])
    await command(request, {
      path: `/${route}-assignments`,
      data: { workspaceMembershipId: membership, companyId },
      key: `oa-grant-${route}-${suffix}`,
      administrator: true,
    });
  const offer = await performOfferSequence(request, companyId, suffix);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?frame=classic#activity');
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(page.getByLabel('Active Company', { exact: true }), {
    label: companyName,
  });
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();

  // The authorized reader sees every recorded Offer event of the sequence.
  const activity = page.locator('.activity-log');
  const row = (description: string, target: string) =>
    activity
      .locator('.activity-log-list > li')
      .filter({ hasText: `Ada Ionescu ${description}` })
      .filter({ hasText: `Target: ${target}` });
  const reference = `Illustrative Offer ${offer.illustrativeReference}`;
  // Version 2 now succeeds it, yet the Offer creation still concerns version 1.
  const createdOffer = row(
    'created an illustrative Offer',
    `${reference} · version 1`,
  );
  const transmittedV1 = row(
    'recorded the transmission of an Offer Version',
    `${reference} · version 1 · Simulated`,
  );
  const acceptedV2 = row(
    'recorded the Client response to an Offer Version (Accepted)',
    `${reference} · version 2 · Simulated`,
  );
  for (const expected of [
    createdOffer,
    row('created an Offer Version', `${reference} · version 1`),
    row('approved an Offer Version', `${reference} · version 1`),
    transmittedV1,
    row('created an Offer Version', `${reference} · version 2`),
    row('approved an Offer Version', `${reference} · version 2`),
    row(
      'recorded the transmission of an Offer Version',
      `${reference} · version 2 · Simulated`,
    ),
    acceptedV2,
  ])
    await expect(expected).toHaveCount(1);
  await expect(activity).not.toContainText('Recorded scope note');
  await expect(activity).not.toContainText('Recorded conditions');
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(`offer-activity-log-${suffix.toLowerCase()}.png`),
    fullPage: true,
  });

  // The link opens the Request detail with the superseded version selected.
  const mutations: string[] = [];
  page.on('request', (sent) => {
    const { pathname } = new URL(sent.url());
    if (pathname.startsWith('/api/') && sent.method() !== 'GET')
      mutations.push(`${sent.method()} ${pathname}`);
  });
  const offerPanel = page.getByRole('region', {
    name: 'Illustrative Offer',
    exact: true,
  });
  let versionRead = offerRead(page, `/versions/${offer.v1}`);
  await transmittedV1
    .getByRole('button', { name: 'Open Offer Version' })
    .click();
  expect((await versionRead).status()).toBe(200);
  await expect(page.locator('#requests')).toBeFocused();
  await expect(
    offerPanel.getByText('Historical version · read only'),
  ).toBeVisible();
  await expect(
    offerPanel.getByRole('button', { name: 'Open version 1' }),
  ).toBeDisabled();
  await expect(
    offerPanel.getByRole('button', { name: 'Open version 2' }),
  ).toBeEnabled();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(
      `offer-activity-superseded-version-${suffix.toLowerCase()}.png`,
    ),
    fullPage: true,
  });

  // The response event opens the accepted current version. Changing only the
  // fragment keeps the loaded page.
  await page.goto('/?frame=classic#activity');
  await expect(acceptedV2).toHaveCount(1);
  versionRead = offerRead(page, `/versions/${offer.v2}`);
  await acceptedV2.getByRole('button', { name: 'Open Offer Version' }).click();
  expect((await versionRead).status()).toBe(200);
  await expect(offerPanel.getByText('Current version')).toBeVisible();
  await expect(
    offerPanel.getByRole('button', { name: 'Open version 2' }),
  ).toBeDisabled();

  // The Offer creation opens version 1, not the current head.
  await page.goto('/?frame=classic#activity');
  await expect(createdOffer).toHaveCount(1);
  versionRead = offerRead(page, `/versions/${offer.v1}`);
  await createdOffer
    .getByRole('button', { name: 'Open Offer Version' })
    .click();
  expect((await versionRead).status()).toBe(200);
  await expect(
    offerPanel.getByText('Historical version · read only'),
  ).toBeVisible();
  await expect(
    offerPanel.getByRole('button', { name: 'Open version 1' }),
  ).toBeDisabled();
  expect(mutations).toEqual([]);

  // A reader without Offer read sees none of these events.
  for (const route of OFFER_BUNDLES) {
    const response = await request.delete(
      `${api}/${route}-assignments/${membership}/${companyId}`,
      {
        headers: {
          ...owner,
          'idempotency-key': `oa-revoke-${route}-${suffix}`,
        },
      },
    );
    expect(response.status()).toBe(200);
  }
  await page.goto('/?frame=classic#activity');
  await page.reload();
  await expect(
    activity.getByText('Ada Ionescu captured a Client Request'),
  ).toBeVisible();
  await expect(activity).not.toContainText('Illustrative Offer');
  await expect(activity).not.toContainText('Offer Version');
  await expect(
    activity.getByRole('button', { name: /Open Offer/u }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath(
      `offer-activity-denied-${suffix.toLowerCase()}.png`,
    ),
    fullPage: true,
  });
});

/** Version 1 approved and transmitted, then a successor approved, transmitted and accepted. */
async function performOfferSequence(
  request: APIRequestContext,
  companyId: string,
  suffix: string,
): Promise<{ illustrativeReference: number; v1: string; v2: string }> {
  const client = object(
    await command(request, {
      path: '/clients',
      data: {
        displayName: `Synthetic Offer History Recipient ${suffix}`,
        taxId: `SYNTHETIC-OA-${suffix.toUpperCase()}`,
        address: '592 Example Street',
      },
      key: `oa-client-${suffix}`,
      companyId,
    }),
  );
  const intake = object(
    await command(request, {
      path: '/commercial-intake/requests',
      data: {
        originalText: 'Synthetic source for the Offer history proof.',
        subject: `Offer History Request ${suffix}`,
        clientAccountId: text(client.id),
        opportunity: {
          title: `Prepare Offer history ${suffix}`,
          scope: 'Synthetic scope',
          nextAction: 'Prepare the Offer',
        },
      },
      key: `oa-request-${suffix}`,
      companyId,
    }),
  );
  const opportunityId = text(object(intake.initialOpportunity).id);
  const effectiveFrom = new Date(
    Date.now() + initialOffset + 60_000,
  ).toISOString();
  const rule = object(
    object(
      await command(request, {
        path: '/pricing-configuration/rule-versions',
        data: {
          label: 'Synthetic Offer history rule',
          effectiveFrom,
          expectedActiveVersionNumber: null,
        },
        key: `oa-rule-${suffix}`,
        companyId,
      }),
    ).version,
  );
  const definition = object(
    object(
      await command(request, {
        path: '/commercial-catalogue/service-definitions',
        data: {
          code: `OA-${suffix.toUpperCase()}`,
          name: 'Illustrative Offer history service',
          description: null,
        },
        key: `oa-definition-${suffix}`,
        companyId,
      }),
    ).definition,
  );
  const offering = object(
    object(
      await command(request, {
        path: '/commercial-catalogue/offerings',
        data: {
          serviceDefinitionId: text(definition.id),
          commercialLabel: null,
        },
        key: `oa-offering-${suffix}`,
        companyId,
      }),
    ).offering,
  );
  const tariff = object(
    object(
      await command(request, {
        path: `/pricing-configuration/offerings/${text(offering.id)}/tariff-versions`,
        data: {
          unit: 'illustrative-unit',
          unitAmount: '300.0000',
          currency: 'EUR',
          taxRatePercent: '15.00',
          taxLabel: 'Illustrative tax',
          effectiveFrom,
          expectedActiveVersionNumber: null,
        },
        key: `oa-tariff-${suffix}`,
        companyId,
      }),
    ).version,
  );
  await writeFile(clockFile(), JSON.stringify(initialOffset + 120_000));
  const snapshot = object(
    await command(request, {
      path: `/pricing/opportunities/${opportunityId}/snapshots`,
      data: {
        pricingRuleVersionNumber: rule.versionNumber,
        lines: [
          {
            offeringId: text(offering.id),
            tariffVersionNumber: tariff.versionNumber,
            quantity: '1',
          },
        ],
      },
      key: `oa-snapshot-${suffix}`,
      companyId,
    }),
  );
  const offerPath = `/offers/opportunities/${opportunityId}`;
  const offer = object(
    await command(request, {
      path: offerPath,
      data: {
        pricingSnapshotId: text(snapshot.id),
        recipient: { kind: 'PRIMARY' },
        scopeNote: 'Recorded scope note',
        commercialConditions: 'Recorded conditions',
      },
      key: `oa-offer-${suffix}`,
      companyId,
    }),
  );
  const v1 = text(object(offer.version).id);
  const step = (path: string, data: unknown, key: string) =>
    command(request, { path, data, key: `oa-${key}-${suffix}`, companyId });
  await step(
    `${offerPath}/versions/${v1}/approve`,
    { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
    'approve-1',
  );
  await step(
    `${offerPath}/versions/${v1}/transmission`,
    { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
    'transmit-1',
  );
  const successor = object(
    await step(
      `${offerPath}/versions`,
      {
        expectedOfferRevision: 3,
        pricingSnapshotId: text(snapshot.id),
        recipient: { kind: 'PRIMARY' },
        commercialConditions: 'Revised conditions',
      },
      'successor',
    ),
  );
  const v2 = text(object(successor.version).id);
  await step(`${offerPath}/versions/${v2}/quality-checks`, {}, 'check-2');
  await step(
    `${offerPath}/versions/${v2}/approve`,
    { expectedOfferRevision: 4, acknowledgedWarningCodes: [] },
    'approve-2',
  );
  const transmitted = object(
    await step(
      `${offerPath}/versions/${v2}/transmission`,
      { expectedOfferRevision: 5, acknowledgedWarningCodes: [] },
      'transmit-2',
    ),
  );
  await step(
    `${offerPath}/versions/${v2}/client-response`,
    {
      expectedOfferRevision: 6,
      outcome: 'ACCEPTED',
      receivedAt: text(transmitted.transmittedAt),
    },
    'accept-2',
  );
  const illustrativeReference = offer.illustrativeReference;
  if (typeof illustrativeReference !== 'number')
    throw new Error('Expected the illustrative reference');
  return { illustrativeReference, v1, v2 };
}

function offerRead(page: Page, versionPath: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname.startsWith(
        '/api/offers/opportunities/',
      ) &&
      new URL(response.url()).pathname.endsWith(versionPath),
  );
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(
    dimensions.documentWidth,
    JSON.stringify(dimensions),
  ).toBeLessThanOrEqual(dimensions.viewportWidth);
}

async function command(
  request: APIRequestContext,
  {
    path,
    data,
    key,
    companyId,
    administrator = false,
  }: {
    path: string;
    data: unknown;
    key: string;
    companyId?: string;
    administrator?: boolean;
  },
): Promise<unknown> {
  const response = await request.post(api + path, {
    headers: {
      ...(administrator ? owner : reader),
      'idempotency-key': key,
      ...(companyId ? { 'x-company-context-id': companyId } : {}),
    },
    data,
  });
  const result = await body(response);
  expect(response.status(), JSON.stringify({ path, result })).toBe(201);
  return result;
}

async function body(response: {
  json: () => Promise<unknown>;
}): Promise<unknown> {
  return response.json();
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Expected object');
  return Object.fromEntries(Object.entries(value));
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected text');
  return value;
}
