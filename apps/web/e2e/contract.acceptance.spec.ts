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
    .fill(
      'Synthetic Contract special conditions <script>globalThis.contractInjected = true</script>',
    );
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
    panel.getByText('Pending approval · Not executed', { exact: true }),
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
  const documentButton = panel.getByRole('button', {
    name: 'Open exact Contract document',
  });
  await documentButton.focus();
  await page.keyboard.press('Enter');
  const frame = panel.frameLocator(
    'iframe[title="Illustrative Contract document"]',
  );
  await expect(
    frame.getByRole('heading', { name: 'Illustrative Contract', exact: true }),
  ).toBeVisible();
  await expect(
    frame.getByText('clauses are placeholders', { exact: false }),
  ).toBeVisible();
  await expect(
    frame.getByText(
      'Synthetic Contract special conditions <script>globalThis.contractInjected = true</script>',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(frame.locator('script')).toHaveCount(0);
  const documentElement = panel.locator('iframe');
  const recordedHtml = await documentElement.getAttribute('srcdoc');
  const recordedChecksum = await panel
    .locator('.contract-representation code')
    .textContent();
  expect(recordedHtml).toBeTruthy();
  expect(recordedChecksum).toMatch(/^[a-f0-9]{64}$/u);
  expect(
    await frame
      .locator('html')
      .evaluate((element) => element.scrollWidth <= element.clientWidth),
  ).toBe(true);
  await documentElement.screenshot({
    path: testInfo.outputPath(
      'contract-document-' + suffix.toLowerCase() + '.png',
    ),
  });
  await frame.locator('footer').scrollIntoViewIfNeeded();
  await expect(frame.locator('footer')).toContainText(
    'CONTRACT_ILLUSTRATIVE v1 (unapproved)',
  );
  await expect(frame.locator('footer')).toContainText(
    'CL_SUBJECT v1, CL_PRICE v1, CL_TERM v1, CL_CONDITIONS v1, CL_GENERAL v1',
  );
  await expect(frame.locator('footer')).toContainText(text(snapshot.id));
  await documentElement.screenshot({
    path: testInfo.outputPath(
      'contract-document-footer-' + suffix.toLowerCase() + '.png',
    ),
  });
  await panel
    .getByRole('button', { name: 'Reload exact Contract document' })
    .click();
  await expect(documentElement).toHaveAttribute('srcdoc', recordedHtml ?? '');
  await expect(panel.locator('.contract-representation code')).toHaveText(
    recordedChecksum ?? '',
  );
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
  const checks = panel.getByRole('region', {
    name: 'Contract Quality Checks',
    exact: true,
  });
  await expect(
    checks.getByText('No Contract Quality Check run yet.'),
  ).toBeVisible();
  const versionId = text(object(stored.version).id);
  const qualityPath =
    '/contracts/opportunities/' +
    opportunityId +
    '/versions/' +
    versionId +
    '/quality-checks';
  const qualityAttempts: Array<{
    body: string | null;
    key: string | undefined;
  }> = [];
  await page.route('**/api' + qualityPath, async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    qualityAttempts.push({
      body: route.request().postData(),
      key: route.request().headers()['idempotency-key'],
    });
    if (qualityAttempts.length === 1) {
      expect((await route.fetch()).status()).toBe(201);
      await route.abort('failed');
    } else await route.continue();
  });
  await checks
    .getByRole('button', { name: 'Run Contract Quality Checks', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await checks
    .getByRole('button', {
      name: 'Retry the same Contract Quality Checks',
      exact: true,
    })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    checks.getByText('Contract checks completed with warnings.'),
  ).toBeVisible();
  expect(qualityAttempts[1]).toEqual(qualityAttempts[0]);
  const old = object(
    await body(
      await request.get(api + qualityPath, {
        headers: { ...preparer, 'x-company-context-id': companyId },
      }),
    ),
  );
  if (!Array.isArray(old.items)) throw new Error('Missing run history');
  const oldRun = object(old.items[0]);
  await checks.screenshot({
    path: testInfo.outputPath(
      'contract-quality-persisted-' + suffix.toLowerCase() + '.png',
    ),
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(
      'contract-quality-persisted-context-' + suffix.toLowerCase() + '.png',
    ),
  });
  const clientBeforeQualityCorrection = object(
    await body(
      await request.get(api + '/clients/' + text(client.id), {
        headers: { ...preparer, 'x-company-context-id': companyId },
      }),
    ),
  );
  const qualityCorrection = await request.patch(
    api + '/clients/' + text(client.id),
    {
      headers: {
        ...preparer,
        'x-company-context-id': companyId,
        'idempotency-key': 'c3-correct-' + suffix,
      },
      data: {
        expectedVersion: clientBeforeQualityCorrection.version,
        displayName: 'Corrected Contract Recipient ' + suffix,
        taxId: 'CORRECTED-C3-' + suffix.toUpperCase(),
        address: '2 Example Street',
      },
    },
  );
  expect(qualityCorrection.status()).toBe(200);
  await checks
    .getByRole('button', { name: 'Run Contract Quality Checks', exact: true })
    .click();
  await expect(checks.getByText('WARNING', { exact: true })).toHaveCount(2);
  const reopened = await body(
    await request.get(api + qualityPath + '/' + text(oldRun.id), {
      headers: { ...preparer, 'x-company-context-id': companyId },
    }),
  );
  expect(reopened).toEqual(oldRun);
  const latest = object(
    object(
      await body(
        await request.get(api + '/contracts/opportunities/' + opportunityId, {
          headers: { ...preparer, 'x-company-context-id': companyId },
        }),
      ),
    ).contract,
  );
  expect({ ...object(latest.version), latestQualityRun: null }).toEqual(
    stored.version,
  );
  await checks.getByRole('button', { name: 'Reopen recorded checks' }).click();
  await checks
    .getByRole('button', {
      name: 'Reopen run · ' + text(oldRun.evaluatedAt),
      exact: true,
    })
    .click();
  await expect(checks.getByText('WARNING', { exact: true })).toHaveCount(1);
  await expect(
    checks.getByText(text(oldRun.actorWorkspaceMembershipId), { exact: true }),
  ).toBeVisible();
  await checks.screenshot({
    path: testInfo.outputPath(
      'contract-quality-old-run-' + suffix.toLowerCase() + '.png',
    ),
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    fullPage: true,
    path: testInfo.outputPath(
      'contract-quality-old-run-context-' + suffix.toLowerCase() + '.png',
    ),
  });
  const currentClient = object(
    await body(
      await request.get(api + '/clients/' + text(client.id), {
        headers: { ...preparer, 'x-company-context-id': companyId },
      }),
    ),
  );
  const correction = await request.patch(api + '/clients/' + text(client.id), {
    headers: {
      ...preparer,
      'x-company-context-id': companyId,
      'idempotency-key': 'c2-client-correction-' + suffix,
    },
    data: {
      expectedVersion: currentClient.version,
      displayName: 'Later live Client ' + suffix,
    },
  });
  expect(correction.status()).toBe(200);
  await page.reload();
  await page
    .getByRole('button')
    .filter({
      has: page.getByText('Contract Request ' + suffix, { exact: true }),
    })
    .click();
  await expect(
    panel.getByText(
      'Synthetic Contract special conditions <script>globalThis.contractInjected = true</script>',
      { exact: true },
    ),
  ).toBeVisible();
  await panel
    .getByRole('button', { name: 'Open exact Contract document' })
    .click();
  await expect(documentElement).toHaveAttribute('srcdoc', recordedHtml ?? '');
  await expect(panel.locator('.contract-representation code')).toHaveText(
    recordedChecksum ?? '',
  );
  await page.waitForLoadState('networkidle');
  const rejectionIntake = object(
    await command({
      request,
      path: '/commercial-intake/requests',
      data: {
        originalText: 'Synthetic rejection source',
        subject: 'Rejection Request ' + suffix,
        clientAccountId: text(client.id),
        opportunity: {
          title: 'Reject Contract ' + suffix,
          nextAction: 'Decide exact Contract',
        },
      },
      key: 'c4-reject-intake-' + suffix,
      companyId,
    }),
  );
  const rejectionOpportunityId = text(
    object(rejectionIntake.initialOpportunity).id,
  );
  const rejectionSnapshot = object(
    await command({
      request,
      path: '/pricing/opportunities/' + rejectionOpportunityId + '/snapshots',
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
      key: 'c4-reject-snapshot-' + suffix,
      companyId,
    }),
  );
  const rejectionOffer = object(
    await command({
      request,
      path: '/offers/opportunities/' + rejectionOpportunityId,
      data: {
        pricingSnapshotId: text(rejectionSnapshot.id),
        recipient: { kind: 'PRIMARY' },
        scopeNote: 'Synthetic rejection scope',
        commercialConditions: 'Synthetic rejection conditions',
      },
      key: 'c4-reject-offer-' + suffix,
      companyId,
    }),
  );
  const rejectionOfferPath =
    '/offers/opportunities/' +
    rejectionOpportunityId +
    '/versions/' +
    text(object(rejectionOffer.version).id);
  // The live Client has changed since the first acceptance; this second Offer
  // captures the current identity and therefore starts without identity warnings.
  await command({
    request,
    path: rejectionOfferPath + '/approve',
    data: { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
    key: 'c4-reject-offer-approve-' + suffix,
    companyId,
  });
  const rejectionTransmission = object(
    await command({
      request,
      path: rejectionOfferPath + '/transmission',
      data: { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
      key: 'c4-reject-transmit-' + suffix,
      companyId,
    }),
  );
  await command({
    request,
    path: rejectionOfferPath + '/client-response',
    data: {
      expectedOfferRevision: 3,
      outcome: 'ACCEPTED',
      receivedAt: rejectionTransmission.transmittedAt,
    },
    key: 'c4-reject-accept-' + suffix,
    companyId,
  });
  const beforeIncompleteIdentity = object(
    await body(
      await request.get(api + '/clients/' + text(client.id), {
        headers: { ...preparer, 'x-company-context-id': companyId },
      }),
    ),
  );
  expect(
    (
      await request.patch(api + '/clients/' + text(client.id), {
        headers: {
          ...preparer,
          'x-company-context-id': companyId,
          'idempotency-key': 'c4-incomplete-party-' + suffix,
        },
        data: {
          expectedVersion: beforeIncompleteIdentity.version,
          taxId: null,
        },
      })
    ).status(),
  ).toBe(200);
  // C1 records the current available party without inventing a missing tax ID.
  // C3 therefore reports a real recorded-identity error on this second Contract.
  await command({
    request,
    path: '/contracts/opportunities/' + rejectionOpportunityId,
    data: {
      acceptedOfferVersionId: text(object(rejectionOffer.version).id),
      specialConditions: null,
      termStartsOn: null,
      termEndsOn: null,
    },
    key: 'c4-reject-contract-' + suffix,
    companyId,
  });
  for (const bundle of [
    'company-offer-preparer',
    'company-offer-approver',
    'company-pricing-user',
    'company-director-client',
  ])
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
  await panel
    .getByRole('button', { name: 'Open exact Contract document' })
    .click();
  await expect(documentElement).toHaveAttribute('srcdoc', recordedHtml ?? '');
  await expect(panel.locator('.contract-representation code')).toHaveText(
    recordedChecksum ?? '',
  );
  await expect(
    frame.getByText('Synthetic Contract Recipient ' + suffix, { exact: true }),
  ).toBeVisible();
  await documentElement.screenshot({
    path: testInfo.outputPath(
      'contract-document-reopened-' + suffix.toLowerCase() + '.png',
    ),
  });
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
  expect(
    (
      await request.delete(
        api +
          '/company-contract-preparer-assignments/' +
          membership +
          '/' +
          companyId,
        {
          headers: {
            ...owner,
            'idempotency-key': 'c2-reader-revoked-' + suffix,
          },
        },
      )
    ).status(),
  ).toBe(200);
  await panel
    .getByRole('button', { name: 'Reload exact Contract document' })
    .click();
  await expect(panel).toHaveCount(0);
  await expect(
    page.locator('iframe[title="Illustrative Contract document"]'),
  ).toHaveCount(0);
  await command({
    request,
    path: '/company-contract-approver-assignments',
    data: { workspaceMembershipId: membership, companyId },
    key: 'c4-real-approver-' + suffix,
    administrator: true,
  });
  await page.reload();
  await page
    .getByRole('button')
    .filter({
      has: page.getByText('Contract Request ' + suffix, { exact: true }),
    })
    .click();
  await expect(
    panel.getByRole('button', { name: 'Create Contract', exact: true }),
  ).toHaveCount(0);
  await checks
    .getByRole('button', { name: 'Run Contract Quality Checks', exact: true })
    .click();
  const decision = panel.getByRole('region', {
    name: 'Contract decision',
    exact: true,
  });
  const acknowledgementBoxes = decision.getByRole('checkbox');
  await expect(acknowledgementBoxes).toHaveCount(2);
  for (const box of await acknowledgementBoxes.all()) await box.check();
  const approvalPath =
    '/contracts/opportunities/' +
    opportunityId +
    '/versions/' +
    versionId +
    '/approve';
  const approvalAttempts: Array<{
    body: string | null;
    key: string | undefined;
  }> = [];
  await page.route('**/api' + approvalPath, async (route) => {
    approvalAttempts.push({
      body: route.request().postData(),
      key: route.request().headers()['idempotency-key'],
    });
    if (approvalAttempts.length === 1) {
      expect((await route.fetch()).status()).toBe(201);
      await route.abort('failed');
    } else await route.continue();
  });
  await decision
    .getByRole('button', {
      name: 'Approve exact Contract Version',
      exact: true,
    })
    .focus();
  await page.keyboard.press('Enter');
  await decision
    .getByRole('button', { name: 'Retry the same decision', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    decision.getByText('Approved internally', { exact: true }),
  ).toBeVisible();
  expect(approvalAttempts[1]).toEqual(approvalAttempts[0]);
  await page.unroute('**/api' + approvalPath);
  await expect(decision.locator('.contract-checksum')).toHaveText(
    recordedChecksum ?? '',
  );
  await panel
    .getByRole('button', { name: 'Open exact Contract document', exact: true })
    .click();
  await expect(documentElement).toHaveAttribute('srcdoc', recordedHtml ?? '');
  await decision.screenshot({
    path: testInfo.outputPath(
      'contract-approved-real-' + suffix.toLowerCase() + '.png',
    ),
  });
  await panel.screenshot({
    path: testInfo.outputPath(
      'contract-approved-context-real-' + suffix.toLowerCase() + '.png',
    ),
  });
  await page.reload();
  await page
    .getByRole('button')
    .filter({
      has: page.getByText('Contract Request ' + suffix, { exact: true }),
    })
    .click();
  await expect(decision.locator('.contract-checksum')).toHaveText(
    recordedChecksum ?? '',
  );
  await expect(
    decision.getByRole('button', { name: 'Approve exact Contract Version' }),
  ).toHaveCount(0);
  await page.reload();
  await page
    .getByRole('button')
    .filter({
      has: page.getByText('Rejection Request ' + suffix, { exact: true }),
    })
    .click();
  await checks
    .getByRole('button', { name: 'Run Contract Quality Checks', exact: true })
    .click();
  await expect(
    checks.getByText('Contract checks completed with errors.', { exact: true }),
  ).toBeVisible();
  const rejectionReason = 'Synthetic rejection despite current quality errors';
  await decision
    .getByRole('textbox', { name: 'Rejection reason', exact: true })
    .fill(rejectionReason);
  await decision
    .getByRole('button', { name: 'Reject exact Contract Version', exact: true })
    .click();
  await expect(
    decision.getByText('Rejected internally', { exact: true }),
  ).toBeVisible();
  await expect(
    decision.getByText(rejectionReason, { exact: true }),
  ).toBeVisible();
  await decision.screenshot({
    path: testInfo.outputPath(
      'contract-rejected-real-' + suffix.toLowerCase() + '.png',
    ),
  });
  await panel.screenshot({
    path: testInfo.outputPath(
      'contract-rejected-context-real-' + suffix.toLowerCase() + '.png',
    ),
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
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
