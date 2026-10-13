import { readFile, writeFile } from 'node:fs/promises';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { selectOption } from './select-option';

// Synthetic data only. Every Contract here is illustrative and provisional.
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
const CONTRACT_BUNDLES = [
  'company-contract-preparer',
  'company-contract-approver',
];

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

test('reads Contract events in the commercial Activity Log and opens each exact Contract Version', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(150_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'Narrow' : 'Desktop';
  const companyName = `Contract History Company ${suffix}`;
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
        key: `ca-company-${suffix}`,
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
    'company-offer-preparer',
    'company-offer-approver',
    ...CONTRACT_BUNDLES,
    'company-project',
    'company-commercial-activity-reader',
  ])
    await command(request, {
      path: `/${route}-assignments`,
      data: { workspaceMembershipId: membership, companyId },
      key: `ca-grant-${route}-${suffix}`,
      administrator: true,
    });
  const contract = await performContractSequence(request, companyId, suffix);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?frame=classic#activity');
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(page.getByLabel('Active Company', { exact: true }), {
    label: companyName,
  });
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();

  // The authorized reader sees every recorded Contract event of the sequence.
  const activity = page.locator('.activity-log');
  const row = (description: string, target: string) =>
    activity
      .locator('.activity-log-list > li')
      .filter({ hasText: `Ada Ionescu ${description}` })
      .filter({ hasText: `Target: ${target}` });
  const reference = `Illustrative Contract ${contract.illustrativeReference}`;
  // Version 2 now succeeds it, yet the Contract creation still concerns version 1.
  const createdContract = row(
    'created an illustrative agreement',
    `${reference} · version 1`,
  );
  const linkedProject = row(
    'linked a Project to an agreement',
    `${reference} · version 2 — Created Project: ${contract.projectTitle}`,
  );
  for (const expected of [
    createdContract,
    row('created an agreement version', `${reference} · version 1`),
    row('approved an agreement version', `${reference} · version 1`),
    row('created an agreement version', `${reference} · version 2`),
    row('approved an agreement version', `${reference} · version 2`),
    row(
      'recorded the signature of an agreement version',
      `${reference} · version 2 · Simulated`,
    ),
    linkedProject,
  ])
    await expect(expected).toHaveCount(1);
  await expect(activity).not.toContainText('Revised synthetic condition');
  await expect(activity).not.toContainText('Synthetic provider');
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(
      `contract-activity-log-${suffix.toLowerCase()}.png`,
    ),
    fullPage: true,
  });

  // The creation opens the Request detail with superseded version 1 selected.
  const mutations: string[] = [];
  page.on('request', (sent) => {
    const { pathname } = new URL(sent.url());
    if (pathname.startsWith('/api/') && sent.method() !== 'GET')
      mutations.push(`${sent.method()} ${pathname}`);
  });
  const contractPanel = page.getByRole('region', {
    name: 'Contract',
    exact: true,
  });
  let versionRead = contractRead(page, `/versions/${contract.v1}`);
  await createdContract
    .getByRole('button', { name: 'Open agreement version' })
    .click();
  expect((await versionRead).status()).toBe(200);
  await expect(page.locator('#requests')).toBeFocused();
  await expect(
    contractPanel.getByText(
      'Historical version — preserved; no further decision or signature.',
    ),
  ).toBeVisible();
  await expect(
    contractPanel.getByText(
      `Illustrative reference ${contract.illustrativeReference} · Version 1`,
      { exact: true },
    ),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(
      `contract-activity-superseded-version-${suffix.toLowerCase()}.png`,
    ),
    fullPage: true,
  });

  // The Project link opens the executed version it followed.
  await page.goto('/?frame=classic#activity');
  await expect(linkedProject).toHaveCount(1);
  versionRead = contractRead(page, `/versions/${contract.v2}`);
  await linkedProject
    .getByRole('button', { name: 'Open agreement version' })
    .click();
  expect((await versionRead).status()).toBe(200);
  await expect(
    contractPanel.getByText(
      `Illustrative reference ${contract.illustrativeReference} · Version 2`,
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    contractPanel.getByText(
      'Historical version — preserved; no further decision or signature.',
    ),
  ).toHaveCount(0);
  expect(mutations).toEqual([]);

  // A Contract reader who cannot read the linked Project loses only the link.
  await revoke(request, 'company-project', membership, companyId, suffix);
  await page.goto('/?frame=classic#activity');
  await page.reload();
  await expect(createdContract).toHaveCount(1);
  await expect(
    activity.getByText('Ada Ionescu linked a Project to an agreement'),
  ).toHaveCount(0);
  await expect(activity).not.toContainText(contract.projectTitle);

  // A reader without Contract read sees none of these events.
  for (const route of CONTRACT_BUNDLES)
    await revoke(request, route, membership, companyId, suffix);
  await page.reload();
  await expect(
    activity.getByText('Ada Ionescu captured a Client Request'),
  ).toBeVisible();
  await expect(activity).not.toContainText('Illustrative Contract');
  await expect(activity).not.toContainText('agreement');
  await expect(
    activity.getByRole('button', { name: 'Open agreement version' }),
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath(
      `contract-activity-denied-${suffix.toLowerCase()}.png`,
    ),
    fullPage: true,
  });
});

/**
 * An accepted Offer, then a Contract whose version 1 is approved and revised,
 * version 2 approved and signed, and a Project created from it.
 */
