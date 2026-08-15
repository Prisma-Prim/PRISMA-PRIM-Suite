import { expect, test } from '@playwright/test';
import { actorContextFixture } from './actor-context.fixture';

test('renders the production shell at the normal application entry point', async ({
  page,
}, testInfo) => {
  await page.route('**/api/access/current-actor', (route) => {
    expect(route.request().headers()).toMatchObject({
      'x-test-external-provider': 'local-demo',
      'x-test-external-subject': 'local-demonstration-user',
    });
    return route.fulfill({
      json: actorContextFixture,
    });
  });
  await page.route('**/api/activity-log', (route) => {
    expect(route.request().headers()).toMatchObject({
      'x-test-external-provider': 'local-demo',
      'x-test-external-subject': 'local-demonstration-user',
    });
    return route.fulfill({
      json: {
        events: [
          {
            id: 'event-1',
            action: 'internal_user.provisioned',
            occurredAt: '2026-08-15T09:00:00.000Z',
            actor: {
              internalUserId: 'user-1',
              displayName: 'Ada Ionescu',
            },
            target: {
              type: 'internal_user',
              internalUserId: 'user-1',
              displayName: 'Ada Ionescu',
            },
            metadata: { identityProvider: 'local-demo' },
          },
        ],
      },
    });
  });
  await page.goto('/');

  await expect(page.getByRole('banner')).toBeVisible();
  const navigation = page.getByRole('navigation', {
    name: 'Primary navigation',
  });
  if (testInfo.project.name === 'narrow') {
    await expect(navigation).toBeHidden();
  } else {
    await expect(navigation).toBeVisible();
  }
  await expect(page.getByRole('main')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Welcome to PRISMA-PRIM Suite' }),
  ).toBeVisible();
  await expect(page.getByText('Ada Ionescu', { exact: true })).toBeVisible();
  await expect(page.getByText('ada@example.test')).toBeVisible();
  await expect(
    page
      .getByRole('region', { name: 'Company context' })
      .getByText('PRISMA Workspace'),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Activity Log' }),
  ).toBeVisible();
  await expect(page.getByText('Ada Ionescu was provisioned')).toBeVisible();
  await expect(page.getByText('Target: Ada Ionescu')).toBeVisible();

  const geometry = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  await page.screenshot({
    path: testInfo.outputPath(`shell-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test('makes primary navigation available on a narrow viewport', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'narrow');
  await page.route('**/api/access/current-actor', (route) =>
    route.fulfill({
      json: actorContextFixture,
    }),
  );
  await page.route('**/api/activity-log', (route) =>
    route.fulfill({ json: { events: [] } }),
  );
  await page.goto('/');

  const navigation = page.getByRole('navigation', {
    name: 'Primary navigation',
  });
  const menuButton = page.getByRole('button', { name: 'Open navigation' });

  await expect(navigation).toBeHidden();
  await menuButton.click();
  const openMenuButton = page.locator(
    'button[aria-controls="primary-navigation"]',
  );
  await expect(openMenuButton).toHaveAttribute('aria-expanded', 'true');
  await expect(navigation).toBeVisible();
  await expect(
    navigation.getByRole('link', { name: 'Home Current' }),
  ).toBeVisible();

  await page.keyboard.press('Escape');
  expect(
    await openMenuButton.evaluate(
      (button) => button === button.ownerDocument.activeElement,
    ),
  ).toBe(true);
  await expect(navigation).toBeHidden();

  const geometry = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
});

test('keeps representative UI baseline routes isolated from production', async ({
  page,
}, testInfo) => {
  await page.goto('/ui-baseline#/dashboard');
  await expect(
    page.getByRole('heading', { name: 'Décisions et performance' }),
  ).toBeVisible();

  await page.goto('/ui-baseline#/request/REQ-0280/validation');
  await expect(
    page.getByRole('heading', { name: 'Fruct Moldova' }),
  ).toBeVisible();
  await expect(page.getByRole('banner')).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath(`baseline-request-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test('fails closed for a signed-out deterministic session and recovers the protected route', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('deterministic-auth-state') === null)
      sessionStorage.setItem('deterministic-auth-state', 'signed-out');
  });
  await page.goto('/protected-return-target?source=invitation');
  await expect(page.getByRole('alert')).toHaveText(
    'Sign in is required to access this workspace.',
  );
  await expect(page.getByRole('banner')).toHaveCount(0);

  await page.evaluate(() =>
    sessionStorage.setItem('deterministic-auth-state', 'signed-in'),
  );
  await page.route('**/api/access/current-actor', (route) =>
    route.fulfill({
      json: actorContextFixture,
    }),
  );
  await page.route('**/api/activity-log', (route) =>
    route.fulfill({ json: { events: [] } }),
  );
  await page.reload();
  await expect(page).toHaveURL(/\/protected-return-target\?source=invitation$/);
  await expect(
    page.getByRole('heading', { name: 'Welcome to PRISMA-PRIM Suite' }),
  ).toBeVisible();
});

test('shows a safe denial when the verified user has no active Workspace Membership', async ({
  page,
}) => {
  await page.route('**/api/access/current-actor', (route) =>
    route.fulfill({
      status: 403,
      json: { message: 'Forbidden', statusCode: 403 },
    }),
  );
  await page.goto('/');

  await expect(page.getByRole('alert')).toHaveText(
    'Your access to this workspace is inactive.',
  );
  await expect(page.getByRole('banner')).toHaveCount(0);
  await expect(page.getByText('PRISMA Workspace')).toHaveCount(0);
});

test('lets an authorized Workspace owner register and immediately view a Company', async ({
  page,
}, testInfo) => {
  await page.route('**/api/access/current-actor', (route) =>
    route.fulfill({ json: actorContextFixture }),
  );
  await page.route('**/api/activity-log', (route) =>
    route.fulfill({ json: { events: [] } }),
  );
  const company = {
    id: '00000000-0000-4000-8000-000000000010',
    workspaceId: actorContextFixture.workspaceId,
    displayName: 'North Star Consulting',
    status: 'active',
    createdAt: '2026-08-15T10:30:00.000Z',
    createdByInternalUserId: actorContextFixture.internalUserId,
  };
  let publicReadObserved = false;
  await page.route('**/api/companies', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ json: [] });
    }
    expect(route.request().method()).toBe('POST');
    expect(route.request().headers()['idempotency-key']).toBeTruthy();
    expect(route.request().postDataJSON()).toEqual({
      displayName: 'North Star Consulting',
    });
    await route.fulfill({ status: 201, json: company });
  });
  await page.route(`**/api/companies/${company.id}`, async (route) => {
    publicReadObserved = true;
    await route.fulfill({ json: company });
  });
  await page.goto('/');

  await page.getByLabel('Company display name').fill('North Star Consulting');
  await page.getByRole('button', { name: 'Register Company' }).click();

  await expect(
    page.getByRole('heading', { name: 'North Star Consulting' }),
  ).toBeVisible();
  await expect(page.getByText('Active', { exact: true })).toBeVisible();
  await expect(page.getByText('Registered by Ada Ionescu')).toBeVisible();
  expect(publicReadObserved).toBe(true);
  const geometry = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  await page.screenshot({
    path: testInfo.outputPath(
      `company-registration-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
});

test('shows a safe Company-administration denial without exposing a registration form', async ({
  page,
}) => {
  await page.route('**/api/access/current-actor', (route) =>
    route.fulfill({
      json: { ...actorContextFixture, workspacePermissions: [] },
    }),
  );
  await page.route('**/api/activity-log', (route) =>
    route.fulfill({ json: { events: [] } }),
  );
  await page.goto('/');

  await expect(
    page.getByText(
      'You do not have permission to register or view Companies in this Workspace.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByLabel('Company display name')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Register Company' }),
  ).toHaveCount(0);
});

test('selects and restores one server-validated Company context', async ({
  page,
}, testInfo) => {
  const companies = [
    {
      id: '00000000-0000-4000-8000-000000000010',
      workspaceId: actorContextFixture.workspaceId,
      displayName: 'Atlas Assurance',
      status: 'active',
      createdAt: '2026-08-15T10:30:00.000Z',
      createdByInternalUserId: actorContextFixture.internalUserId,
    },
    {
      id: '00000000-0000-4000-8000-000000000011',
      workspaceId: actorContextFixture.workspaceId,
      displayName: 'North Star Consulting',
      status: 'active',
      createdAt: '2026-08-15T10:35:00.000Z',
      createdByInternalUserId: actorContextFixture.internalUserId,
    },
  ];
  const validatedSelections: string[] = [];
  await page.route('**/api/access/current-actor', (route) => {
    const selectedId = route.request().headers()['x-company-context-id'];
    if (selectedId) validatedSelections.push(selectedId);
    const activeCompany = companies.find(
      (company) => company.id === selectedId,
    );
    return route.fulfill({
      json: activeCompany
        ? {
            ...actorContextFixture,
            activeCompany: {
              id: activeCompany.id,
              displayName: activeCompany.displayName,
            },
          }
        : actorContextFixture,
    });
  });
  await page.route('**/api/companies', (route) => {
    expect(route.request().method()).toBe('GET');
    return route.fulfill({ json: companies });
  });
  await page.route('**/api/activity-log', (route) =>
    route.fulfill({ json: { events: [] } }),
  );

  await page.goto('/');
  const companyContext = page.getByRole('region', {
    name: 'Company context',
  });
  await expect(companyContext.getByText('PRISMA Workspace')).toBeVisible();
  await expect(companyContext.getByText('Select a Company')).toBeVisible();

  await companyContext
    .getByLabel('Active Company')
    .selectOption(companies[1]!.id);
  await expect(
    companyContext.locator('dd').filter({ hasText: 'North Star Consulting' }),
  ).toBeVisible();
  expect(validatedSelections).toContain(companies[1]!.id);
  await expect
    .poll(() =>
      page.evaluate(
        (key) => localStorage.getItem(key),
        companyContextStorageKey(),
      ),
    )
    .toBe(companies[1]!.id);

  await companyContext
    .getByLabel('Active Company')
    .selectOption(companies[0]!.id);
  await expect(
    companyContext.locator('dd').filter({ hasText: 'Atlas Assurance' }),
  ).toBeVisible();
  expect(validatedSelections).toContain(companies[0]!.id);
  await expect
    .poll(() =>
      page.evaluate(
        (key) => localStorage.getItem(key),
        companyContextStorageKey(),
      ),
    )
    .toBe(companies[0]!.id);

  await page.reload();
  await expect(
    companyContext.locator('dd').filter({ hasText: 'Atlas Assurance' }),
  ).toBeVisible();
  expect(
    validatedSelections.filter((id) => id === companies[0]!.id),
  ).toHaveLength(2);

  const geometry = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  await page.screenshot({
    path: testInfo.outputPath(`company-context-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test('shows clear zero and one active Company states', async ({ page }) => {
  const onlyCompany = {
    id: '00000000-0000-4000-8000-000000000012',
    workspaceId: actorContextFixture.workspaceId,
    displayName: 'Only Provider',
    status: 'active',
    createdAt: '2026-08-15T10:40:00.000Z',
    createdByInternalUserId: actorContextFixture.internalUserId,
  };
  let companies: (typeof onlyCompany)[] = [];
  let soleCompanyValidated = false;
  await page.route('**/api/access/current-actor', (route) => {
    const selectedId = route.request().headers()['x-company-context-id'];
    if (selectedId === onlyCompany.id) soleCompanyValidated = true;
    return route.fulfill({
      json:
        selectedId === onlyCompany.id
          ? {
              ...actorContextFixture,
              activeCompany: {
                id: onlyCompany.id,
                displayName: onlyCompany.displayName,
              },
            }
          : actorContextFixture,
    });
  });
  await page.route('**/api/companies', (route) =>
    route.fulfill({ json: companies }),
  );
  await page.route('**/api/activity-log', (route) =>
    route.fulfill({ json: { events: [] } }),
  );

  await page.goto('/');
  const companyContext = page.getByRole('region', {
    name: 'Company context',
  });
  await expect(
    companyContext.getByText(
      'No active Companies are available. Register a Company before choosing a context.',
    ),
  ).toBeVisible();
  await expect(companyContext.getByLabel('Active Company')).toHaveCount(0);

  companies = [onlyCompany];
  await page.reload();
  await expect(companyContext.getByLabel('Active Company')).toHaveValue(
    onlyCompany.id,
  );
  await expect(
    companyContext.locator('dd').filter({ hasText: 'Only Provider' }),
  ).toBeVisible();
  expect(soleCompanyValidated).toBe(true);
});

test('does not share a saved Company context between Workspace members', async ({
  page,
}) => {
  const company = {
    id: '00000000-0000-4000-8000-000000000014',
    displayName: 'Member-specific Provider',
  };
  const otherCompany = {
    id: '00000000-0000-4000-8000-000000000015',
    displayName: 'Other Provider',
  };
  let actor = actorContextFixture;
  const secondMembershipSelections: string[] = [];
  await page.route('**/api/access/current-actor', (route) => {
    const selectedId = route.request().headers()['x-company-context-id'];
    if (
      selectedId &&
      actor.workspaceMembershipId === '00000000-0000-4000-8000-000000000020'
    ) {
      secondMembershipSelections.push(selectedId);
    }
    return route.fulfill({
      json:
        selectedId === company.id
          ? { ...actor, activeCompany: company }
          : actor,
    });
  });
  await page.route('**/api/companies', (route) =>
    route.fulfill({ json: [company, otherCompany] }),
  );
  await page.route('**/api/activity-log', (route) =>
    route.fulfill({ json: { events: [] } }),
  );

  await page.goto('/');
  await page.getByLabel('Active Company').selectOption(company.id);
  await expect(page.getByLabel('Active Company')).toHaveValue(company.id);

  actor = {
    ...actorContextFixture,
    internalUserId: '00000000-0000-4000-8000-000000000019',
    workspaceMembershipId: '00000000-0000-4000-8000-000000000020',
    displayName: 'Second Workspace Owner',
    email: 'second-owner@example.test',
  };
  await page.reload();

  await expect(page.getByLabel('Active Company')).toHaveValue('');
  expect(secondMembershipSelections).toEqual([]);
});

test('clears a stale persisted Company and recovers through safe reselection', async ({
  page,
}) => {
  const staleCompanyId = '00000000-0000-4000-8000-000000000099';
  const availableCompany = {
    id: '00000000-0000-4000-8000-000000000013',
    workspaceId: actorContextFixture.workspaceId,
    displayName: 'Recovery Provider',
    status: 'active',
    createdAt: '2026-08-15T10:45:00.000Z',
    createdByInternalUserId: actorContextFixture.internalUserId,
  };
  const staleCompany = {
    ...availableCompany,
    id: staleCompanyId,
    displayName: 'Deactivated Provider',
  };
  const storageKey = companyContextStorageKey();
  await page.addInitScript(
    ({ key, staleId }) => localStorage.setItem(key, staleId),
    { key: storageKey, staleId: staleCompanyId },
  );
  await page.route('**/api/access/current-actor', (route) => {
    const selectedId = route.request().headers()['x-company-context-id'];
    if (selectedId === staleCompanyId) {
      return route.fulfill({
        status: 403,
        json: { message: 'Forbidden', statusCode: 403 },
      });
    }
    return route.fulfill({
      json:
        selectedId === availableCompany.id
          ? {
              ...actorContextFixture,
              activeCompany: {
                id: availableCompany.id,
                displayName: availableCompany.displayName,
              },
            }
          : actorContextFixture,
    });
  });
  await page.route('**/api/companies', (route) => {
    if (route.request().method() === 'POST') {
      expect(route.request().headers()['x-company-context-id']).toBe(
        availableCompany.id,
      );
      return route.fulfill({
        status: 403,
        json: { message: 'Forbidden', statusCode: 403 },
      });
    }
    return route.fulfill({ json: [staleCompany, availableCompany] });
  });
  await page.route('**/api/activity-log', (route) =>
    route.fulfill({ json: { events: [] } }),
  );

  await page.goto('/');
  const companyContext = page.getByRole('region', {
    name: 'Company context',
  });
  await expect(companyContext.getByRole('alert')).toHaveText(
    'Your previous Company context is no longer available. Choose an active Company.',
  );
  await expect(
    companyContext.getByRole('option', { name: 'Deactivated Provider' }),
  ).toHaveCount(0);
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), storageKey))
    .toBeNull();

  await companyContext
    .getByLabel('Active Company')
    .selectOption(availableCompany.id);
  await expect(
    companyContext.locator('dd').filter({ hasText: 'Recovery Provider' }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), storageKey))
    .toBe(availableCompany.id);

  await page
    .getByLabel('Company display name')
    .fill('Blocked by stale context');
  await page.getByRole('button', { name: 'Register Company' }).click();
  await expect(companyContext.getByLabel('Active Company')).toHaveCount(0);
  await expect(companyContext.getByRole('alert')).toHaveText(
    'Your previous Company context is no longer available. Choose an active Company.',
  );
  await expect(
    companyContext.getByText(
      'No active Companies are available. Register a Company before choosing a context.',
    ),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), storageKey))
    .toBeNull();
});

function companyContextStorageKey(): string {
  return `prisma-prim.company-context:${actorContextFixture.workspaceId}:${actorContextFixture.workspaceMembershipId}`;
}
