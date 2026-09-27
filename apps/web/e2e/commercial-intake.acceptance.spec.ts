import { expectSelectAppearance } from './select-appearance';
import { enterClassicCompatibility } from './classic-compatibility';
import { expectValue, selectOption } from './select-option';
import {
  expect,
  test,
  type Page,
  type Request,
  type Response,
  type TestInfo,
} from '@playwright/test';

test('captures and reopens manual Client Requests through the real API and PostgreSQL', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'Narrow' : 'Desktop';
  const requestSubject = `Commercial request ${suffix}`;
  const linkedSubject = `Linked commercial request ${suffix}`;
  const clientName = `Commercial Client ${suffix}`;
  const originalText = `Exact manual source for the ${suffix} commercial journey.`;
  const linkedOriginalText = `Exact Client-linked source for the ${suffix} journey.`;
  const opportunityTitle = `Qualify ${suffix} commercial request`;

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const company = page.getByLabel('Active Company', { exact: true });
  const navigation = page.getByRole('navigation', {
    name: 'Primary navigation',
  });
  await selectCompany(page, company, narrow);
  await navigate(page, navigation, 'Client Requests', narrow);

  const intake = page.locator('.commercial-intake-workspace');
  const listItems = intake.locator('.commercial-intake-list > li');
  const filter = intake.getByLabel('Filter loaded Client Requests', {
    exact: true,
  });
  const clearFilter = intake.getByRole('button', {
    name: 'Show all loaded Requests',
  });
  if (!narrow)
    await expect(
      intake.getByText('No Client Requests for PRISMA-PRIM yet.', {
        exact: true,
      }),
    ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(
      `commercial-intake-form-${suffix.toLowerCase()}.png`,
    ),
    fullPage: true,
  });
  await intake.getByRole('button', { name: 'Capture Request' }).click();
  await expect(intake.locator(':scope > [role="alert"]')).toHaveText(
    'Enter the required request and Opportunity fields.',
  );
  await captureRequest(page, intake, {
    originalText,
    subject: requestSubject,
    reportedReceivedAt: '2026-09-20T09:30',
    opportunityTitle,
    nextAction: 'Arrange a qualification call',
  });
  await expect(
    intake.getByRole('heading', { name: requestSubject, exact: true }),
  ).toBeVisible();
  await expect(intake.getByText(originalText, { exact: true })).toBeVisible();

  await page.reload();
  const requestButton = intake.getByRole('button').filter({
    has: page.getByText(requestSubject, { exact: true }),
  });
  await expect(requestButton.locator('time')).not.toBeEmpty();
  await page.screenshot({
    path: testInfo.outputPath(
      `commercial-intake-traceability-list-${suffix.toLowerCase()}.png`,
    ),
    fullPage: true,
  });
  await requestButton.click();
  await expect(intake.getByText(originalText, { exact: true })).toBeVisible();
  // Traceability survives the reload: the server capture time and the
  // responsible actor come back from PostgreSQL, not from the browser.
  const detailCapturedAt = intake
    .locator('.commercial-intake-detail dl > div')
    .filter({ hasText: 'Captured at' })
    .locator('time');
  await expect(detailCapturedAt).toHaveAttribute(
    'datetime',
    /^\d{4}-\d{2}-\d{2}T/u,
  );
  await expect(detailCapturedAt).not.toBeEmpty();
  await expect(
    intake.getByText('Responsible actor: Ada Ionescu', { exact: true }),
  ).toBeVisible();
  await expect(
    intake.getByText('Reported received at', { exact: true }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(
      `commercial-intake-traceability-detail-${suffix.toLowerCase()}.png`,
    ),
    fullPage: true,
  });

  // Real next-action edit at the observed version, then reload and conflict.
  // The edit uses the maximum length, so the detail and the list row must wrap.
  const editedNextAction = `Confirm the ${suffix} qualification call`.padEnd(
    500,
    ' and prepare the audit evidence',
  );
  await expect(intake.getByText('Version: 1', { exact: true })).toBeVisible();
  await intake.getByRole('button', { name: 'Edit next action' }).click();
  await intake.getByLabel('Next action').fill('   ');
  await intake.getByRole('button', { name: 'Save next action' }).click();
  await expect(intake.locator(':scope > [role="alert"]')).toHaveText(
    'Enter a next action between 1 and 500 characters.',
  );
  await intake.getByLabel('Next action').fill(editedNextAction);
  const updateResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/api\/commercial-intake\/opportunities\/[^/]+\/next-action$/u.test(
        new URL(response.url()).pathname,
      ),
  );
  await intake.getByRole('button', { name: 'Save next action' }).click();
  expect((await updateResponse).status()).toBe(200);
  await expect(intake.locator(':scope > [role="alert"]')).toHaveText(
    'Next action saved.',
  );
  await expect(
    intake.getByText(`Next action: ${editedNextAction}`, { exact: true }),
  ).toBeVisible();
  await expect(intake.getByText('Version: 2', { exact: true })).toBeVisible();
  await expect(intake.getByText(originalText, { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(
      `commercial-intake-next-action-${suffix.toLowerCase()}.png`,
    ),
    fullPage: true,
  });

  // Going Back shows the saved next action on the Request's own row, and a
  // browser reload reads it again from PostgreSQL.
  const rowNextAction = requestButton.getByText(
    `Next action: ${editedNextAction}`,
    { exact: true },
  );
  await intake.getByRole('button', { name: 'Back to Requests' }).click();
  await expect(rowNextAction).toBeVisible();
  await page.reload();
  await expect(rowNextAction).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(
      `commercial-intake-next-action-list-${suffix.toLowerCase()}.png`,
    ),
    fullPage: true,
  });
  await requestButton.click();
  await expect(
    intake.getByText(`Next action: ${editedNextAction}`, { exact: true }),
  ).toBeVisible();
  await expect(intake.getByText('Version: 2', { exact: true })).toBeVisible();

  const opportunityId = await findOpportunityId(page, requestSubject);
  const concurrentUpdate = await page.request.post(
    `http://127.0.0.1:4174/api/commercial-intake/opportunities/${opportunityId}/next-action`,
    {
      headers: {
        ...apiIdentityHeaders,
        'x-company-context-id': requiredEnvironment(
          'ACCEPTANCE_PRIMARY_COMPANY_ID',
        ),
        'content-type': 'application/json',
        'idempotency-key': `acceptance-concurrent-${suffix}`,
      },
      data: { expectedVersion: 2, nextAction: `Moved first ${suffix}` },
    },
  );
  expect(concurrentUpdate.status()).toBe(200);
  await intake.getByRole('button', { name: 'Edit next action' }).click();
  await intake.getByLabel('Next action').fill(`Stale edit ${suffix}`);
  await intake.getByRole('button', { name: 'Save next action' }).click();
  await expect(intake.locator(':scope > [role="alert"]')).toHaveText(
    'This Opportunity changed since you loaded it. Reload the Request before editing again.',
  );
  await expect(intake.getByLabel('Next action')).toHaveCount(0);
  await intake.getByRole('button', { name: 'Reload Request' }).click();
  await expect(intake.getByText('Version: 3', { exact: true })).toBeVisible();
  await expect(
    intake.getByText(`Next action: Moved first ${suffix}`, { exact: true }),
  ).toBeVisible();
  await expect(
    intake.getByRole('button', { name: 'Edit next action' }),
  ).toBeVisible();

  await navigate(page, navigation, 'Clients', narrow);
  const clients = page.locator('.client-workspace');
  await clients
    .getByRole('button', { name: 'New Client', exact: true })
    .click();
  await clients.getByLabel('Client display name').fill(clientName);
  const clientResponse = page.waitForResponse(
    mutationResponse('POST', '/api/clients'),
  );
  await clients
    .getByRole('button', { name: 'Create Client', exact: true })
    .click();
  expect((await clientResponse).status()).toBe(201);
  await clients.getByRole('button', { name: 'Close registration' }).click();

  await navigate(page, navigation, 'Client Requests', narrow);
  await expect(
    intake.getByText('No Client associated', { exact: true }),
  ).toBeVisible();
  await searchAndSelectClient(intake, clientName);
  const associationResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/api\/commercial-intake\/requests\/[^/]+\/client-association$/u.test(
        new URL(response.url()).pathname,
      ),
  );
  await intake
    .getByRole('button', { name: 'Confirm Client association' })
    .click();
  expect((await associationResponse).status()).toBe(200);
  await expect(intake.locator(':scope > [role="alert"]')).toHaveText(
    'Client associated.',
  );
  await expect(
    intake.getByRole('heading', { name: 'Associate a Client' }),
  ).toHaveCount(0);
  await expect(
    intake
      .locator('.commercial-intake-detail dl > div')
      .filter({ has: page.getByRole('term').filter({ hasText: /^Client$/u }) })
      .getByRole('definition'),
  ).toContainText(clientName);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(
      `commercial-intake-client-association-${suffix.toLowerCase()}.png`,
    ),
    fullPage: true,
  });

  await page.reload();
  await requestButton.click();
  await expect(
    intake
      .locator('.commercial-intake-detail dl > div')
      .filter({ has: page.getByRole('term').filter({ hasText: /^Client$/u }) })
      .getByRole('definition'),
  ).toContainText(clientName);
  await intake.getByRole('button', { name: 'Back to Requests' }).click();
  await captureRequest(page, intake, {
    originalText: linkedOriginalText,
    subject: linkedSubject,
    clientName,
    opportunityTitle: `Qualify ${clientName}`,
    nextAction: 'Confirm the Client qualification call',
  });
  await expect(
    intake.getByRole('heading', { name: linkedSubject, exact: true }),
  ).toBeVisible();
  // The Client value also holds the dossier action, so the display name is
  // proven inside the Client term's own definition.
  const detailClient = intake
    .locator('.commercial-intake-detail dl > div')
    .filter({ has: page.getByRole('term').filter({ hasText: /^Client$/u }) })
    .getByRole('definition');
  await expect(detailClient).toBeVisible();
  await expect(detailClient).toContainText(clientName);
  await expect(
    detailClient.getByRole('button', { name: 'Open Client dossier' }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(
      `commercial-intake-detail-${suffix.toLowerCase()}.png`,
    ),
    fullPage: true,
  });

  await intake.getByRole('button', { name: 'Back to Requests' }).click();
  await searchAndSelectClient(intake, clientName);
  await intake
    .getByLabel('Original request text')
    .fill('Unavailable Client request');
  await intake.getByLabel('Subject').fill('Unavailable Client');
  await intake.getByLabel('Opportunity title').fill('Unavailable Client check');
  await intake.getByLabel('Next action').fill('Refresh the Client search');
  await revokeClientAccess(page);
  try {
    await intake.getByRole('button', { name: 'Capture Request' }).click();
    await expect(intake.locator(':scope > [role="alert"]')).toHaveText(
      'The selected Client is no longer available. Refresh the Client search before trying again.',
    );
  } finally {
    await grantClientAccess(page);
  }

  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await enterClassicCompatibility(page);
  await expectValue(
    intake.getByLabel('Original request text'),
    'Unavailable Client request',
  );
  await expect(intake.locator(':scope > [role="alert"]')).toBeVisible();
  // Both viewport projects share one acceptance database, so only the rows
  // loaded in this run are a stable expectation.
  const loadedBeforeFilter = await listItems.count();
  await filter.click();
  await page.keyboard.type(linkedSubject);
  await expect(listItems).toHaveCount(1);
  await page.keyboard.press('Tab');
  await expect(clearFilter).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(listItems).toHaveCount(loadedBeforeFilter);
  await expect(filter).toBeFocused();
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Try Prisme' }).click();
  await expect(intake.getByLabel('Existing Client')).toHaveText(clientName);

  await seedRequestsPastListBound(page, suffix);
  await page.reload();
  await expect(listItems).toHaveCount(25);
  // Each loaded row carries its own capture time next to the responsible actor.
  await expect(listItems.first().locator('time')).toHaveAttribute(
    'datetime',
    /^\d{4}-\d{2}-\d{2}T/u,
  );
  await expect(listItems.first().locator('time')).not.toBeEmpty();
  await filter.fill(`Bounded list Request ${suffix} 7`);
  await expect(listItems).toHaveCount(1);

  // The oldest Request is only reachable through the unchanged older page.
  await filter.fill(`Qualify ${suffix} commercial request`);
  await expect(listItems).toHaveCount(0);
  await expect(
    intake.getByText('No loaded Client Requests match this filter.', {
      exact: true,
    }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(
      `commercial-intake-filter-${suffix.toLowerCase()}.png`,
    ),
    fullPage: true,
  });
  await intake.getByRole('button', { name: 'Show older Requests' }).click();
  await expect(listItems).toHaveCount(1);
  await listItems.first().getByRole('button').click();
  await expect(
    intake.getByText('Client Request detail', { exact: true }),
  ).toBeVisible();
  await intake.getByRole('button', { name: 'Back to Requests' }).click();
  await expectValue(filter, `Qualify ${suffix} commercial request`);
  await expect(listItems).toHaveCount(1);
  await clearFilter.click();
  await expect(
    intake.getByText(`Bounded list Request ${suffix} 7`, { exact: true }),
  ).toBeVisible();
  await expectValue(filter, '');

  await navigate(page, navigation, 'Activity Log', narrow);
  const activity = page.locator('.activity-log');
  await expect(
    activity.getByText('Ada Ionescu captured a Client Request', {
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    activity.getByText('Ada Ionescu created an initial Opportunity', {
      exact: true,
    }),
  ).toHaveCount(0);

  await grantCommercialActivityReader(page);
  try {
    await page.reload();
    await navigate(page, navigation, 'Activity Log', narrow);
    await expect(
      activity
        .getByText('Ada Ionescu captured a Client Request', { exact: true })
        .first(),
    ).toBeVisible();
    await expect(
      activity
        .getByText('Ada Ionescu created an initial Opportunity', {
          exact: true,
        })
        .first(),
    ).toBeVisible();
    await expect(
      activity
        .getByText('Ada Ionescu associated a Client with a Request', {
          exact: true,
        })
        .first(),
    ).toBeVisible();
    await expect(activity.getByText(originalText, { exact: true })).toHaveCount(
      0,
    );
    await expect(
      activity.getByText(requestSubject, { exact: true }),
    ).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `commercial-activity-history-${suffix.toLowerCase()}.png`,
      ),
      fullPage: true,
    });
  } finally {
    await revokeCommercialActivityReader(page);
  }
  await page.reload();
  await navigate(page, navigation, 'Activity Log', narrow);
  await expect(
    activity.getByText('Ada Ionescu captured a Client Request', {
      exact: true,
    }),
  ).toHaveCount(0);

  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(`commercial-intake-${suffix.toLowerCase()}.png`),
    fullPage: true,
  });

  await revokeCommercialIntake(page);
  try {
    await page.reload();
    await expect(
      navigation.getByRole('link', { name: 'Client Requests', exact: true }),
    ).toHaveCount(0);
  } finally {
    await grantCommercialIntake(page);
  }
});