async function performContractSequence(
  request: APIRequestContext,
  companyId: string,
  suffix: string,
): Promise<{
  illustrativeReference: number;
  v1: string;
  v2: string;
  projectTitle: string;
}> {
  const client = object(
    await command(request, {
      path: '/clients',
      data: {
        displayName: `Synthetic Contract History Recipient ${suffix}`,
        taxId: `SYNTHETIC-CA-${suffix.toUpperCase()}`,
        address: '593 Example Street',
      },
      key: `ca-client-${suffix}`,
      companyId,
    }),
  );
  const intake = object(
    await command(request, {
      path: '/commercial-intake/requests',
      data: {
        originalText: 'Synthetic source for the Contract history proof.',
        subject: `Contract History Request ${suffix}`,
        clientAccountId: text(client.id),
        opportunity: {
          title: `Agree Contract history ${suffix}`,
          scope: 'Synthetic scope',
          nextAction: 'Prepare the Contract',
        },
      },
      key: `ca-request-${suffix}`,
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
          label: 'Synthetic Contract history rule',
          effectiveFrom,
          expectedActiveVersionNumber: null,
        },
        key: `ca-rule-${suffix}`,
        companyId,
      }),
    ).version,
  );
  const definition = object(
    object(
      await command(request, {
        path: '/commercial-catalogue/service-definitions',
        data: {
          code: `CA-${suffix.toUpperCase()}`,
          name: 'Illustrative Contract history service',
          description: null,
        },
        key: `ca-definition-${suffix}`,
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
        key: `ca-offering-${suffix}`,
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
        key: `ca-tariff-${suffix}`,
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
      key: `ca-snapshot-${suffix}`,
      companyId,
    }),
  );
  const step = (path: string, data: unknown, key: string) =>
    command(request, { path, data, key: `ca-${key}-${suffix}`, companyId });
  const offerPath = `/offers/opportunities/${opportunityId}`;
  const offer = object(
    await step(
      offerPath,
      {
        pricingSnapshotId: text(snapshot.id),
        recipient: { kind: 'PRIMARY' },
        scopeNote: 'Accepted scope',
        commercialConditions: 'Accepted conditions',
      },
      'offer',
    ),
  );
  const offerVersion = text(object(offer.version).id);
  await step(
    `${offerPath}/versions/${offerVersion}/approve`,
    { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
    'offer-approve',
  );
  const transmitted = object(
    await step(
      `${offerPath}/versions/${offerVersion}/transmission`,
      { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
      'offer-transmit',
    ),
  );
  await step(
    `${offerPath}/versions/${offerVersion}/client-response`,
    {
      expectedOfferRevision: 3,
      outcome: 'ACCEPTED',
      receivedAt: text(transmitted.transmittedAt),
    },
    'offer-accept',
  );
  const contractPath = `/contracts/opportunities/${opportunityId}`;
  const created = object(
    await step(
      contractPath,
      { acceptedOfferVersionId: offerVersion },
      'contract',
    ),
  );
  const v1 = text(object(created.version).id);
  await approve(step, `${contractPath}/versions/${v1}`, 1, 'approve-1');
  await step(
    `${contractPath}/versions`,
    {
      expectedContractRevision: 2,
      specialConditions: 'Revised synthetic condition',
    },
    'revise',
  );
  const head = object(
    object(
      await body(
        await request.get(api + contractPath, {
          headers: { ...reader, 'x-company-context-id': companyId },
        }),
      ),
    ).contract,
  );
  const v2 = text(object(head.version).id);
  await approve(step, `${contractPath}/versions/${v2}`, 3, 'approve-2');
  const approved = object(
    object(
      await body(
        await request.get(api + contractPath, {
          headers: { ...reader, 'x-company-context-id': companyId },
        }),
      ),
    ).contract,
  );
  const signingDate = text(
    object(object(approved.version).decision).decidedAt,
  ).slice(0, 10);
  await step(
    `${contractPath}/versions/${v2}/signature`,
    {
      expectedContractRevision: 4,
      providerSignatoryLabel: 'Synthetic provider',
      clientSignatoryLabel: 'Synthetic Client signatory',
      providerSignedOn: signingDate,
      clientSignedOn: signingDate,
      note: null,
      acknowledgedWarningCodes: [],
    },
    'sign',
  );
  const projectTitle = `Synthetic Contract Project ${suffix}`;
  await step(
    `${contractPath}/projects/create`,
    {
      title: projectTitle,
      acknowledgedCandidateProjectIds: [],
      expectedContractRevision: 5,
    },
    'project',
  );
  const illustrativeReference = created.illustrativeReference;
  if (typeof illustrativeReference !== 'number')
    throw new Error('Expected the illustrative reference');
  return { illustrativeReference, v1, v2, projectTitle };
}

/** Approves with exactly the current Quality Check warnings acknowledged. */
async function approve(
  step: (path: string, data: unknown, key: string) => Promise<unknown>,
  versionPath: string,
  expectedContractRevision: number,
  key: string,
) {
  const run = object(
    await step(`${versionPath}/quality-checks`, {}, `${key}-check`),
  );
  const results = run.results;
  if (!Array.isArray(results)) throw new Error('Expected check results');
  await step(
    `${versionPath}/approve`,
    {
      expectedContractRevision,
      acknowledgedWarningCodes: results
        .map(object)
        .filter((result) => result.status === 'WARNING')
        .map((result) => text(result.code))
        .sort(),
    },
    key,
  );
}

async function revoke(
  request: APIRequestContext,
  route: string,
  membership: string,
  companyId: string,
  suffix: string,
) {
  const response = await request.delete(
    `${api}/${route}-assignments/${membership}/${companyId}`,
    {
      headers: {
        ...owner,
        'idempotency-key': `ca-revoke-${route}-${suffix}`,
      },
    },
  );
  expect(response.status()).toBe(200);
}

function contractRead(page: Page, versionPath: string) {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname.startsWith(
        '/api/contracts/opportunities/',
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
