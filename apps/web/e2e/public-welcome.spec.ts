import { expect, test } from '@playwright/test';
import { actorContextFixture } from './actor-context.fixture';

test('invited visitors reach sign-in from a focused public welcome', async ({
  page,
}, testInfo) => {
  let protectedRequests = 0;
  await page.addInitScript(() => {
    sessionStorage.setItem('deterministic-auth-state', 'signed-out');
  });
  await page.route('**/api/**', (route) => {
    protectedRequests += 1;
    return route.fulfill({ status: 500 });
  });

  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Make every decision traceable.' }),
  ).toBeVisible();
  await expect(page.getByText('Access is invitation-only.')).toBeVisible();
  await expect(page.getByRole('link', { name: /sign up/i })).toHaveCount(0);
  expect(protectedRequests).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.keyboard.press('Tab');
  const language = page.getByRole('combobox', { name: 'Interface language' });
  await expect(language).toBeFocused();
  expect(
    await language.evaluate(
      (element) => getComputedStyle(element).outlineStyle,
    ),
  ).not.toBe('none');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(language).toBeFocused();
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await page.keyboard.press('Tab');
  const signIn = page.getByRole('link', { name: 'Continue to sign in' });
  await expect(signIn).toBeFocused();
  expect(
    await signIn.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).not.toBe('none');
  await page.screenshot({
    path: testInfo.outputPath('public-welcome.png'),
    fullPage: true,
  });

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole('alert')).toHaveText(
    'Sign in is required to access this workspace.',
  );
  expect(protectedRequests).toBe(0);
});

test('authenticated members enter the protected application directly', async ({
  page,
}) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('deterministic-auth-state', 'signed-in');
  });
  await page.route('**/api/access/current-actor', (route) =>
    route.fulfill({
      json: {
        ...actorContextFixture,
        workspacePermissions: [],
      },
    }),
  );
  await page.route('**/api/companies', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/activity-log', (route) =>
    route.fulfill({ json: { events: [] } }),
  );

  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Hello, Ada Ionescu.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Make every decision traceable.' }),
  ).toHaveCount(0);
});
