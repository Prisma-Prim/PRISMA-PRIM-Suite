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
  await expect(page.getByText('PRISMA Workspace')).toBeVisible();
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

  await expect(page.getByRole('alert')).toHaveText(
    'You do not have permission to register or view Companies in this Workspace.',
  );
  await expect(page.getByLabel('Company display name')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Register Company' }),
  ).toHaveCount(0);
});