test('navigates between same-named Client dossiers and their loaded Requests through the real API and PostgreSQL', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'Narrow' : 'Desktop';
  const clientName = `Shared display name ${suffix}`;
  const firstSubject = `First dossier Request ${suffix}`;
  const secondSubject = `Second dossier Request ${suffix}`;
  const unlinkedSubject = `Request without Client ${suffix}`;

  // Registered through the same real API and PostgreSQL the browser reads,
  // newest last so the unlinked Request leads the server order.
  const firstClientId = await seed(page, '/api/clients', {
    displayName: clientName,
  });
  const secondClientId = await seed(page, '/api/clients', {
    displayName: clientName,
  });
  for (const [subject, clientAccountId] of [
    [firstSubject, firstClientId],
    [secondSubject, secondClientId],
    [unlinkedSubject, undefined],
  ] as const)
    await seed(page, '/api/commercial-intake/requests', {
      originalText: `Exact source of ${subject}`,
      subject,
      ...(clientAccountId ? { clientAccountId } : {}),
      opportunity: {
        title: `Qualify ${subject}`,
        nextAction: 'Confirm the dossier navigation',
      },
    });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const company = page.getByLabel('Active Company', { exact: true });
  const navigation = page.getByRole('navigation', {
    name: 'Primary navigation',
  });
  const clients = page.locator('.client-workspace');
  const dossier = page.locator('.client-dossier-detail');
  const intake = page.locator('.commercial-intake-workspace');
  const listItems = intake.locator('.commercial-intake-list > li');
  const rowFor = (subject: string) =>
    listItems.filter({ has: page.getByText(subject, { exact: true }) });
  const filter = intake.getByLabel('Filter loaded Client Requests', {
    exact: true,
  });
  const scope = intake.getByRole('group', {
    name: `Loaded Client Requests for ${clientName}`,
  });
  const clearScope = scope.getByRole('button', {
    name: 'Show loaded Requests for every Client',
  });
  const openDossier = async (clientId: string) => {
    await navigate(page, navigation, 'Clients', narrow);
    await clients
      .getByRole('listitem')
      .filter({ hasText: `Client ID: ${clientId}` })
      .getByRole('button', { name: 'Open dossier' })
      .click();
    await expect(
      dossier.getByRole('heading', { name: clientName, exact: true }),
    ).toBeVisible();
  };
  await selectCompany(page, company, narrow);
  await navigate(page, navigation, 'Client Requests', narrow);
  await expect(rowFor(unlinkedSubject)).toHaveCount(1);

  const mutations: string[] = [];
  const recordMutation = (request: Request) => {
    const { pathname } = new URL(request.url());
    if (pathname.startsWith('/api/') && request.method() !== 'GET')
      mutations.push(`${request.method()} ${pathname}`);
  };
  page.on('request', recordMutation);

  await openDossier(firstClientId);
  await dossier.getByRole('button', { name: 'Open Client Requests' }).click();
  await expect(page.locator('#requests')).toBeFocused();
  await expect(scope).toBeVisible();
  await expect(listItems).toHaveCount(1);
  await expect(rowFor(firstSubject)).toHaveCount(1);
  await capture(
    page,
    testInfo,
    `client-requests-${suffix.toLowerCase()}-prisme.png`,
  );

  // The #303 text filter composes with the identity restriction.
  await filter.fill(secondSubject);
  await expect(listItems).toHaveCount(0);
  await expect(
    intake.getByText('No loaded Client Requests match this filter.', {
      exact: true,
    }),
  ).toBeVisible();
  await filter.fill('');
  await expect(listItems).toHaveCount(1);
  await clearScope.focus();
  await page.keyboard.press('Enter');
  await expect(filter).toBeFocused();
  await expect(scope).toHaveCount(0);
  expect(
    (await listItems.locator('strong').allTextContents()).slice(0, 3),
  ).toEqual([unlinkedSubject, secondSubject, firstSubject]);

  // With the same-named other dossier open, returning must switch dossiers.
  await openDossier(secondClientId);
  await navigate(page, navigation, 'Client Requests', narrow);
  await rowFor(firstSubject).getByRole('button').click();
  await expect(
    intake.getByText(`Exact source of ${firstSubject}`, { exact: true }),
  ).toBeVisible();
  await capture(
    page,
    testInfo,
    `client-request-detail-${suffix.toLowerCase()}-prisme.png`,
  );
  const returnRead = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === `/api/clients/${firstClientId}`,
  );
  await intake.getByRole('button', { name: 'Open Client dossier' }).click();
  await returnRead;
  await expect(page.locator('#clients')).toBeFocused();
  await expect(
    dossier.getByRole('heading', { name: clientName, exact: true }),
  ).toBeVisible();
  page.off('request', recordMutation);
  expect(mutations).toEqual([]);

  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await enterClassicCompatibility(page);
  await dossier.getByRole('button', { name: 'Open Client Requests' }).click();
  await expect(page.locator('#requests')).toBeFocused();
  await expect(scope).toBeVisible();
  await expect(listItems).toHaveCount(1);
  await expect(rowFor(firstSubject)).toHaveCount(1);
  await capture(
    page,
    testInfo,
    `client-requests-${suffix.toLowerCase()}-classic.png`,
  );
});

