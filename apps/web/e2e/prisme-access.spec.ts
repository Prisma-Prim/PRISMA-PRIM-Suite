import { expect, test, type Route } from '@playwright/test';
import { actorContextFixture } from './actor-context.fixture';

const companyA = { id: 'company-a', displayName: 'First authorized Company' };
const companyB = {
  id: 'company-b',
  displayName:
    'Second authorized Company with a deliberately long display name',
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/access/current-actor'))
      return route.fulfill({ json: actorContextFixture });
    if (path.endsWith('/activity-log'))
      return route.fulfill({ json: { events: [] } });
    return route.fulfill({ json: [] });
  });
});

test('keeps checking, denied, error and signed-out states outside the opt-in frame', async ({
  page,
}) => {
  let pendingActor: Route | undefined;
  await page.route('**/api/access/current-actor', (route) => {
    pendingActor = route;
  });
  await page.goto('/?frame=prisme');
  await expect(page.getByRole('status')).toHaveText('Verifying your access…');
  await expect(page.getByRole('banner')).toHaveCount(0);
  await expect.poll(() => Boolean(pendingActor)).toBe(true);
  if (!pendingActor) throw new Error('Expected pending admission');
  await pendingActor.fulfill({ status: 403 });
  await expect(page.getByRole('alert')).toHaveText(
    'Your access to this workspace is inactive.',
  );
  await expect(page.getByRole('banner')).toHaveCount(0);
  await page.route('**/api/access/current-actor', (route) =>
    route.fulfill({ status: 503 }),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toHaveText(
    'We could not verify your access. Please try again.',
  );
  await expect(
    page.getByRole('button', { name: 'Use classic frame' }),
  ).toHaveCount(0);
  await page.evaluate(() =>
    sessionStorage.setItem('deterministic-auth-state', 'signed-out'),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toHaveText(
    'Sign in is required to access this workspace.',
  );
  await expect(page.getByRole('banner')).toHaveCount(0);
});

test('exposes invitations independently of administration and refuses unauthorized fragments', async ({
  page,
}, testInfo) => {
  await page.route('**/api/access/current-actor', (route) =>
    route.fulfill({
      json: { ...actorContextFixture, workspacePermissions: ['member.invite'] },
    }),
  );
  await page.route('**/api/workspace-invitations**', (route) =>
    route.fulfill({ json: { invitations: [], nextCursor: null } }),
  );
  await page.goto('/?frame=prisme#access');
  await expect(
    page.getByRole('heading', { name: 'Hello, Ada Ionescu.' }),
  ).toBeVisible();
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  const navigation = page.getByRole('navigation', {
    name: 'Primary navigation',
  });
  await expect(
    navigation.getByRole('link', {
      name: /Clients|Companies|Team & access|Project|Task|Document/,
    }),
  ).toHaveCount(0);
  await navigation
    .getByRole('link', { name: 'Invitations', exact: true })
    .click();
  await expect(page.getByLabel('Recipient email')).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Send invitation' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Workspace invitations' }),
  ).toBeVisible();
});

