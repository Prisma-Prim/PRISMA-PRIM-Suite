import { expect, test } from '@playwright/test';
import { actorContextFixture } from './actor-context.fixture';

test('opts into Prisme, switches authorized Company and opens Clients', async ({
  page,
}, testInfo) => {
  const companies = [
    { id: '00000000-0000-4000-8000-000000000226', displayName: 'PRISMA-PRIM' },
    { id: '00000000-0000-4000-8000-000000000227', displayName: 'BIC' },
  ].map((company) => ({
    ...company,
    workspaceId: actorContextFixture.workspaceId,
    status: 'active',
    createdAt: '2026-09-18T09:00:00.000Z',
    createdByInternalUserId: actorContextFixture.internalUserId,
  }));
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const companyId = request.headers()['x-company-context-id'];
    expect(request.method()).toBe('GET');
    if (path.endsWith('/access/current-actor')) {
      const company = companies.find((item) => item.id === companyId);
      return route.fulfill({
        json: {
          ...actorContextFixture,
          workspacePermissions: ['company.manage', 'client.manage'],
          ...(company ? { activeCompany: company } : {}),
        },
      });
    }
    if (path.endsWith('/companies')) return route.fulfill({ json: companies });
    if (path.endsWith('/activity-log'))
      return route.fulfill({ json: { events: [] } });
    if (path.endsWith('/clients'))
      return route.fulfill({
        json:
          companyId === companies[1]?.id
            ? [
                {
                  id: 'client-226',
                  displayName: 'Contract Client',
                  relatedToActiveCompany: true,
                },
              ]
            : [],
      });
    return route.fulfill({ status: 404 });
  });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Try Prisme' }).click();
  await expect(page).toHaveURL(/frame=prisme/);
  await expect(
    page.getByRole('heading', { name: 'Hello, Ada Ionescu.' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Reduced motion' }),
  ).toBeDisabled();
  await expect(page.locator('.fiber-motion')).toHaveAttribute(
    'data-motion-state',
    'still',
  );

  expect(
    await page.evaluate(async () => {
      const families = await Promise.all([
        document.fonts.load('550 16px Manrope'),
        document.fonts.load('400 14px "DM Sans"'),
      ]);
      return families.every(
        (fonts) =>
          fonts.length > 0 && fonts.every((font) => font.status === 'loaded'),
      );
    }),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath(`prisme-overview-${testInfo.project.name}.png`),
    fullPage: true,
  });
  const navigation = page.getByRole('navigation', {
    name: 'Primary navigation',
  });
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByLabel('Active Company', { exact: true })
    .selectOption('00000000-0000-4000-8000-000000000227');
  await expect(page.getByLabel('Active Company', { exact: true })).toHaveValue(
    '00000000-0000-4000-8000-000000000227',
  );
  await navigation.getByRole('link', { name: 'Clients', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Clients' })).toBeVisible();
  await expect(
    page.getByText('Contract Client', { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath(`prisme-clients-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test('keeps registration retries, section selection and focus across presentation changes', async ({
  page,
}, testInfo) => {
  const commands: string[] = [];
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/access/current-actor'))
      return route.fulfill({ json: actorContextFixture });
    if (path.endsWith('/activity-log'))
      return route.fulfill({ json: { events: [] } });
    if (path.endsWith('/companies') && request.method() === 'POST') {
      const key = request.headers()['idempotency-key'];
      expect(key).toBeTruthy();
      if (key) commands.push(key);
      return route.fulfill({ status: 503 });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto('/?source=preserved&frame=prisme#companies');
  const name = page.getByLabel('Company display name');
  await name.fill('Company draft');
  await page.getByRole('button', { name: 'Register Company' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Use classic frame' }).click();
  await expect(page).toHaveURL(/\?source=preserved#companies$/);
  await expect(name).toHaveValue('Company draft');
  await page.getByRole('button', { name: 'Try Prisme' }).click();
  await expect(name).toHaveValue('Company draft');
  await page.getByRole('button', { name: 'Register Company' }).click();
  await expect.poll(() => commands.length).toBe(2);
  expect(commands[0]).toBe(commands[1]);
  const skip = page.getByRole('link', { name: 'Skip to content' });
  await skip.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#companies$/);
  const title = page.getByRole('heading', { name: 'Companies', exact: true });
  await expect(title).toBeFocused();
  expect(
    await page.evaluate(async () => {
      const families = await Promise.all([
        document.fonts.load('550 16px Manrope'),
        document.fonts.load('400 14px "DM Sans"'),
      ]);
      return families.every(
        (fonts) =>
          fonts.length > 0 && fonts.every((font) => font.status === 'loaded'),
      );
    }),
  ).toBe(true);
  const navigation = page.getByRole('navigation', {
    name: 'Primary navigation',
  });
  if (testInfo.project.name === 'narrow') {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Open navigation' }),
    ).toBeFocused();
    await page.getByRole('button', { name: 'Open navigation' }).click();
  }
  await navigation
    .getByRole('link', { name: 'Companies', exact: true })
    .click();
  await expect(title).toBeFocused();
  await expect(name).toHaveValue('Company draft');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
