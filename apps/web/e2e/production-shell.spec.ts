import { expect, test } from '@playwright/test';

test('renders the production shell at the normal application entry point', async ({
  page,
}, testInfo) => {
  await page.route('**/api/access/current-actor', (route) => {
    expect(route.request().headers()).toMatchObject({
      'x-test-external-provider': 'local-demo',
      'x-test-external-subject': 'local-demonstration-user',
    });
    return route.fulfill({
      json: {
        displayName: 'Ada Ionescu',
        email: 'ada@example.test',
        workspaceName: 'PRISMA Workspace',
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
  await expect(page.getByText('Ada Ionescu')).toBeVisible();
  await expect(page.getByText('ada@example.test')).toBeVisible();
  await expect(page.getByText('PRISMA Workspace')).toBeVisible();

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
      json: {
        displayName: 'Ada Ionescu',
        email: 'ada@example.test',
        workspaceName: 'PRISMA Workspace',
      },
    }),
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
      json: {
        displayName: 'Ada Ionescu',
        email: 'ada@example.test',
        workspaceName: 'PRISMA Workspace',
      },
    }),
  );
  await page.reload();
  await expect(page).toHaveURL(/\/protected-return-target\?source=invitation$/);
  await expect(
    page.getByRole('heading', { name: 'Welcome to PRISMA-PRIM Suite' }),
  ).toBeVisible();
});