test('opens the Request from its commercial Activity events through the real API and PostgreSQL', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'Narrow' : 'Desktop';
  const subject = `Pregătire audit demo ${suffix}`;
  const originalText = `Exact source of the ${suffix} Activity navigation.`;

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const company = page.getByLabel('Active Company', { exact: true });
  const navigation = page.getByRole('navigation', {
    name: 'Primary navigation',
  });
  const intake = page.locator('.commercial-intake-workspace');
  const activity = page.locator('.activity-log');
  await selectCompany(page, company, narrow);
  await navigate(page, navigation, 'Client Requests', narrow);
  await captureRequest(page, intake, {
    originalText,
    subject,
    opportunityTitle: `Qualify ${subject}`,
    nextAction: 'Arrange the audit call',
  });
  await intake.getByRole('button', { name: 'Edit next action' }).click();
  await intake
    .getByLabel('Next action')
    .fill(`Confirm the ${suffix} audit window`);
  const updateResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      /\/api\/commercial-intake\/opportunities\/[^/]+\/next-action$/u.test(
        new URL(response.url()).pathname,
      ),
  );
  await intake.getByRole('button', { name: 'Save next action' }).click();
  expect((await updateResponse).status()).toBe(200);
  await expect(intake.locator(':scope > [role="alert"]')).toHaveText(
    'Next action saved.',
  );
  await intake.getByRole('button', { name: 'Back to Requests' }).click();

  await grantCommercialActivityReader(page);
  try {
    await page.reload();
    const mutations: string[] = [];
    const recordMutation = (request: Request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith('/api/') && request.method() !== 'GET')
        mutations.push(`${request.method()} ${pathname}`);
    };
    page.on('request', recordMutation);
    // This run's events are the newest of their kind in the Company page.
    const openRequestOf = (description: string) =>
      activity
        .locator('.activity-log-list > li')
        .filter({ hasText: `Ada Ionescu ${description}` })
        .first()
        .getByRole('button', { name: 'Open Request' });
    const detailRead = () =>
      page.waitForResponse(
        (response) =>
          response.request().method() === 'GET' &&
          /^\/api\/commercial-intake\/requests\/[^/]+$/u.test(
            new URL(response.url()).pathname,
          ),
      );

    await navigate(page, navigation, 'Activity Log', narrow);
    const fromUpdate = openRequestOf('updated an Opportunity next action');
    await expect(fromUpdate).toBeVisible();
    await capture(
      page,
      testInfo,
      `commercial-activity-open-request-${suffix.toLowerCase()}.png`,
    );
    let read = detailRead();
    await fromUpdate.click();
    expect((await read).status()).toBe(200);
    await expect(page.locator('#requests')).toBeFocused();
    await expect(intake.getByText(originalText, { exact: true })).toBeVisible();
    await expect(
      intake.getByText(`Next action: Confirm the ${suffix} audit window`, {
        exact: true,
      }),
    ).toBeVisible();
    await capture(
      page,
      testInfo,
      `commercial-activity-opened-request-${suffix.toLowerCase()}.png`,
    );

    await navigate(page, navigation, 'Activity Log', narrow);
    const fromCapture = openRequestOf('captured a Client Request');
    read = detailRead();
    await fromCapture.focus();
    await page.keyboard.press('Enter');
    expect((await read).status()).toBe(200);
    await expect(page.locator('#requests')).toBeFocused();
    await expect(intake.getByText(originalText, { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    page.off('request', recordMutation);
    expect(mutations).toEqual([]);
  } finally {
    await revokeCommercialActivityReader(page);
  }
});

