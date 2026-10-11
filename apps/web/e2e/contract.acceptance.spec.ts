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
    'company-project',
    'company-project-approver',
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
  const projectTitle = 'Existing Contract Project ' + suffix;
  const existingProject = object(
    await command({
      request,
      path: '/projects',
      data: { title: projectTitle, clientAccountId: text(client.id) },
      key: 'cp1-existing-' + suffix,
      companyId,
    }),
  );
  const closingProject = object(
    await command({
      request,
      path: '/projects',
      data: {
        title: 'Closing Project ' + suffix,
        clientAccountId: text(client.id),
      },
      key: 'cp1-closing-' + suffix,
      companyId,
    }),
  );
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
    .getByRole('textbox', { name: 'Special conditions', exact: true })
    .fill(
      'Synthetic Contract special conditions <script>globalThis.contractInjected = true</script>',
    );
  await panel.getByLabel('Term start', { exact: true }).fill('2026-10-01');
  await panel.getByLabel('Term end', { exact: true }).fill('2026-12-31');
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
  await expect(
    panel.getByRole('textbox', { name: 'Special conditions', exact: true }),
  ).toBeDisabled();
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
    panel.getByRole('definition').filter({
      hasText:
        'Synthetic Contract special conditions <script>globalThis.contractInjected = true</script>',
    }),
  ).toBeVisible();
  await panel
    .getByRole('button', { name: 'Open exact Contract document' })
    .click();
  await expect(documentElement).toHaveAttribute('srcdoc', recordedHtml ?? '');
  await expect(panel.locator('.contract-representation code')).toHaveText(
    recordedChecksum ?? '',
  );
  await expect(
    frame.getByRole('heading', { name: 'Illustrative Contract', exact: true }),
  ).toBeVisible();
  await documentElement.scrollIntoViewIfNeeded();
  await expect(documentElement).toBeInViewport();
  await frame.locator('footer').scrollIntoViewIfNeeded();
  await expect(
    frame.locator('footer').getByText(text(snapshot.id), { exact: false }),
  ).toBeVisible();
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
  const signatures = panel.getByRole('region', {
    name: 'Simulated Contract signatures',
    exact: true,
  });
  const approvedRead = object(
    object(
      await body(
        await request.get(api + '/contracts/opportunities/' + opportunityId, {
          headers: { ...preparer, 'x-company-context-id': companyId },
        }),
      ),
    ).contract,
  );
  const signingDate = text(
    object(object(approvedRead.version).decision).decidedAt,
  ).slice(0, 10);
  const providerLabel = '  Synthetic provider É  ',
    clientLabel = 'Synthetic Client 🙂',
    signatureNote = 'Declared and unverified simulated evidence';
  await signatures.getByLabel('Provider signatory label').fill(providerLabel);
  await signatures.getByLabel('Client signatory label').fill(clientLabel);
  await signatures.getByLabel('Provider signing date').fill(signingDate);
  await signatures.getByLabel('Client signing date').fill(signingDate);
  await signatures.getByLabel('Signature note').fill(signatureNote);
  await expect(signatures.getByRole('checkbox')).toHaveCount(0);
  const signaturePath =
    '/contracts/opportunities/' +
    opportunityId +
    '/versions/' +
    versionId +
    '/signature';
  const signatureAttempts: Array<{
    body: string | null;
    key: string | undefined;
  }> = [];
  await page.route('**/api' + signaturePath, async (route) => {
    signatureAttempts.push({
      body: route.request().postData(),
      key: route.request().headers()['idempotency-key'],
    });
    if (signatureAttempts.length === 1) {
      expect((await route.fetch()).status()).toBe(201);
      await route.abort('failed');
    } else await route.continue();
  });
  await signatures
    .getByRole('button', { name: 'Record both simulated signatures' })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    signatures.getByText(
      'The signature outcome is uncertain. Retry sends the same fields, revision and key.',
    ),
  ).toBeVisible();
  await expect(
    signatures.getByLabel('Provider signatory label'),
  ).toBeDisabled();
  await expect(
    panel.getByRole('button', { name: 'Reload Contract', exact: true }),
  ).toBeDisabled();
  await signatures.screenshot({
    path: testInfo.outputPath(
      'contract-signature-uncertain-' + suffix.toLowerCase() + '.png',
    ),
  });
  await signatures
    .getByRole('button', { name: 'Retry the same simulated signature' })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    signatures.getByText('Executed — simulated evidence only', { exact: true }),
  ).toBeVisible();
  expect(signatureAttempts).toHaveLength(2);
  expect(signatureAttempts[1]).toEqual(signatureAttempts[0]);
  expect(signatureAttempts[0]?.key).toBeTruthy();
  const displayedSigningDate = new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(signingDate));
  const declaredDates = signatures.locator(
    'time[datetime="' + signingDate + '"]',
  );
  await expect(declaredDates).toHaveCount(2);
  for (const declaredDate of await declaredDates.all())
    await expect(declaredDate).toHaveText(displayedSigningDate);
  await page.unroute('**/api' + signaturePath);
  await expect(signatures.locator('.contract-checksum')).toHaveText(
    recordedChecksum ?? '',
  );
  await expect(
    signatures.getByText(clientLabel, { exact: true }),
  ).toBeVisible();
  await expect(
    signatures.getByText(signatureNote, { exact: true }),
  ).toBeVisible();
  await signatures.screenshot({
    path: testInfo.outputPath(
      'contract-signature-recorded-' + suffix.toLowerCase() + '.png',
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
    signatures.getByText('Executed — simulated evidence only', { exact: true }),
  ).toBeVisible();
  await expect(
    signatures.getByRole('button', {
      name: 'Record both simulated signatures',
    }),
  ).toHaveCount(0);
  await expect(declaredDates).toHaveCount(2);
  for (const declaredDate of await declaredDates.all())
    await expect(declaredDate).toHaveText(displayedSigningDate);
  await panel
    .getByRole('button', { name: 'Open exact Contract document', exact: true })
    .click();
  await expect(documentElement).toHaveAttribute('srcdoc', recordedHtml ?? '');
  await expect(panel.locator('.contract-representation code')).toHaveText(
    recordedChecksum ?? '',
  );
  const executedRead = object(
    object(
      await body(
        await request.get(api + '/contracts/opportunities/' + opportunityId, {
          headers: { ...preparer, 'x-company-context-id': companyId },
        }),
      ),
    ).contract,
  );
  expect(executedRead.revision).toBe(3);
  expect(object(object(executedRead.version).signature)).toMatchObject({
    providerSignatoryLabel: providerLabel,
    clientSignatoryLabel: clientLabel,
    providerSignedOn: signingDate,
    clientSignedOn: signingDate,
    note: signatureNote,
    evidenceKind: 'SIMULATED',
    provenance: 'ILLUSTRATIVE',
  });
  expect(object(executedRead.version).decision).toEqual(
    object(approvedRead.version).decision,
  );
  await signatures.screenshot({
    path: testInfo.outputPath(
      'contract-signature-reopened-' + suffix.toLowerCase() + '.png',
    ),
  });
  await panel.screenshot({
    path: testInfo.outputPath(
      'contract-signature-context-' + suffix.toLowerCase() + '.png',
    ),
  });
  // C2–C5 proved independent reads after these grants were revoked.
  // CP1 explicitly restores its separate preparer and Project/Client prerequisites.
  for (const route of ['company-contract-preparer', 'company-director-client'])
    await command({
      request,
      path: '/' + route + '-assignments',
      data: { workspaceMembershipId: membership, companyId },
      key: 'cp1-restore-' + route + '-' + suffix,
      administrator: true,
    });
  await page.goto('/#requests');
  await page
    .getByRole('button')
    .filter({
      has: page.getByText('Contract Request ' + suffix, { exact: true }),
    })
    .click();
  const projectsPanel = panel.getByRole('region', {
    name: 'Contract Projects',
    exact: true,
  });
  const projectId = text(existingProject.id);
  const beforeLinkProject = await body(
    await request.get(api + '/projects/' + projectId, {
      headers: { ...preparer, 'x-company-context-id': companyId },
    }),
  );
  const selectedProject = projectsPanel.getByRole('radio', {
    name: new RegExp(projectTitle),
  });
  await expect(selectedProject).toBeEnabled();
  await selectedProject.focus();
  await page.keyboard.press('Space');
  await expect(selectedProject).toBeChecked();
  await projectsPanel.screenshot({
    path: testInfo.outputPath(
      'contract-project-candidates-' + suffix.toLowerCase() + '.png',
    ),
  });
  const projectLinkPath =
    '/contracts/opportunities/' + opportunityId + '/projects';
  const linkAttempts: Array<{ body: string | null; key: string | undefined }> =
    [];
  await page.route('**/api' + projectLinkPath, async (route) => {
    linkAttempts.push({
      body: route.request().postData(),
      key: route.request().headers()['idempotency-key'],
    });
    if (linkAttempts.length === 1) {
      await route.fetch();
      await route.abort();
    } else await route.continue();
  });
  await projectsPanel
    .getByRole('button', { name: 'Link selected Project' })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    projectsPanel.getByText(
      'The link outcome is uncertain. Retry sends the same Project, revision and key.',
    ),
  ).toBeVisible();
  await expect(selectedProject).toBeDisabled();
  await projectsPanel.screenshot({
    path: testInfo.outputPath(
      'contract-project-uncertain-' + suffix.toLowerCase() + '.png',
    ),
  });
  await projectsPanel
    .getByRole('button', { name: 'Retry the same Project link' })
    .click();
  await expect(
    projectsPanel.getByText('Project linked.', { exact: true }),
  ).toBeVisible();
  expect(linkAttempts).toHaveLength(2);
  expect(linkAttempts[1]).toEqual(linkAttempts[0]);
  expect(linkAttempts[0]?.key).toBeTruthy();
  await page.unroute('**/api' + projectLinkPath);
  const linkedRead = object(
    object(
      await body(
        await request.get(api + '/contracts/opportunities/' + opportunityId, {
          headers: { ...preparer, 'x-company-context-id': companyId },
        }),
      ),
    ).contract,
  );
  expect(linkedRead.revision).toBe(4);
  expect(linkedRead.version).toEqual(executedRead.version);
  expect(
    await body(
      await request.get(api + '/projects/' + projectId, {
        headers: { ...preparer, 'x-company-context-id': companyId },
      }),
    ),
  ).toEqual(beforeLinkProject);
  await projectsPanel.screenshot({
    path: testInfo.outputPath(
      'contract-project-linked-' + suffix.toLowerCase() + '.png',
    ),
  });
  await projectsPanel
    .getByRole('button', { name: 'Open Project', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('heading', { name: projectTitle, exact: true }),
  ).toBeVisible();
  const linkedContracts = page.getByRole('region', {
    name: 'Linked Contracts',
    exact: true,
  });
  await expect(
    linkedContracts.getByText('Illustrative Contract 1', { exact: true }),
  ).toBeVisible();
  await linkedContracts.screenshot({
    path: testInfo.outputPath(
      'project-contract-reopened-' + suffix.toLowerCase() + '.png',
    ),
  });
  await page.screenshot({
    path: testInfo.outputPath(
      'project-contract-context-' + suffix.toLowerCase() + '.png',
    ),
  });
  await linkedContracts
    .getByRole('button', { name: 'Open Contract', exact: true })
    .click();
  await expect(
    projectsPanel.getByRole('radio', { name: new RegExp(projectTitle) }),
  ).toBeDisabled();
  await expect(
    signatures.getByText('Executed — simulated evidence only', { exact: true }),
  ).toBeVisible();
  await panel
    .getByRole('button', { name: 'Open exact Contract document', exact: true })
    .click();
  await expect(documentElement).toHaveAttribute('srcdoc', recordedHtml ?? '');
  await projectsPanel.screenshot({
    path: testInfo.outputPath(
      'contract-project-reopened-' + suffix.toLowerCase() + '.png',
    ),
  });
  await projectsPanel
    .getByRole('radio', { name: new RegExp('Closing Project ' + suffix) })
    .check();
  const closure = await request.post(
    api + '/projects/' + text(closingProject.id) + '/lifecycle-transitions',
    {
      headers: {
        ...preparer,
        'x-company-context-id': companyId,
        'idempotency-key': 'cp1-close-after-selection-' + suffix,
      },
      data: {
        action: 'cancel',
        expectedLifecycleRevision: 0,
        reason: 'Synthetic closure after Project selection.',
      },
    },
  );
  expect(closure.status()).toBe(200);
  await projectsPanel
    .getByRole('button', { name: 'Link selected Project' })
    .click();
  await expect(
    projectsPanel.getByText(
      'This Project is no longer eligible. Reload the candidates.',
      { exact: true },
    ),
  ).toBeVisible();
  await projectsPanel.screenshot({
    path: testInfo.outputPath(
      'contract-project-no-longer-eligible-' + suffix.toLowerCase() + '.png',
    ),
  });
  await page.reload();
  await page
    .getByRole('button')
    .filter({
      has: page.getByText('Contract Request ' + suffix, { exact: true }),
    })
    .click();
  const projectCreationPanel = projectsPanel.getByRole('region', {
    name: 'Create a preparatory Project',
    exact: true,
  });
  const creationTitle = projectCreationPanel.getByRole('textbox', {
    name: 'New Project title',
  });
  await expect(creationTitle).toHaveValue('Prepare Contract ' + suffix);
  const chosenTitle = 'Created from Contract ' + suffix;
  await creationTitle.fill(chosenTitle);
  const acknowledgement = projectCreationPanel.getByRole('checkbox');
  await acknowledgement.focus();
  await page.keyboard.press('Space');
  const intervening = object(
    await command({
      request,
      path: '/projects',
      companyId,
      data: {
        title: 'Intervening Project ' + suffix,
        clientAccountId: text(client.id),
      },
      key: 'cp2-intervening-' + suffix,
    }),
  );
  await projectCreationPanel
    .getByRole('button', { name: 'Create and link Project', exact: true })
    .click();
  await expect(
    projectCreationPanel.getByText(
      'The candidates changed. Review the refreshed list and confirm again.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    projectsPanel.getByRole('radio', {
      name: new RegExp('Intervening Project ' + suffix),
    }),
  ).toBeVisible();
  await expect(creationTitle).toHaveValue(chosenTitle);
  await expect(acknowledgement).not.toBeChecked();
  await projectsPanel.screenshot({
    path: testInfo.outputPath(
      'contract-create-candidates-changed-' + suffix.toLowerCase() + '.png',
    ),
  });
  await acknowledgement.check();
  const creationPath = projectLinkPath + '/create',
    createAttempts: Array<{ body: string | null; key: string | undefined }> =
      [];
  await page.route('**/api' + creationPath, async (route) => {
    createAttempts.push({
      body: route.request().postData(),
      key: route.request().headers()['idempotency-key'],
    });
    if (createAttempts.length === 1) {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      await route.abort();
    } else await route.continue();
  });
  await projectCreationPanel
    .getByRole('button', { name: 'Create and link Project', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    projectCreationPanel.getByRole('button', {
      name: 'Retry the same Project creation',
      exact: true,
    }),
  ).toBeVisible();
  await expect(creationTitle).toBeDisabled();
  await expect(acknowledgement).toBeDisabled();
  await projectsPanel.screenshot({
    path: testInfo.outputPath(
      'contract-create-uncertain-' + suffix.toLowerCase() + '.png',
    ),
  });
  await projectCreationPanel
    .getByRole('button', {
      name: 'Retry the same Project creation',
      exact: true,
    })
    .click();
  await expect(
    projectCreationPanel.getByText('Preparatory Project created and linked.', {
      exact: true,
    }),
  ).toBeVisible();
  expect(createAttempts).toHaveLength(2);
  expect(createAttempts[1]).toEqual(createAttempts[0]);
  expect(createAttempts[0]?.key).toBeTruthy();
  await page.unroute('**/api' + creationPath);
  const cp2Read = object(
    object(
      await body(
        await request.get(api + '/contracts/opportunities/' + opportunityId, {
          headers: { ...preparer, 'x-company-context-id': companyId },
        }),
      ),
    ).contract,
  );
  expect(cp2Read.revision).toBe(5);
  expect(cp2Read.version).toEqual(executedRead.version);
  const linkedProjects = cp2Read.linkedProjects;
  if (!Array.isArray(linkedProjects))
    throw new Error('Missing linked Projects');
  expect(linkedProjects).toHaveLength(2);
  const createdProjects = linkedProjects
    .map(object)
    .filter((project) => project.title === chosenTitle);
  expect(createdProjects).toHaveLength(1);
  const createdProject = createdProjects[0];
  if (!createdProject) throw new Error('Missing created Project');
  expect(createdProject.status).toBe('preparatory');
  expect(object(createdProject.link).created).toBe(true);
  expect(text(createdProject.id)).not.toBe(text(intervening.id));
  const createdLink = projectsPanel
    .getByRole('listitem')
    .filter({ hasText: chosenTitle });
  await projectsPanel.screenshot({
    path: testInfo.outputPath(
      'contract-create-linked-' + suffix.toLowerCase() + '.png',
    ),
  });
  await createdLink
    .getByRole('button', { name: 'Open Project', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: chosenTitle, exact: true }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('article', { name: chosenTitle, exact: true })
      .getByText(
        'Preparation only. This record does not authorize work to start.',
        { exact: true },
      ),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(
      'contract-created-project-reopened-' + suffix.toLowerCase() + '.png',
    ),
  });
  await linkedContracts
    .getByRole('button', { name: 'Open Contract', exact: true })
    .click();
  await expect(
    projectsPanel.getByRole('radio', { name: new RegExp(chosenTitle) }),
  ).toBeDisabled();
  await panel
    .getByRole('button', { name: 'Open exact Contract document', exact: true })
    .click();
  await expect(documentElement).toHaveAttribute('srcdoc', recordedHtml ?? '');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await projectsPanel.screenshot({
    path: testInfo.outputPath(
      'contract-create-reopened-' + suffix.toLowerCase() + '.png',
    ),
  });
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
  const c6Base = '/contracts/opportunities/' + rejectionOpportunityId;
  const readC6 = async () =>
    object(
      object(
        await body(
          await request.get(api + c6Base, {
            headers: { ...preparer, 'x-company-context-id': companyId },
          }),
        ),
      ).contract,
    );
  const predecessor = await readC6();
  const predecessorVersion = object(predecessor.version);
  const c6CurrentClient = object(
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
          'idempotency-key': 'c6-client-' + suffix,
        },
        data: {
          expectedVersion: c6CurrentClient.version,
          taxId: 'SYNTHETIC-C6-' + suffix,
        },
      })
    ).status(),
  ).toBe(200);
  const c6VersionPath = c6Base + '/versions';
  const versionAttempts: Array<{
    body: string | null;
    key: string | undefined;
  }> = [];
  await page.route('**/api' + c6VersionPath, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    versionAttempts.push({
      body: route.request().postData(),
      key: route.request().headers()['idempotency-key'],
    });
    if (versionAttempts.length === 1) {
      expect((await route.fetch()).status()).toBe(201);
      await route.abort('failed');
    } else await route.continue();
  });
  const revisions = panel.getByRole('region', {
    name: 'Revise Contract before signature',
    exact: true,
  });
  await revisions.getByLabel('Revised term start').fill('2026-10-01');
  await revisions.getByLabel('Revised term end').fill('2026-12-31');
  await revisions
    .getByLabel('Revised special conditions')
    .fill('  C6 revised synthetic conditions  ');
  await revisions
    .getByRole('button', { name: 'Create new Contract Version', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    revisions.getByText(
      'The revision result is uncertain. Retry the identical version command.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    revisions.getByLabel('Revised special conditions'),
  ).toBeDisabled();
  await revisions.screenshot({
    path: testInfo.outputPath('c6-uncertain-' + suffix.toLowerCase() + '.png'),
  });
  await revisions
    .getByRole('button', {
      name: 'Retry identical version command',
      exact: true,
    })
    .focus();
  await page.keyboard.press('Enter');
  const history = panel.getByRole('region', {
    name: 'Contract Version history',
    exact: true,
  });
  await expect(
    history.getByRole('button', {
      name: 'Open Contract Version 2',
      exact: true,
    }),
  ).toBeDisabled();
  expect(versionAttempts).toHaveLength(2);
  expect(versionAttempts[1]).toEqual(versionAttempts[0]);
  await page.unroute('**/api' + c6VersionPath);
  await expect(revisions.getByLabel('Revised special conditions')).toHaveValue(
    '  C6 revised synthetic conditions  ',
  );
  const differences = history.getByRole('region', {
    name: 'Changes from the preceding version',
    exact: true,
  });
  await expect(
    differences.getByText('Recorded tax identifier', { exact: true }),
  ).toBeVisible();
  await expect(
    differences.getByText('Term start', { exact: true }),
  ).toBeVisible();
  await expect(
    checks.getByText('No Contract Quality Check run yet.', { exact: true }),
  ).toBeVisible();
  await history
    .getByRole('button', { name: 'Open Contract Version 1', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    decision.getByText(rejectionReason, { exact: true }),
  ).toBeVisible();
  await expect(revisions).toHaveCount(0);
  await panel
    .getByRole('button', { name: 'Open exact Contract document', exact: true })
    .click();
  await expect(documentElement).toHaveAttribute(
    'srcdoc',
    text(object(predecessorVersion.representation).html),
  );
  const c6Old = object(
    object(
      await body(
        await request.get(
          api + c6VersionPath + '/' + text(predecessorVersion.id),
          { headers: { ...preparer, 'x-company-context-id': companyId } },
        ),
      ),
    ).contract,
  );
  expect(object(c6Old.version).representation).toEqual(
    predecessorVersion.representation,
  );
  expect(object(c6Old.version).decision).toEqual(predecessorVersion.decision);
  await history
    .getByRole('button', { name: 'Open Contract Version 2', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await checks
    .getByRole('button', { name: 'Run Contract Quality Checks', exact: true })
    .click();
  await expect(decision.getByRole('checkbox')).toHaveCount(2);
  for (const box of await decision.getByRole('checkbox').all())
    await box.check();
  await decision
    .getByRole('button', {
      name: 'Approve exact Contract Version',
      exact: true,
    })
    .click();
  await expect(
    decision.getByText('Approved internally', { exact: true }),
  ).toBeVisible();
  const approvedSecond = await readC6();
  await panel.screenshot({
    path: testInfo.outputPath(
      'c6-approved-differences-' + suffix.toLowerCase() + '.png',
    ),
  });
  // Approval does not freeze an unexecuted head: the next version must start fresh again.
  await revisions
    .getByLabel('Revised special conditions')
    .fill('C6 third version requires its own approval');
  await revisions
    .getByRole('button', { name: 'Create new Contract Version', exact: true })
    .click();
  await expect(
    history.getByRole('button', {
      name: 'Open Contract Version 3',
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    checks.getByText('No Contract Quality Check run yet.', { exact: true }),
  ).toBeVisible();
  await history
    .getByRole('button', { name: 'Open Contract Version 2', exact: true })
    .click();
  await expect(
    decision.getByText('Approved internally', { exact: true }),
  ).toBeVisible();
  await panel
    .getByRole('button', { name: 'Open exact Contract document', exact: true })
    .click();
  await expect(documentElement).toHaveAttribute(
    'srcdoc',
    text(object(object(approvedSecond.version).representation).html),
  );
  await history
    .getByRole('button', { name: 'Open Contract Version 3', exact: true })
    .click();
  await checks
    .getByRole('button', { name: 'Run Contract Quality Checks', exact: true })
    .click();
  await expect(decision.getByRole('checkbox')).toHaveCount(2);
  for (const box of await decision.getByRole('checkbox').all())
    await box.check();
  await decision
    .getByRole('button', {
      name: 'Approve exact Contract Version',
      exact: true,
    })
    .click();
  await expect(
    decision.getByText('Approved internally', { exact: true }),
  ).toBeVisible();
  const third = await readC6();
  const signedOn = text(object(object(third.version).decision).decidedAt).slice(
    0,
    10,
  );
  await signatures
    .getByLabel('Provider signatory label')
    .fill('Synthetic C6 provider');
  await signatures
    .getByLabel('Client signatory label')
    .fill('Synthetic C6 Client');
  await signatures.getByLabel('Provider signing date').fill(signedOn);
  await signatures.getByLabel('Client signing date').fill(signedOn);
  await signatures
    .getByRole('button', {
      name: 'Record both simulated signatures',
      exact: true,
    })
    .click();
  await expect(
    signatures.getByText('Executed — simulated evidence only', { exact: true }),
  ).toBeVisible();
  await expect(revisions).toHaveCount(0);
  const executedThird = await readC6();
  const c6Refused = await request.post(api + c6VersionPath, {
    headers: {
      ...preparer,
      'x-company-context-id': companyId,
      'idempotency-key': 'c6-executed-' + suffix,
    },
    data: { expectedContractRevision: executedThird.revision },
  });
  expect(c6Refused.status()).toBe(409);
  expect(await body(c6Refused)).toMatchObject({ code: 'CONTRACT_EXECUTED' });
  await page.reload();
  await page
    .getByRole('button')
    .filter({
      has: page.getByText('Rejection Request ' + suffix, { exact: true }),
    })
    .click();
  await expect(
    history.getByRole('button', {
      name: 'Open Contract Version 3',
      exact: true,
    }),
  ).toBeDisabled();
  await expect(revisions).toHaveCount(0);
  await panel.screenshot({
    path: testInfo.outputPath(
      'c6-executed-reopened-' + suffix.toLowerCase() + '.png',
    ),
  });
  // C8 uses the executed main agreement with both CP1/CP2 links.
  await command({
    request,
    path: '/company-pricing-user-assignments',
    data: { workspaceMembershipId: membership, companyId },
    key: 'c8-pricing-grant-' + suffix,
    administrator: true,
  });
  const parentPath = '/contracts/opportunities/' + opportunityId;
  const readParent = async () =>
    object(
      object(
        await body(
          await request.get(api + parentPath, {
            headers: { ...preparer, 'x-company-context-id': companyId },
          }),
        ),
      ).contract,
    );
  const parentBefore = await readParent();
  await page.reload();
  await page
    .getByRole('button')
    .filter({
      has: page.getByText('Contract Request ' + suffix, { exact: true }),
    })
    .click();
  const addendumAttempts: Array<{
    body: string | null;
    key: string | undefined;
  }> = [];
  const addendumPath =
    parentPath + '/agreements/' + text(parentBefore.id) + '/addenda';
  await page.route('**/api' + addendumPath, async (route) => {
    addendumAttempts.push({
      body: route.request().postData(),
      key: route.request().headers()['idempotency-key'],
    });
    if (addendumAttempts.length === 1) {
      expect((await route.fetch()).status()).toBe(201);
      await route.abort('failed');
    } else await route.continue();
  });
  await panel
    .getByRole('textbox', { name: 'Change summary', exact: true })
    .fill('  C8 first exact change ' + suffix + '  ');
  await panel
    .getByRole('button', { name: 'Create Addendum', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    panel.getByText(
      'The Addendum result is uncertain. Retry the identical command.',
    ),
  ).toBeVisible();
  await expect(
    panel.getByRole('textbox', { name: 'Change summary', exact: true }),
  ).toBeDisabled();
  await panel
    .getByRole('button', {
      name: 'Retry identical Addendum command',
      exact: true,
    })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    panel.getByRole('button', {
      name: 'Return to parent agreement',
      exact: true,
    }),
  ).toBeVisible();
  expect(addendumAttempts).toHaveLength(2);
  expect(addendumAttempts[1]).toEqual(addendumAttempts[0]);
  await page.unroute('**/api' + addendumPath);
  await expect(
    panel
      .getByRole('paragraph')
      .filter({ hasText: /^No Pricing Snapshot referenced\.$/ }),
  ).toBeVisible();
  await expect(
    panel.getByRole('region', { name: 'Contract Projects', exact: true }),
  ).toHaveCount(0);
  await expect(panel.getByText(chosenTitle, { exact: true })).toBeVisible();
  await panel
    .getByRole('button', { name: 'Return to parent agreement', exact: true })
    .click();
  await panel
    .getByRole('textbox', { name: 'Change summary', exact: true })
    .fill('C8 second priced change ' + suffix);
  await Promise.all([
    page.waitForResponse((response) =>
      response
        .url()
        .includes(
          '/pricing/opportunities/' + opportunityId + '/snapshots?limit=25',
        ),
    ),
    panel
      .getByRole('button', { name: 'Choose a Pricing Snapshot', exact: true })
      .click(),
  ]);
  await selectOption(panel.getByRole('combobox'), { value: text(snapshot.id) });
  await panel
    .getByRole('button', { name: 'Create Addendum', exact: true })
    .click();
  await expect(
    panel
      .getByRole('definition')
      .filter({ hasText: 'C8 second priced change ' + suffix }),
  ).toBeVisible();
  await expect(
    panel
      .getByRole('paragraph')
      .filter({ hasText: /^No Pricing Snapshot referenced\.$/ }),
  ).toHaveCount(0);
  await panel
    .getByRole('button', { name: 'Return to parent agreement', exact: true })
    .click();
  const addenda = panel.getByRole('region', { name: 'Addenda', exact: true });
  await expect(addenda.getByRole('button')).toHaveText([
    'Open Addendum 1',
    'Open Addendum 2',
  ]);
  await addenda
    .getByRole('button', { name: 'Open Addendum 1', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await panel
    .getByRole('textbox', { name: 'Change summary', exact: true })
    .fill('C8 revised exact change ' + suffix);
  await panel
    .getByLabel('New term end (optional)', { exact: true })
    .fill('2030-12-31');
  await panel
    .getByRole('button', { name: 'Create new Addendum Version', exact: true })
    .click();
  await expect(
    panel.getByRole('definition').filter({
      hasText: new RegExp('^C8 revised exact change ' + suffix + '$'),
    }),
  ).toBeVisible();
  await expect(
    history.getByRole('button', {
      name: 'Open Contract Version 2',
      exact: true,
    }),
  ).toBeDisabled();
  await checks
    .getByRole('button', { name: 'Run Contract Quality Checks', exact: true })
    .click();
  await expect(
    checks.getByText('Parent agreement is executed', { exact: true }),
  ).toBeVisible();
  await checks
    .getByRole('button', { name: 'Reopen recorded checks', exact: true })
    .click();
  const recordedChildRun = checks
    .getByRole('button', { name: /^Reopen run · / })
    .first();
  await expect(recordedChildRun).toBeVisible();
  await recordedChildRun.click();
  await expect(
    checks.getByText('Parent agreement is executed', { exact: true }),
  ).toBeVisible();
  for (const checkbox of await decision.getByRole('checkbox').all())
    await checkbox.check();
  await decision
    .getByRole('button', {
      name: 'Approve exact Contract Version',
      exact: true,
    })
    .click();
  await expect(
    decision.getByText('Approved internally', { exact: true }),
  ).toBeVisible();
  const parentWithChildren = await readParent();
  if (!Array.isArray(parentWithChildren.addenda))
    throw new Error('Missing C8 ordered Addenda');
  const firstChildId = text(object(parentWithChildren.addenda[0]).id),
    secondChildId = text(object(parentWithChildren.addenda[1]).id);
  const childBase = parentPath + '/agreements/' + firstChildId;
  const readChild = async (id: string) =>
    object(
      object(
        await body(
          await request.get(api + parentPath + '/agreements/' + id, {
            headers: { ...preparer, 'x-company-context-id': companyId },
          }),
        ),
      ).contract,
    );
  const approvedChild = await readChild(firstChildId),
    childApproval = object(object(approvedChild.version).decision);
  const childSignedOn = text(childApproval.decidedAt).slice(0, 10);
  await signatures
    .getByLabel('Provider signatory label', { exact: true })
    .fill('Synthetic C8 provider');
  await signatures
    .getByLabel('Client signatory label', { exact: true })
    .fill('Synthetic C8 Client');
  await signatures
    .getByLabel('Provider signing date', { exact: true })
    .fill(childSignedOn);
  await signatures
    .getByLabel('Client signing date', { exact: true })
    .fill(childSignedOn);
  for (const checkbox of await signatures.getByRole('checkbox').all())
    await checkbox.check();
  await signatures
    .getByRole('button', {
      name: 'Record both simulated signatures',
      exact: true,
    })
    .click();
  await expect(
    signatures.getByText('Executed — simulated evidence only', { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole('button', {
      name: 'Create new Addendum Version',
      exact: true,
    }),
  ).toHaveCount(0);
  await panel
    .getByRole('button', { name: 'Open exact Contract document', exact: true })
    .click();
  await expect(
    frame.getByRole('heading', { name: 'Illustrative Addendum', exact: true }),
  ).toBeVisible();
  await expect(
    frame.getByText('C8 revised exact change ' + suffix, { exact: true }),
  ).toBeVisible();
  const executedChild = await readChild(firstChildId);
  expect(
    object(object(executedChild.version).signature).representationChecksum,
  ).toBe(childApproval.representationChecksum);
  expect(object(object(executedChild.version).representation).sha256).toBe(
    childApproval.representationChecksum,
  );
  const frozenRefusal = await request.post(api + childBase + '/versions', {
    headers: {
      ...preparer,
      'x-company-context-id': companyId,
      'idempotency-key': 'c8-frozen-' + suffix,
    },
    data: {
      expectedContractRevision: executedChild.revision,
      changeSummary: 'Cannot change signed child',
    },
  });
  expect(frozenRefusal.status()).toBe(409);
  await panel.screenshot({
    path: testInfo.outputPath('c8-executed-' + suffix.toLowerCase() + '.png'),
  });
  await panel
    .getByRole('button', { name: 'Return to parent agreement', exact: true })
    .click();
  await expect(addenda.getByRole('listitem').first()).toContainText(
    'Executed — simulated evidence only',
  );
  await addenda
    .getByRole('button', { name: 'Open Addendum 2', exact: true })
    .click();
  await expect(
    panel
      .getByRole('definition')
      .filter({ hasText: 'C8 second priced change ' + suffix }),
  ).toBeVisible();
  expect(
    object((await readChild(secondChildId)).version).pricingSnapshotId,
  ).toBe(text(snapshot.id));
  await panel
    .getByRole('button', { name: 'Return to parent agreement', exact: true })
    .click();
  const parentAfter = await readParent();
  expect({ ...parentAfter, addenda: [] }).toEqual({
    ...parentBefore,
    addenda: [],
  });
  await expect(
    projectsPanel.getByRole('button', { name: 'Open Project', exact: true }),
  ).toHaveCount(2);
  await panel.screenshot({
    path: testInfo.outputPath(
      'c8-parent-unchanged-' + suffix.toLowerCase() + '.png',
    ),
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
test('C9 governs a persisted DIRECT Contract without Offer authority', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'Narrow' : 'Desktop';
  const name = 'Direct Contract Company ' + suffix;
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
      key: 'c9-company-' + suffix,
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
    'company-contract-preparer',
    'company-contract-approver',
  ])
    await command({
      request: request,
      path: '/' + route + '-assignments',
      data: { workspaceMembershipId: membership, companyId },
      key: 'c9-grant-' + route + '-' + suffix,
      companyId: undefined,
      administrator: true,
    });
  const client = object(
    await command({
      request: request,
      path: '/clients',
      data: {
        displayName: 'Synthetic Contract Recipient ' + suffix,
        taxId: 'SYNTHETIC-C9-' + suffix.toUpperCase(),
        address: '1 Example Street',
      },
      key: 'c9-client-' + suffix,
      companyId: companyId,
    }),
  );
  const intake = object(
    await command({
      request: request,
      path: '/commercial-intake/requests',
      data: {
        originalText: 'Synthetic source for the Contract browser proof.',
        subject: 'Direct Contract Request ' + suffix,
        clientAccountId: text(client.id),
        opportunity: {
          title: 'Prepare Contract ' + suffix,
          scope: 'Synthetic scope',
          nextAction: 'Prepare the first Contract',
        },
      },
      key: 'c9-request-' + suffix,
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
          label: 'Synthetic C9 rule',
          effectiveFrom,
          expectedActiveVersionNumber: null,
        },
        key: 'c9-rule-' + suffix,
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
          code: 'C9-' + suffix.toUpperCase(),
          name: 'Illustrative Contract service',
          description: null,
        },
        key: 'c9-definition-' + suffix,
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
        key: 'c9-offering-' + suffix,
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
        key: 'c9-tariff-' + suffix,
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
      key: 'c9-snapshot-' + suffix,
      companyId: companyId,
    }),
  );
  const secondSnapshot = object(
    await command({
      request,
      path: '/pricing/opportunities/' + opportunityId + '/snapshots',
      companyId,
      key: 'c9-second-snapshot-' + suffix,
      data: {
        pricingRuleVersionNumber: rule.versionNumber,
        lines: [
          {
            offeringId: text(offering.id),
            tariffVersionNumber: tariff.versionNumber,
            quantity: '2',
          },
        ],
      },
    }),
  );
  expect(
    (
      await request.get(api + '/offers/opportunities/' + opportunityId, {
        headers: { ...preparer, 'x-company-context-id': companyId },
      })
    ).status(),
  ).toBe(403);
  const calls: string[] = [];
  page.on('request', (sent) => calls.push(new URL(sent.url()).pathname));
  await page.goto('/?frame=classic#requests');
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(page.getByLabel('Active Company', { exact: true }), {
    label: name,
  });
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
  const openRequest = () =>
    page
      .getByRole('button')
      .filter({
        has: page.getByText('Direct Contract Request ' + suffix, {
          exact: true,
        }),
      })
      .click();
  await openRequest();
  const panel = page.getByRole('region', { name: 'Contract', exact: true });
  await panel
    .getByRole('textbox', { name: 'Internal direct reason', exact: true })
    .fill('Exact internal reason ' + suffix);
  await panel
    .getByRole('textbox', { name: 'Direct scope', exact: true })
    .fill('Exact direct scope ' + suffix);
  await selectOption(
    panel.getByRole('combobox', { name: 'Pricing Snapshot', exact: true }),
    {
      value: text(snapshot.id),
    },
  );
  const base = '/contracts/opportunities/' + opportunityId,
    attempts: Array<{ body: string | null; key: string | undefined }> = [];
  await page.route('**/api' + base + '/direct', async (route) => {
    const sent = route.request();
    attempts.push({
      body: sent.postData(),
      key: sent.headers()['idempotency-key'],
    });
    if (attempts.length === 1) {
      expect((await route.fetch()).status()).toBe(201);
      await route.abort('failed');
    } else await route.continue();
  });
  await panel
    .getByRole('button', { name: 'Create direct Contract', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    panel.getByText(
      'The direct Contract result is uncertain. Retry the identical command.',
      { exact: true },
    ),
  ).toBeVisible();
  await panel
    .getByRole('button', {
      name: 'Retry identical direct Contract command',
      exact: true,
    })
    .focus();
  await page.keyboard.press('Enter');
  await expect(panel.getByText('Direct origin', { exact: true })).toBeVisible();
  expect(attempts[1]).toEqual(attempts[0]);
  await page.unroute('**/api' + base + '/direct');
  const read = async () =>
    object(
      object(
        await body(
          await request.get(api + base, {
            headers: { ...preparer, 'x-company-context-id': companyId },
          }),
        ),
      ).contract,
    );
  const initial = await read(),
    initialVersion = object(initial.version),
    initialRepresentation = object(initialVersion.representation);
  expect(initial.origin).toBe('DIRECT');
  expect(initial.sourceOfferVersionId).toBeNull();
  expect(initialVersion.pricingSnapshotId).toBe(snapshot.id);
  expect(text(initialRepresentation.html)).not.toContain(
    'Exact internal reason',
  );
  await panel.screenshot({
    path: testInfo.outputPath(
      'c9-real-created-' + suffix.toLowerCase() + '.png',
    ),
  });
  await panel
    .getByRole('textbox', { name: 'Direct scope', exact: true })
    .fill('Revised direct scope ' + suffix);
  await panel
    .getByRole('textbox', {
      name: 'Direct commercial conditions (optional)',
      exact: true,
    })
    .fill('Revised exact conditions');
  await selectOption(
    panel.getByRole('combobox', { name: 'Pricing Snapshot', exact: true }),
    {
      value: text(secondSnapshot.id),
    },
  );
  const revision = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().endsWith(base + '/versions'),
  );
  await panel
    .getByRole('button', {
      name: 'Create new direct Contract Version',
      exact: true,
    })
    .focus();
  await page.keyboard.press('Enter');
  expect((await revision).status()).toBe(201);
  await expect(
    panel
      .getByRole('definition')
      .filter({ hasText: new RegExp('^Revised direct scope ' + suffix + '$') }),
  ).toBeVisible();
  const revised = await read(),
    revisedVersion = object(revised.version),
    versionId = text(revisedVersion.id),
    representation = object(revisedVersion.representation);
  expect(revised.directReason).toBe(initial.directReason);
  expect(revisedVersion.pricingSnapshotId).toBe(secondSnapshot.id);
  expect(object(revisedVersion.pricingSnapshot).total).toBe('690.00');
  expect(revisedVersion.differences).toEqual(
    expect.arrayContaining([
      {
        field: 'scopeNote',
        before: 'Exact direct scope ' + suffix,
        after: 'Revised direct scope ' + suffix,
      },
      expect.objectContaining({
        field: 'pricingSnapshotId',
        before: snapshot.id,
        after: secondSnapshot.id,
        afterSnapshot: expect.objectContaining({
          currency: 'EUR',
          total: '690.00',
        }),
      }),
    ]),
  );
  const predecessor = object(
    object(
      await body(
        await request.get(api + base + '/versions/' + text(initialVersion.id), {
          headers: { ...preparer, 'x-company-context-id': companyId },
        }),
      ),
    ).contract,
  );
  expect(object(predecessor.version).representation).toEqual(
    initialRepresentation,
  );
  await panel
    .getByRole('button', { name: 'Open exact Contract document', exact: true })
    .click();
  const frame = panel.frameLocator(
    'iframe[title="Illustrative Contract document"]',
  );
  await expect(frame.getByText('Direct origin', { exact: true })).toBeVisible();
  await expect(frame.locator('body')).not.toContainText(
    'Exact internal reason',
  );
  await expect(frame.locator('footer')).toContainText(text(secondSnapshot.id));
  await expect(panel.locator('iframe')).toHaveAttribute(
    'srcdoc',
    text(representation.html),
  );
  await panel.screenshot({
    path: testInfo.outputPath(
      'c9-real-revised-' + suffix.toLowerCase() + '.png',
    ),
  });
  const checks = panel.getByRole('region', {
    name: 'Contract Quality Checks',
    exact: true,
  });
  await checks
    .getByRole('button', { name: 'Run Contract Quality Checks', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    checks.getByText('Direct origin requires review', { exact: true }),
  ).toBeVisible();
  const decision = panel.getByRole('region', {
    name: 'Contract decision',
    exact: true,
  });
  const refused = page.waitForResponse((response) =>
    response.url().endsWith('/versions/' + versionId + '/approve'),
  );
  await decision
    .getByRole('button', {
      name: 'Approve exact Contract Version',
      exact: true,
    })
    .click();
  expect((await refused).status()).toBe(409);
  await decision
    .getByRole('checkbox', {
      name: 'I acknowledge this warning: Direct origin requires review',
      exact: true,
    })
    .check();
  await decision
    .getByRole('button', {
      name: 'Approve exact Contract Version',
      exact: true,
    })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    decision.getByText('Decision recorded.', { exact: true }),
  ).toBeVisible();
  const signatures = panel.getByRole('region', {
    name: 'Simulated Contract signatures',
    exact: true,
  });
  await signatures
    .getByRole('textbox', { name: 'Provider signatory label', exact: true })
    .fill('Synthetic direct provider');
  await signatures
    .getByRole('textbox', { name: 'Client signatory label', exact: true })
    .fill('Synthetic direct client');
  const signedOn = new Date(Date.now() + initialOffset + 120000)
    .toISOString()
    .slice(0, 10);
  await signatures
    .getByLabel('Provider signing date', { exact: true })
    .fill(signedOn);
  await signatures
    .getByLabel('Client signing date', { exact: true })
    .fill(signedOn);
  await signatures
    .getByRole('button', {
      name: 'Record both simulated signatures',
      exact: true,
    })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    signatures.getByText('Both simulated signatures recorded.', {
      exact: true,
    }),
  ).toBeVisible();
  const executed = await read();
  expect(object(executed.version).executionState).toBe('EXECUTED');
  expect(object(executed.version).representation).toEqual(representation);
  expect(
    object(object(executed.version).signature).representationChecksum,
  ).toBe(representation.sha256);
  for (const route of ['company-director-client', 'company-pricing-user'])
    expect(
      (
        await request.delete(
          api + '/' + route + '-assignments/' + membership + '/' + companyId,
          {
            headers: {
              ...owner,
              'idempotency-key': 'c9-real-revoke-' + route + '-' + suffix,
            },
          },
        )
      ).status(),
    ).toBe(200);
  await page.reload();
  await openRequest();
  await expect(panel.getByText('Direct origin', { exact: true })).toBeVisible();
  await panel
    .getByRole('button', { name: 'Open exact Contract document', exact: true })
    .click();
  await expect(panel.locator('iframe')).toHaveAttribute(
    'srcdoc',
    text(representation.html),
  );
  expect(object((await read()).version).representation).toEqual(representation);
  expect(calls.some((path) => path.includes('/offers/'))).toBe(false);
  await panel.screenshot({
    path: testInfo.outputPath(
      'c9-real-executed-' + suffix.toLowerCase() + '.png',
    ),
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test('C7 prepares, executes and references a persisted illustrative Precontract', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(150000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'Narrow' : 'Desktop';
  const name = 'Precontract Company ' + suffix;
  const actor = object(
    await body(
      await request.get(api + '/access/current-actor', { headers: preparer }),
    ),
  );
  const membership = text(actor.workspaceMembershipId);
  const companyId = text(
    object(
      await command({
        request,
        path: '/companies',
        data: { displayName: name },
        key: 'c7-company-' + suffix,
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
    'company-contract-preparer',
    'company-contract-approver',
    'company-project',
  ])
    await command({
      request,
      path: '/' + route + '-assignments',
      data: { workspaceMembershipId: membership, companyId },
      key: 'c7-grant-' + route + '-' + suffix,
      administrator: true,
    });
  const clientId = text(
    object(
      await command({
        request,
        path: '/clients',
        data: {
          displayName: 'Synthetic Precontract Recipient ' + suffix,
          taxId: 'SYNTHETIC-C7-OFFER-' + suffix.toUpperCase(),
          address: '7 Example Street',
        },
        key: 'c7-client-' + suffix,
        companyId,
      }),
    ).id,
  );
  const intake = object(
    await command({
      request,
      path: '/commercial-intake/requests',
      data: {
        originalText: 'Synthetic source for the Precontract browser proof.',
        subject: 'Precontract Request ' + suffix,
        clientAccountId: clientId,
        opportunity: {
          title: 'Prepare Precontract ' + suffix,
          scope: 'Synthetic scope',
          nextAction: 'Start preliminary work',
        },
      },
      key: 'c7-request-' + suffix,
      companyId,
    }),
  );
  const opportunityId = text(object(intake.initialOpportunity).id);
  const effectiveFrom = new Date(
    Date.now() + initialOffset + 60000,
  ).toISOString();
  const rule = object(
    object(
      await command({
        request,
        path: '/pricing-configuration/rule-versions',
        data: {
          label: 'Synthetic C7 rule',
          effectiveFrom,
          expectedActiveVersionNumber: null,
        },
        key: 'c7-rule-' + suffix,
        companyId,
      }),
    ).version,
  );
  const definition = object(
    object(
      await command({
        request,
        path: '/commercial-catalogue/service-definitions',
        data: {
          code: 'C7-' + suffix.toUpperCase(),
          name: 'Illustrative Precontract service',
          description: null,
        },
        key: 'c7-definition-' + suffix,
        companyId,
      }),
    ).definition,
  );
  const offering = object(
    object(
      await command({
        request,
        path: '/commercial-catalogue/offerings',
        data: {
          serviceDefinitionId: text(definition.id),
          commercialLabel: null,
        },
        key: 'c7-offering-' + suffix,
        companyId,
      }),
    ).offering,
  );
  const tariff = object(
    object(
      await command({
        request,
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
        key: 'c7-tariff-' + suffix,
        companyId,
      }),
    ).version,
  );
  await writeFile(clockFile(), JSON.stringify(initialOffset + 120000));
  const snapshot = object(
    await command({
      request,
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
      key: 'c7-snapshot-' + suffix,
      companyId,
    }),
  );
  const offer = object(
    await command({
      request,
      path: '/offers/opportunities/' + opportunityId,
      data: {
        pricingSnapshotId: text(snapshot.id),
        recipient: { kind: 'PRIMARY' },
        scopeNote: 'Accepted Precontract scope ' + suffix,
        commercialConditions: 'Accepted Precontract conditions',
      },
      key: 'c7-offer-' + suffix,
      companyId,
    }),
  );
  const versionPath =
    '/offers/opportunities/' +
    opportunityId +
    '/versions/' +
    text(object(offer.version).id);
  await command({
    request,
    path: versionPath + '/approve',
    data: { expectedOfferRevision: 1, acknowledgedWarningCodes: [] },
    key: 'c7-offer-approve-' + suffix,
    companyId,
  });
  const transmitted = object(
    await command({
      request,
      path: versionPath + '/transmission',
      data: { expectedOfferRevision: 2, acknowledgedWarningCodes: [] },
      key: 'c7-offer-transmit-' + suffix,
      companyId,
    }),
  );
  await command({
    request,
    path: versionPath + '/client-response',
    data: {
      expectedOfferRevision: 3,
      outcome: 'ACCEPTED',
      receivedAt: text(transmitted.transmittedAt),
    },
    key: 'c7-offer-accept-' + suffix,
    companyId,
  });
  // The director records the Client IDNO after the Offer (PRD 19.16 step 1).
  const clientBefore = object(
    await body(
      await request.get(api + '/clients/' + clientId, {
        headers: { ...preparer, 'x-company-context-id': companyId },
      }),
    ),
  );
  expect(
    (
      await request.patch(api + '/clients/' + clientId, {
        headers: {
          ...preparer,
          'x-company-context-id': companyId,
          'idempotency-key': 'c7-idno-' + suffix,
        },
        data: {
          expectedVersion: clientBefore.version,
          taxId: 'IDNO-C7-' + suffix.toUpperCase(),
        },
      })
    ).status(),
  ).toBe(200);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?frame=classic#requests');
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(page.getByLabel('Active Company', { exact: true }), {
    label: name,
  });
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
  const openRequest = () =>
    page
      .getByRole('button')
      .filter({
        has: page.getByText('Precontract Request ' + suffix, { exact: true }),
      })
      .click();
  await openRequest();
  const panel = page.getByRole('region', { name: 'Contract', exact: true });
  const editor = panel.getByRole('region', {
    name: 'Create Precontract',
    exact: true,
  });
  await editor
    .getByRole('textbox', { name: 'Preliminary work scope', exact: true })
    .fill('Synthetic site survey before the Contract');
  await editor
    .getByRole('textbox', {
      name: 'Preliminary financial conditions',
      exact: true,
    })
    .fill('Synthetic advance capped at cost');
  await editor
    .getByRole('textbox', { name: 'Limits until the Contract', exact: true })
    .fill('Synthetic limit: survey only');
  await editor
    .getByLabel('Precontract term end', { exact: true })
    .fill('2099-12-31');
  await editor.screenshot({
    path: testInfo.outputPath(
      'c7-precontract-form-' + suffix.toLowerCase() + '.png',
    ),
  });
  await editor
    .getByRole('button', { name: 'Create Precontract', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    panel.getByText('Precontract created.', { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole('heading', {
      name: 'Illustrative Precontract',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    panel.getByText('Illustrative reference 1 · Version 1', { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText('Pending approval · Not executed', { exact: true }),
  ).toBeVisible();
  await panel
    .getByRole('button', { name: 'Open exact Contract document', exact: true })
    .click();
  await expect(
    panel.getByText('Draft — not approved', { exact: true }),
  ).toBeVisible();
  const frame = panel.frameLocator(
    'iframe[title="Illustrative Contract document"]',
  );
  await expect(
    frame.getByRole('heading', {
      name: 'Illustrative Precontract',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    frame.getByRole('heading', {
      name: 'Preliminary work — CL_PRELIMINARY_WORK v1',
      exact: true,
    }),
  ).toBeVisible();
  const checks = panel.getByRole('region', {
    name: 'Contract Quality Checks',
    exact: true,
  });
  await checks
    .getByRole('button', { name: 'Run Contract Quality Checks', exact: true })
    .click();
  await expect(checks.getByText('WARNING', { exact: true })).toHaveCount(2);
  const decision = panel.getByRole('region', {
    name: 'Contract decision',
    exact: true,
  });
  await expect(decision.getByRole('checkbox')).toHaveCount(2);
  for (const box of await decision.getByRole('checkbox').all())
    await box.check();
  await decision
    .getByRole('button', {
      name: 'Approve exact Contract Version',
      exact: true,
    })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    decision.getByText('Approved internally', { exact: true }),
  ).toBeVisible();
  const base = '/contracts/opportunities/' + opportunityId;
  const opened = object(
    await body(
      await request.get(api + base, {
        headers: { ...preparer, 'x-company-context-id': companyId },
      }),
    ),
  );
  const precontractId = text(object(opened.precontract).id);
  const agreement = base + '/agreements/' + precontractId;
  const approvedRead = object(
    object(
      await body(
        await request.get(api + agreement, {
          headers: { ...preparer, 'x-company-context-id': companyId },
        }),
      ),
    ).contract,
  );
  const signingDate = text(
    object(object(approvedRead.version).decision).decidedAt,
  ).slice(0, 10);
  const signatures = panel.getByRole('region', {
    name: 'Simulated Contract signatures',
    exact: true,
  });
  await signatures
    .getByLabel('Provider signatory label', { exact: true })
    .fill('Synthetic provider signatory');
  await signatures
    .getByLabel('Client signatory label', { exact: true })
    .fill('Synthetic Client signatory');
  await signatures
    .getByLabel('Provider signing date', { exact: true })
    .fill(signingDate);
  await signatures
    .getByLabel('Client signing date', { exact: true })
    .fill(signingDate);
  await signatures
    .getByRole('button', { name: 'Record both simulated signatures' })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    signatures.getByText('Executed — simulated evidence only', { exact: true }),
  ).toBeVisible();
  const late = await request.post(api + agreement + '/versions', {
    headers: {
      ...preparer,
      'x-company-context-id': companyId,
      'idempotency-key': 'c7-late-' + suffix,
    },
    data: {
      expectedContractRevision: 3,
      preliminaryWorkScope: 'Late scope',
      preliminaryFinancialConditions: 'Late conditions',
      preliminaryLimits: 'Late limits',
      termEndsOn: '2099-12-31',
    },
  });
  expect(late.status()).toBe(409);
  expect(await body(late)).toMatchObject({ code: 'CONTRACT_EXECUTED' });
  const projects = panel.getByRole('region', {
    name: 'Contract Projects',
    exact: true,
  });
  const creation = projects.getByRole('region', {
    name: 'Create a preparatory Project',
    exact: true,
  });
  await expect(
    creation.getByRole('textbox', { name: 'New Project title' }),
  ).toHaveValue('Prepare Precontract ' + suffix);
  await creation.getByRole('checkbox').check();
  await creation
    .getByRole('button', { name: 'Create and link Project', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(
    projects.getByText('Prepare Precontract ' + suffix).first(),
  ).toBeVisible();
  await command({
    request,
    path: agreement + '/addenda',
    data: {
      expectedContractRevision: 4,
      changeSummary: 'Synthetic Precontract change ' + suffix,
      termEndsOn: '2099-06-30',
    },
    key: 'c7-addendum-' + suffix,
    companyId,
  });
  await page.reload();
  await openRequest();
  const listed = panel.getByRole('region', {
    name: 'Precontract',
    exact: true,
  });
  await expect(
    listed.getByText(
      'Illustrative Precontract reference 1 · Version 1 · Approved internally · Executed — simulated evidence only',
      { exact: true },
    ),
  ).toBeVisible();
  await listed
    .getByRole('button', { name: 'Open Precontract', exact: true })
    .click();
  await expect(
    panel.getByRole('region', { name: 'Addenda', exact: true }),
  ).toContainText('1');
  await panel.screenshot({
    path: testInfo.outputPath(
      'c7-precontract-executed-' + suffix.toLowerCase() + '.png',
    ),
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await panel
    .getByRole('button', { name: 'Back to the Contract area', exact: true })
    .click();
  await panel
    .getByRole('button', { name: 'Create Contract', exact: true })
    .click();
  await expect(
    panel.getByText('Contract created.', { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole('definition').filter({ hasText: /^1$/u }).first(),
  ).toBeVisible();
  await expect(
    panel
      .getByRole('term')
      .filter({ hasText: /^Illustrative Precontract reference$/u }),
  ).toBeVisible();
  await panel
    .getByRole('button', { name: 'Open exact Contract document', exact: true })
    .click();
  await expect(panel.locator('iframe')).toHaveAttribute(
    'srcdoc',
    /<dt>Illustrative Precontract reference<\/dt><dd>1<\/dd>/u,
  );
  await expect(
    panel.getByRole('button', { name: 'Create Precontract', exact: true }),
  ).toHaveCount(0);
  await panel.screenshot({
    path: testInfo.outputPath(
      'c7-main-contract-reference-' + suffix.toLowerCase() + '.png',
    ),
  });
  const refused = await request.post(api + base, {
    headers: {
      ...preparer,
      'x-company-context-id': companyId,
      'idempotency-key': 'c7-second-precontract-' + suffix,
    },
    data: {
      kind: 'PRECONTRACT',
      acceptedOfferVersionId: text(object(offer.version).id),
      preliminaryWorkScope: 'Second scope',
      preliminaryFinancialConditions: 'Second conditions',
      preliminaryLimits: 'Second limits',
      termEndsOn: '2099-12-31',
    },
  });
  expect(refused.status()).toBe(409);
  expect(await body(refused)).toMatchObject({
    code: 'CONTRACT_ALREADY_EXISTS',
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
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
