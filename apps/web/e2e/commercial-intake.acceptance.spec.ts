import { expect, test, type Page, type Response } from '@playwright/test';

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
  await expect(intake.getByRole('alert')).toHaveText(
    'Enter the required request and Opportunity fields.',
  );
  await captureRequest(page, intake, {
    originalText,
    subject: requestSubject,
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
  await requestButton.click();
  await expect(intake.getByText(originalText, { exact: true })).toBeVisible();

  // Real next-action edit at the observed version, then reload and conflict.
  const editedNextAction = `Confirm the ${suffix} qualification call`;
  await expect(intake.getByText('Version: 1', { exact: true })).toBeVisible();
  await intake.getByRole('button', { name: 'Edit next action' }).click();
  await intake.getByLabel('Next action').fill('   ');
  await intake.getByRole('button', { name: 'Save next action' }).click();
  await expect(intake.getByRole('alert')).toHaveText(
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
  await expect(intake.getByRole('alert')).toHaveText('Next action saved.');
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

  await page.reload();
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
  await expect(intake.getByRole('alert')).toHaveText(
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
  await expect(intake.getByText(clientName, { exact: true })).toBeVisible();
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
    await expect(intake.getByRole('alert')).toHaveText(
      'The selected Client is no longer available. Refresh the Client search before trying again.',
    );
  } finally {
    await grantClientAccess(page);
  }

  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Use classic frame' }).click();
  await expect(intake.getByLabel('Original request text')).toHaveValue(
    'Unavailable Client request',
  );
  await expect(intake.getByRole('alert')).toBeVisible();
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
  await expect(
    intake.getByLabel('Existing Client').locator('option:checked'),
  ).toHaveText(clientName);

  await seedRequestsPastListBound(page, suffix);
  await page.reload();
  await expect(listItems).toHaveCount(25);
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
  await expect(filter).toHaveValue(`Qualify ${suffix} commercial request`);
  await expect(listItems).toHaveCount(1);
  await clearFilter.click();
  await expect(
    intake.getByText(`Bounded list Request ${suffix} 7`, { exact: true }),
  ).toBeVisible();
  await expect(filter).toHaveValue('');

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

const apiIdentityHeaders = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'local-demonstration-user',
  'x-test-display-name': 'Ada Ionescu',
  'x-test-email': 'ada@example.test',
};
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
  await company.selectOption({ label: 'PRISMA-PRIM' });
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
    opportunityTitle: string;
    nextAction: string;
  },
): Promise<void> {
  await intake.getByLabel('Original request text').fill(input.originalText);
  await intake.getByLabel('Subject').fill(input.subject);
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
  await intake
    .getByLabel('Existing Client', { exact: true })
    .selectOption({ label: clientName });
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