const apiIdentityHeaders = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'local-demonstration-user',
  'x-test-display-name': 'Ada Ionescu',
  'x-test-email': 'ada@example.test',
};

async function seed(
  page: Page,
  path: string,
  data: Record<string, unknown>,
): Promise<string> {
  const response = await page.request.post(`http://127.0.0.1:4174${path}`, {
    headers: {
      ...apiIdentityHeaders,
      'x-company-context-id': requiredEnvironment(
        'ACCEPTANCE_PRIMARY_COMPANY_ID',
      ),
      'content-type': 'application/json',
      'idempotency-key': `acceptance-client-requests-${crypto.randomUUID()}`,
    },
    data,
  });
  expect(response.status()).toBe(201);
  const value: unknown = await response.json();
  if (!isRecord(value) || typeof value.id !== 'string')
    throw new Error(`Expected an identified record from ${path}.`);
  return value.id;
}

async function capture(
  page: Page,
  testInfo: TestInfo,
  filename: string,
): Promise<void> {
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(filename),
    fullPage: true,
  });
}
const apiAdministratorHeaders = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};

async function seedRequestsPastListBound(
  page: Page,
  suffix: string,
): Promise<void> {
  const companyId = requiredEnvironment('ACCEPTANCE_PRIMARY_COMPANY_ID');
  const responses = await Promise.all(
    Array.from({ length: 24 }, async (_, index) =>
      page.request.post(
        'http://127.0.0.1:4174/api/commercial-intake/requests',
        {
          headers: {
            ...apiIdentityHeaders,
            'x-company-context-id': companyId,
            'content-type': 'application/json',
            'idempotency-key': `acceptance-list-${suffix}-${index}`,
          },
          data: {
            originalText: `Bounded list source ${suffix} ${index}`,
            subject: `Bounded list Request ${suffix} ${index}`,
            opportunity: {
              title: `Bounded list Opportunity ${suffix} ${index}`,
              nextAction: 'Keep the visible list bounded',
            },
          },
        },
      ),
    ),
  );
  expect(responses.every((response) => response.status() === 201)).toBe(true);
}