test('revalidates a sole Company, drops a stale preference and recovers from revoked access', async ({
  page,
}, testInfo) => {
  let companies: (typeof companyA)[] = [];
  let revoked = false;
  let validations = 0;
  await page.route('**/api/companies', (route) => {
    if (route.request().method() === 'POST') {
      revoked = true;
      return route.fulfill({ status: 403 });
    }
    return route.fulfill({ json: companies });
  });
  await page.route('**/api/access/current-actor', (route) => {
    const selected = route.request().headers()['x-company-context-id'];
    if (selected && revoked) return route.fulfill({ status: 403 });
    if (selected === companyA.id) validations++;
    return route.fulfill({
      json: {
        ...actorContextFixture,
        ...(selected === companyA.id ? { activeCompany: companyA } : {}),
      },
    });
  });
  await page.goto('/?frame=prisme#companies');
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  const context = page.getByRole('region', { name: 'Company context' });
  await expect(
    context.getByText(
      'No active Companies are available. Register a Company before choosing a context.',
    ),
  ).toBeVisible();
  companies = [companyA];
  await page.reload();
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByLabel('Active Company', { exact: true })).toHaveValue(
    companyA.id,
  );
  expect(validations).toBeGreaterThan(0);
  revoked = true;
  companies = [companyA, companyB];
  await page.reload();
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(context.getByRole('alert')).toHaveText(
    'Your previous Company context is no longer available. Choose an active Company.',
  );
  await expect(
    context.getByRole('option', { name: companyA.displayName }),
  ).toHaveCount(0);
  revoked = false;
  await page
    .getByLabel('Active Company', { exact: true })
    .selectOption(companyB.id);
  // The server decides the active context; an unconfirmed selection must not be displayed as active.
  await expect(page.locator('.prisme-breadcrumb')).not.toContainText(
    companyB.displayName,
  );
  companies = [companyA];
  await page.reload();
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByLabel('Active Company', { exact: true })).toHaveValue(
    companyA.id,
  );
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Close navigation' }).click();
  await page
    .getByLabel('Company display name')
    .fill('Rejected after revocation');
  await page.getByRole('button', { name: 'Register Company' }).click();
  await expect(page.locator('.prisme-breadcrumb')).toContainText(
    'No active Company',
  );
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(context.getByRole('alert')).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(
      `prisme-access-recovery-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
});

test('discards a late previous-Company result and removes the frame on logout', async ({
  page,
}, testInfo) => {
  let pendingRegistration: Route | undefined;
  const actor = {
    ...actorContextFixture,
    workspaceName: 'A Workspace with a deliberately long descriptive name',
    displayName: 'A member with a deliberately long display name',
  };
  await page.route('**/api/access/current-actor', (route) => {
    const selected = route.request().headers()['x-company-context-id'];
    const company = [companyA, companyB].find((item) => item.id === selected);
    return route.fulfill({
      json: { ...actor, ...(company ? { activeCompany: company } : {}) },
    });
  });
  await page.route('**/api/companies', (route) => {
    if (route.request().method() === 'POST') {
      pendingRegistration = route;
      return;
    }
    return route.fulfill({ json: [companyA, companyB] });
  });
  await page.goto('/?frame=prisme#companies');
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  const selector = page.getByLabel('Active Company', { exact: true });
  await selector.selectOption(companyA.id);
  await expect(selector).toHaveValue(companyA.id);
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Close navigation' }).click();
  await page.getByLabel('Company display name').fill('Delayed private result');
  await page.getByRole('button', { name: 'Register Company' }).click();
  await expect.poll(() => Boolean(pendingRegistration)).toBe(true);
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selector.selectOption(companyB.id);
  await expect(selector).toHaveValue(companyB.id);
  if (!pendingRegistration) throw new Error('Expected pending registration');
  await pendingRegistration.fulfill({ status: 403 });
  await expect(page.locator('.prisme-breadcrumb')).toContainText(
    companyB.displayName,
  );
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Close navigation' }).click();
  await expect(page.getByLabel('Company display name')).toHaveValue('');
  await expect(
    page.getByRole('button', { name: 'Register Company' }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath(`prisme-long-names-${testInfo.project.name}.png`),
    fullPage: true,
  });
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Sign in is required to access this workspace.',
  );
  await expect(page.getByRole('banner')).toHaveCount(0);
});

test('retains the accepted Workspace after Prisme navigation and refresh when storage is unavailable', async ({
  page,
}, testInfo) => {
  const invitationId = '00000000-0000-4000-8000-000000000229';
  const actor = { ...actorContextFixture, workspacePermissions: [] };
  await page.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem']) {
      const original = Storage.prototype[method];
      Object.defineProperty(Storage.prototype, method, {
        configurable: true,
        value(key: string, ...values: string[]) {
          if (key.startsWith('prisma'))
            throw new DOMException('Storage unavailable', 'SecurityError');
          return original.call(this, key, ...values);
        },
      });
    }
  });
  await page.route('**/api/access/invitations/accept', (route) =>
    route.fulfill({
      status: 201,
      json: {
        invitationId,
        workspaceId: actor.workspaceId,
        internalUserId: actor.internalUserId,
        workspaceMembershipId: actor.workspaceMembershipId,
        acceptedAt: '2026-09-19T00:00:00.000Z',
      },
    }),
  );
  await page.route('**/api/access/current-actor', (route) => {
    if (
      route.request().headers()['x-workspace-context-id'] !== actor.workspaceId
    )
      return route.fulfill({ status: 403 });
    return route.fulfill({ json: actor });
  });
  await page.goto('/accept-invitation?invitation=' + invitationId);
  await page.getByRole('button', { name: 'Accept invitation' }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome to PRISMA-PRIM Suite' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Try Prisme' }).click();
  await page
    .locator('.prisme-capabilities')
    .getByRole('link', { name: /Activity Log/ })
    .click();
  await expect(page.locator('#prisme-page-title')).toHaveText('Activity Log');
  await page.reload();
  await expect(page.locator('#prisme-page-title')).toHaveText('Activity Log');
  await expect(page.locator('.prisme-breadcrumb')).toContainText(
    actor.workspaceName,
  );
  const navigation = page.getByRole('navigation', {
    name: 'Primary navigation',
  });
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await navigation.getByRole('link', { name: 'Overview', exact: true }).click();
  await expect(page.locator('#prisme-page-title')).toHaveText(
    'Hello, Ada Ionescu.',
  );
  await page.goBack();
  await expect(page.locator('#prisme-page-title')).toHaveText('Activity Log');
  await page.goForward();
  await expect(page.locator('#prisme-page-title')).toHaveText(
    'Hello, Ada Ionescu.',
  );
  await page.reload();
  await expect(page.locator('#prisme-page-title')).toHaveText(
    'Hello, Ada Ionescu.',
  );
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await navigation
    .getByRole('link', { name: 'PRISMA-PRIM Suite home' })
    .click();
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await navigation
    .getByRole('link', { name: 'Activity Log', exact: true })
    .click();
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Use classic frame' }).click();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Welcome to PRISMA-PRIM Suite' }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Company context' }),
  ).toContainText(actor.workspaceName);
  await page.getByRole('button', { name: 'Try Prisme' }).click();
  await expect(page.locator('#prisme-page-title')).toHaveText('Activity Log');
  await page.screenshot({
    path: testInfo.outputPath(
      `prisme-invitation-recovery-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
});
test('keeps modifier and middle clicks as native new-tab navigation', async ({
  page,
  context,
}) => {
  await context.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/access/current-actor'))
      return route.fulfill({ json: actorContextFixture });
    if (path.endsWith('/activity-log'))
      return route.fulfill({ json: { events: [] } });
    return route.fulfill({ json: [] });
  });
  await page.goto('/?frame=prisme');
  const companies = page
    .locator('.prisme-capabilities')
    .getByRole('link', { name: /Companies/ });
  await expect(companies).toBeVisible();
  const initialUrl = page.url();
  for (const gesture of ['modifier', 'middle']) {
    const opened = context.waitForEvent('page');
    if (gesture === 'modifier')
      await companies.click({ modifiers: ['ControlOrMeta'] });
    else await companies.click({ button: 'middle' });
    const nextPage = await opened;
    await expect(nextPage).toHaveURL(/frame=prisme#companies$/);
    await expect(nextPage.getByLabel('Company display name')).toBeVisible();
    await expect(page).toHaveURL(initialUrl);
    await nextPage.close();
  }
});
