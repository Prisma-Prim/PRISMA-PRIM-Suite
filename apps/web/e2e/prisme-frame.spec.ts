import { expectValue, selectOption } from './select-option';
import { expect, test } from '@playwright/test';
import {
  actorContextFixture,
  operationalHomeFixture,
} from './actor-context.fixture';

test('opens retired frame links in Prisme', async ({ page }) => {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/access/current-actor'))
      return route.fulfill({ json: actorContextFixture });
    if (path.endsWith('/activity-log'))
      return route.fulfill({ json: { events: [] } });
    return route.fulfill({ json: [] });
  });

  for (const frame of ['classic', 'prisme']) {
    await page.goto(`/?source=preserved&frame=${frame}#companies`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Companies', exact: true }),
    ).toBeVisible();
    expect(new URL(page.url()).searchParams.get('source')).toBe('preserved');
    const menu = page.getByRole('button', { name: 'Open navigation' });
    if (await menu.isVisible()) await menu.click();
    await expect(
      page
        .getByRole('navigation', { name: 'Primary navigation' })
        .getByRole('link', { name: 'Companies', exact: true }),
    ).toHaveAttribute('aria-current', 'page');
    await page.screenshot({
      path: test.info().outputPath(`prisme-retired-${frame}-frame-link.png`),
      fullPage: true,
    });
  }
});

test('keeps every authorized MVP section reachable from the default frame', async ({
  page,
}) => {
  let context: 'operational' | 'administration' = 'operational';
  const company = { id: 'company-all-sections', displayName: 'PRISMA-PRIM' };
  await page.addInitScript(
    ({ key, companyId }) => {
      if (sessionStorage.getItem('mvp-section-context') !== 'administration')
        localStorage.setItem(key, companyId);
    },
    {
      key: `prisma-prim.company-context:${actorContextFixture.workspaceId}:${actorContextFixture.workspaceMembershipId}`,
      companyId: company.id,
    },
  );
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/access/current-actor'))
      return route.fulfill({
        json: {
          ...actorContextFixture,
          workspacePermissions:
            context === 'operational'
              ? ['client.manage']
              : [
                  'company.manage',
                  'company.assignment.manage',
                  'member.invite',
                ],
          ...(context === 'operational' &&
          request.headers()['x-company-context-id'] === company.id
            ? {
                activeCompany: {
                  ...company,
                  clientPermissions: ['client.read'],
                  projectPermissions: ['project.read'],
                  documentPermissions: ['document.read'],
                },
              }
            : {}),
        },
      });
    if (path.endsWith('/companies'))
      return route.fulfill({
        json: context === 'operational' ? [company] : [],
      });
    if (path.endsWith('/activity-log'))
      return route.fulfill({ json: { events: [] } });
    if (context === 'operational' && path.endsWith('/operational-home'))
      return route.fulfill({
        json: operationalHomeFixture(company.id, {
          active_clients: 0,
          open_projects: 0,
        }),
      });
    if (
      context === 'operational' &&
      (path.endsWith('/clients') ||
        path.endsWith('/projects') ||
        path.endsWith('/documents'))
    )
      return route.fulfill({ json: [] });
    if (path.endsWith('/company-context-assignments/administration'))
      return route.fulfill({
        json: { members: [], companies: [], assignments: [] },
      });
    if (path.endsWith('/workspace-invitations'))
      return route.fulfill({
        json: { invitations: [], nextCursor: null },
      });
    return route.fulfill({ status: 404 });
  });

  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Hello, Ada Ionescu.' }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      page
        .locator('#primary-navigation a')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
    )
    .toEqual([
      '#overview',
      '#overview',
      '#documents',
      '#clients',
      '#projects',
      '#activity',
    ]);

  context = 'administration';
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('prisma-prim.interface-locale', 'en');
    sessionStorage.setItem('mvp-section-context', 'administration');
  });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Hello, Ada Ionescu.' }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      page
        .locator('#primary-navigation a')
        .evaluateAll((links) => links.map((link) => link.getAttribute('href'))),
    )
    .toEqual([
      '#overview',
      '#overview',
      '#access',
      '#companies',
      '#activity',
      '#invitations',
    ]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test('opens authenticated members in Prisme, switches authorized Company and opens Clients', async ({
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
    if (path.endsWith('/operational-home') && companyId)
      return route.fulfill({
        json: operationalHomeFixture(companyId, {
          active_clients: companyId === companies[1]?.id ? 1 : 0,
        }),
      });
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
  await expect(page).toHaveURL(/\/$/);
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
  await selectOption(
    page.getByLabel('Active Company', { exact: true }),
    '00000000-0000-4000-8000-000000000227',
  );
  await expectValue(
    page.getByLabel('Active Company', { exact: true }),
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

test('keeps registration retries, section selection and focus', async ({
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
  await page.goto('/?source=preserved#companies');
  await page.evaluate(() =>
    history.replaceState({ workspaceRecovery: 'opaque' }, '', location.href),
  );
  const name = page.getByLabel('Company display name');
  await name.fill('Company draft');
  await page.getByRole('button', { name: 'Register Company' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\?source=preserved#companies$/);
  await expectValue(name, 'Company draft');
  expect(await page.evaluate(() => history.state)).toEqual({
    workspaceRecovery: 'opaque',
  });
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
  await expectValue(name, 'Company draft');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