async function findOpportunityId(page: Page, subject: string): Promise<string> {
  const headers = {
    ...apiIdentityHeaders,
    'x-company-context-id': requiredEnvironment(
      'ACCEPTANCE_PRIMARY_COMPANY_ID',
    ),
  };
  const list = await page.request.get(
    'http://127.0.0.1:4174/api/commercial-intake/requests?limit=25',
    { headers },
  );
  expect(list.status()).toBe(200);
  const page1: unknown = await list.json();
  if (!isRecord(page1) || !Array.isArray(page1.items))
    throw new Error('Expected a Request page.');
  const item = page1.items.find(
    (candidate: unknown) =>
      isRecord(candidate) && candidate.subject === subject,
  );
  if (!isRecord(item) || typeof item.id !== 'string')
    throw new Error(`Expected the Request "${subject}".`);
  const detail = await page.request.get(
    `http://127.0.0.1:4174/api/commercial-intake/requests/${item.id}`,
    { headers },
  );
  expect(detail.status()).toBe(200);
  const request: unknown = await detail.json();
  if (
    !isRecord(request) ||
    !isRecord(request.initialOpportunity) ||
    typeof request.initialOpportunity.id !== 'string'
  )
    throw new Error('Expected the Request detail.');
  return request.initialOpportunity.id;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function revokeCommercialIntake(page: Page): Promise<void> {
  const response = await page.request.delete(
    `http://127.0.0.1:4174/api/company-commercial-intake-assignments/${requiredEnvironment('ACCEPTANCE_PRIMARY_MEMBERSHIP_ID')}/${requiredEnvironment('ACCEPTANCE_PRIMARY_COMPANY_ID')}`,
    {
      headers: {
        ...apiAdministratorHeaders,
        'idempotency-key': `acceptance-revoke-${crypto.randomUUID()}`,
      },
    },
  );
  expect(response.status()).toBe(200);
}

async function grantCommercialIntake(page: Page): Promise<void> {
  const response = await page.request.post(
    'http://127.0.0.1:4174/api/company-commercial-intake-assignments',
    {
      headers: {
        ...apiAdministratorHeaders,
        'content-type': 'application/json',
        'idempotency-key': `acceptance-grant-${crypto.randomUUID()}`,
      },
      data: {
        workspaceMembershipId: requiredEnvironment(
          'ACCEPTANCE_PRIMARY_MEMBERSHIP_ID',
        ),
        companyId: requiredEnvironment('ACCEPTANCE_PRIMARY_COMPANY_ID'),
      },
    },
  );
  expect(response.status()).toBe(201);
}

async function grantCommercialActivityReader(page: Page): Promise<void> {
  const response = await page.request.post(
    'http://127.0.0.1:4174/api/company-commercial-activity-reader-assignments',
    {
      headers: {
        ...apiAdministratorHeaders,
        'content-type': 'application/json',
        'idempotency-key': `acceptance-grant-reader-${crypto.randomUUID()}`,
      },
      data: {
        workspaceMembershipId: requiredEnvironment(
          'ACCEPTANCE_PRIMARY_MEMBERSHIP_ID',
        ),
        companyId: requiredEnvironment('ACCEPTANCE_PRIMARY_COMPANY_ID'),
      },
    },
  );
  expect(response.status()).toBe(201);
}

async function revokeCommercialActivityReader(page: Page): Promise<void> {
  const response = await page.request.delete(
    `http://127.0.0.1:4174/api/company-commercial-activity-reader-assignments/${requiredEnvironment('ACCEPTANCE_PRIMARY_MEMBERSHIP_ID')}/${requiredEnvironment('ACCEPTANCE_PRIMARY_COMPANY_ID')}`,
    {
      headers: {
        ...apiAdministratorHeaders,
        'idempotency-key': `acceptance-revoke-reader-${crypto.randomUUID()}`,
      },
    },
  );
  expect(response.status()).toBe(200);
}

async function revokeClientAccess(page: Page): Promise<void> {
  const response = await page.request.delete(
    `http://127.0.0.1:4174/api/company-director-client-assignments/${requiredEnvironment('ACCEPTANCE_PRIMARY_MEMBERSHIP_ID')}/${requiredEnvironment('ACCEPTANCE_PRIMARY_COMPANY_ID')}`,
    {
      headers: {
        ...apiAdministratorHeaders,
        'idempotency-key': `acceptance-revoke-client-${crypto.randomUUID()}`,
      },
    },
  );
  expect(response.status()).toBe(200);
}

async function grantClientAccess(page: Page): Promise<void> {
  const response = await page.request.post(
    'http://127.0.0.1:4174/api/company-director-client-assignments',
    {
      headers: {
        ...apiAdministratorHeaders,
        'content-type': 'application/json',
        'idempotency-key': `acceptance-grant-client-${crypto.randomUUID()}`,
      },
      data: {
        workspaceMembershipId: requiredEnvironment(
          'ACCEPTANCE_PRIMARY_MEMBERSHIP_ID',
        ),
        companyId: requiredEnvironment('ACCEPTANCE_PRIMARY_COMPANY_ID'),
      },
    },
  );
  expect(response.status()).toBe(201);
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function selectCompany(
  page: Page,
  company: ReturnType<Page['getByLabel']>,
  narrow: boolean,
): Promise<void> {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(company, { label: 'PRISMA-PRIM' });
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
}

async function navigate(
  page: Page,
  navigation: ReturnType<Page['getByRole']>,
  label: string,
  narrow: boolean,
): Promise<void> {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await navigation.getByRole('link', { name: label, exact: true }).click();
}

async function captureRequest(
  page: Page,
  intake: ReturnType<Page['locator']>,
  input: {
    originalText: string;
    subject: string;
    clientName?: string;
    reportedReceivedAt?: string;
    opportunityTitle: string;
    nextAction: string;
  },
): Promise<void> {
  await intake.getByLabel('Original request text').fill(input.originalText);
  await intake.getByLabel('Subject').fill(input.subject);
  if (input.reportedReceivedAt)
    await intake
      .getByLabel('Reported received at')
      .fill(input.reportedReceivedAt);
  if (input.clientName) await searchAndSelectClient(intake, input.clientName);
  await intake.getByLabel('Opportunity title').fill(input.opportunityTitle);
  await intake.getByLabel('Next action').fill(input.nextAction);
  const response = page.waitForResponse(
    mutationResponse('POST', '/api/commercial-intake/requests'),
  );
  await intake.getByRole('button', { name: 'Capture Request' }).click();
  expect((await response).status()).toBe(201);
}

async function searchAndSelectClient(
  intake: ReturnType<Page['locator']>,
  clientName: string,
): Promise<void> {
  await intake
    .getByLabel('Search Clients by name', { exact: true })
    .fill(clientName);
  await intake.getByRole('button', { name: 'Search Clients' }).click();
  await expectSelectAppearance(
    intake.getByLabel('Existing Client', { exact: true }),
  );
  await selectOption(intake.getByLabel('Existing Client', { exact: true }), {
    label: clientName,
  });
}

function mutationResponse(method: string, pathname: string) {
  return (response: Response) =>
    response.request().method() === method &&
    new URL(response.url()).pathname === pathname;
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
