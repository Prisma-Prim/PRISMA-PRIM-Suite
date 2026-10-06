import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type APIRequestContext } from '@playwright/test';
import { selectOption } from './select-option';
const api = 'http://127.0.0.1:4174/api';
const owner = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};
const preparer = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'local-demonstration-user',
  'x-test-display-name': 'Ada Ionescu',
  'x-test-email': 'ada@example.test',
};
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
test('creates and reopens the first Contract from a persisted Accepted Offer', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'Narrow' : 'Desktop';
  const name = 'Contract Company ' + suffix;
  const actor = object(
    await body(
      await request.get(api + '/access/current-actor', { headers: preparer }),
    ),
  );
  const membership = text(actor.workspaceMembershipId);
  const company = object(
    await command({
      request: request,
      path: '/companies',
      data: { displayName: name },
      key: 'c1-company-' + suffix,
      companyId: undefined,
      administrator: true,
    }),
  );
  const companyId = text(company.id);
  for (const route of [
    'company-context',
    'company-director-client',
    'company-commercial-intake',
    'company-service-catalogue',
    'company-pricing-configuration',
    'company-pricing-user',
    'company-offer-preparer',
    'company-offer-approver',
    'company-contract-preparer',
  ])
    await command({
      request: request,
      path: '/' + route + '-assignments',
      data: { workspaceMembershipId: membership, companyId },
      key: 'c1-grant-' + route + '-' + suffix,
      companyId: undefined,
      administrator: true,
    });
  const client = object(
    await command({
      request: request,
      path: '/clients',
      data: {
        displayName: 'Synthetic Contract Recipient ' + suffix,
        taxId: 'SYNTHETIC-C1-' + suffix.toUpperCase(),
        address: '1 Example Street',
      },
      key: 'c1-client-' + suffix,
      companyId: companyId,
    }),
  );
  const intake = object(
    await command({
      request: request,
      path: '/commercial-intake/requests',
      data: {
        originalText: 'Synthetic source for the Contract browser proof.',
        subject: 'Contract Request ' + suffix,
        clientAccountId: text(client.id),
        opportunity: {
          title: 'Prepare Contract ' + suffix,
          scope: 'Synthetic scope',
          nextAction: 'Prepare the first Contract',
        },
      },
      key: 'c1-request-' + suffix,
      companyId: companyId,
    }),
  );
  const opportunityId = text(object(intake.initialOpportunity).id);
  const effectiveFrom = new Date(
    Date.now() + initialOffset + 60000,
  ).toISOString();
  const rule = object(
    object(
      await command({
        request: request,
        path: '/pricing-configuration/rule-versions',
        data: {
          label: 'Synthetic C1 rule',
          effectiveFrom,
          expectedActiveVersionNumber: null,
        },
        key: 'c1-rule-' + suffix,
        companyId: companyId,
      }),
    ).version,
  );
  const definition = object(
    object(
      await command({
        request: request,
        path: '/commercial-catalogue/service-definitions',
        data: {
          code: 'C1-' + suffix.toUpperCase(),
          name: 'Illustrative Contract service',
          description: null,
        },
        key: 'c1-definition-' + suffix,
        companyId: companyId,
      }),
    ).definition,
  );
  const offering = object(
    object(
      await command({
        request: request,
        path: '/commercial-catalogue/offerings',
        data: {
          serviceDefinitionId: text(definition.id),
          commercialLabel: null,
        },
        key: 'c1-offering-' + suffix,
        companyId: companyId,
      }),
    ).offering,
  );
  const tariff = object(
    object(
      await command({
        request: request,
        path:
          '/pricing-configuration/offerings/' +
          text(offering.id) +
          '/tariff-versions',
        data: {
          unit: 'illustrative-unit',
          unitAmount: '300.0000',
          currency: 'EUR',
          taxRatePercent: '15.00',
          taxLabel: 'Illustrative tax',
          effectiveFrom,
          expectedActiveVersionNumber: null,
        },
        key: 'c1-tariff-' + suffix,
        companyId: companyId,
      }),
    ).version,
  );
  await writeFile(clockFile(), JSON.stringify(initialOffset + 120000));
  const snapshot = object(
    await command({
      request: request,
      path: '/pricing/opportunities/' + opportunityId + '/snapshots',
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
      key: 'c1-snapshot-' + suffix,
      companyId: companyId,
    }),
  );
  const offer = object(
    await command({
      request: request,
      path: '/offers/opportunities/' + opportunityId,
      data: {
        pricingSnapshotId: text(snapshot.id),
        recipient: { kind: 'PRIMARY' },
        scopeNote: 'Recorded accepted scope ' + suffix,
        commercialConditions: 'Recorded accepted conditions',
      },
      key: 'c1-offer-' + suffix,
      companyId: companyId,
    }),
  );
  const offerVersionId = text(object(offer.version).id);
  const versionPath =
    '/offers/opportunities/' + opportunityId + '/versions/' + offerVersionId;
  await command({
    request: request,
    path: versionPath + '/approve',
    data: { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
    key: 'c1-approve-' + suffix,
    companyId: companyId,
  });
  const transmitted = object(
    await command({
      request: request,
      path: versionPath + '/transmission',
      data: { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
      key: 'c1-transmit-' + suffix,
      companyId: companyId,
    }),
  );
  await command({
    request: request,
    path: versionPath + '/client-response',
    data: {
      expectedOfferRevision: 3,
      outcome: 'ACCEPTED',
      receivedAt: text(transmitted.transmittedAt),
    },
    key: 'c1-accept-' + suffix,
    companyId: companyId,
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?frame=classic#requests');
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(page.getByLabel('Active Company', { exact: true }), {
    label: name,
  });
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
  await page
    .getByRole('button')
    .filter({
      has: page.getByText('Contract Request ' + suffix, { exact: true }),
    })
    .click();
  const panel = page.getByRole('region', { name: 'Contract', exact: true });
  await expect(
    panel.getByRole('button', { name: 'Create Contract', exact: true }),
  ).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(
    (
      await request.delete(
        api +
          '/company-contract-preparer-assignments/' +
          membership +
          '/' +
          companyId,
        { headers: { ...owner, 'idempotency-key': 'c1-refuse-' + suffix } },
      )
    ).status(),
  ).toBe(200);
  const refused = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/contracts/opportunities/'),
  );
  await panel
    .getByRole('button', { name: 'Create Contract', exact: true })
    .click();
  expect((await refused).status()).toBe(403);
  await expect(panel).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath(
      'contract-creation-refused-' + suffix.toLowerCase() + '.png',
    ),
  });
  await command({
    request,
    path: '/company-contract-preparer-assignments',
    data: { workspaceMembershipId: membership, companyId },
    key: 'c1-regrant-' + suffix,
    administrator: true,
  });
  await page.reload();
  await page
    .getByRole('button')
    .filter({
      has: page.getByText('Contract Request ' + suffix, { exact: true }),
    })
    .click();
  await panel
    .getByLabel('Special conditions')
    .fill('Synthetic Contract special conditions');
  await panel.getByLabel('Term start').fill('2026-10-01');
  await panel.getByLabel('Term end').fill('2026-12-31');
  const attempts: Array<{ body: string | null; key: string | undefined }> = [];
  const routePattern = '**/api/contracts/opportunities/*';
  await page.route(routePattern, async (route) => {
    const sent = route.request();
    if (sent.method() !== 'POST') {
      await route.continue();
      return;
    }
    attempts.push({
      body: sent.postData(),
      key: sent.headers()['idempotency-key'],
    });
    if (attempts.length === 1) {
      // The real server commits; only its response is lost at the network boundary.
      expect((await route.fetch()).status()).toBe(201);
      await route.abort('failed');
    } else await route.continue();
  });
  await panel
    .getByRole('button', { name: 'Create Contract', exact: true })
    .click();
  await expect(
    panel.getByText(
      'The result is uncertain. Retry the same Contract command.',
    ),
  ).toBeVisible();
  await expect(panel.getByLabel('Special conditions')).toBeDisabled();
  await panel.screenshot({
    path: testInfo.outputPath(
      'contract-uncertain-' + suffix.toLowerCase() + '.png',
    ),
  });
  const creation = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes('/contracts/opportunities/'),
  );
  await panel
    .getByRole('button', {
      name: 'Retry the same Contract command',
      exact: true,
    })
    .click();
  expect((await creation).status()).toBe(201);
  expect(attempts).toHaveLength(2);
  expect(attempts[1]).toEqual(attempts[0]);
  expect(attempts[0]?.key).toBeTruthy();
  await page.unroute(routePattern);
  await expect(
    panel.getByText('Recorded accepted scope ' + suffix, { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText('Pending approval', { exact: false }),
  ).toBeVisible();
  await expect(panel.getByText('Source Offer', { exact: true })).toBeVisible();
  await expect(
    panel.getByText('Illustrative reference 1 · version 1', { exact: true }),
  ).toBeVisible();
  await panel.screenshot({
    path: testInfo.outputPath(
      'contract-created-' + suffix.toLowerCase() + '.png',
    ),
  });
  await page.reload();
  await page
    .getByRole('button')
    .filter({
      has: page.getByText('Contract Request ' + suffix, { exact: true }),
    })
    .click();
  await expect(
    panel.getByText('Synthetic Contract special conditions', { exact: true }),
  ).toBeVisible();
  await page.waitForLoadState('networkidle');
  for (const bundle of ['company-offer-preparer', 'company-offer-approver'])
    expect(
      (
        await request.delete(
          api + '/' + bundle + '-assignments/' + membership + '/' + companyId,
          {
            headers: {
              ...owner,
              'idempotency-key': 'c1-revoke-' + bundle + '-' + suffix,
            },
          },
        )
      ).status(),
    ).toBe(200);
  await page.reload();
  await page
    .getByRole('button')
    .filter({
      has: page.getByText('Contract Request ' + suffix, { exact: true }),
    })
    .click();
  await expect(
    panel.getByText('Recorded accepted scope ' + suffix, { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText('Illustrative reference 1 · version 1', { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole('button', { name: 'Create Contract', exact: true }),
  ).toHaveCount(0);
  const unavailableOffer = page.getByRole('region', {
    name: 'Illustrative Offer',
  });
  await expect(
    unavailableOffer.getByText(
      'Offer access is not available for this Opportunity.',
    ),
  ).toBeVisible();
  await expect(
    unavailableOffer.getByText('Recorded accepted scope ' + suffix, {
      exact: true,
    }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await panel.screenshot({
    path: testInfo.outputPath(
      'contract-reopened-' + suffix.toLowerCase() + '.png',
    ),
  });
  const stored = object(
    object(
      await body(
        await request.get(api + '/contracts/opportunities/' + opportunityId, {
          headers: { ...preparer, 'x-company-context-id': companyId },
        }),
      ),
    ).contract,
  );
  expect(stored.sourceOfferVersionId).toBe(offerVersionId);
  expect(object(stored.version).pricingSnapshotId).toBe(text(snapshot.id));
});
async function command({
  request,
  path,
  data,
  key,
  companyId,
  administrator = false,
}: {
  request: APIRequestContext;
  path: string;
  data: unknown;
  key: string;
  companyId?: string;
  administrator?: boolean;
}): Promise<unknown> {
  const response = await request.post(api + path, {
    headers: {
      ...(administrator ? owner : preparer),
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
