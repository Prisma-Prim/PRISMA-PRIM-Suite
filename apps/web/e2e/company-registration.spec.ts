import { expectValue, selectOption } from './select-option';
import { expect, test, type Page, type Route } from '@playwright/test';
import { actorContextFixture } from './actor-context.fixture';

const company = {
  id: '00000000-0000-4000-8000-000000000269',
  workspaceId: actorContextFixture.workspaceId,
  displayName: 'First Provider Company',
  status: 'active',
  createdAt: '2026-09-19T17:00:00.000Z',
  createdByInternalUserId: actorContextFixture.internalUserId,
};

test('registers, reads and server-activates the first Company after an exact uncertain retry', async ({
  page,
}, testInfo) => {
  const commands: Array<{ body: string | null; idempotencyKey: string }> = [];
  let firstRegistration: Route | undefined;
  let authoritativeRead: Route | undefined;
  let pendingSelection: Route | undefined;
  let created = false;

  await page.route('**/api/access/current-actor', (route) => {
    const selectedCompany = route.request().headers()['x-company-context-id'];
    if (selectedCompany === company.id) {
      pendingSelection = route;
      return;
    }
    return route.fulfill({ json: actorContextFixture });
  });
  await page.route('**/api/activity-log', (route) =>
    route.fulfill({ json: { events: [] } }),
  );
  await page.route('**/api/companies', (route) => {
    const request = route.request();
    if (request.method() === 'GET')
      return route.fulfill({ json: created ? [company] : [] });
    const command = {
      body: request.postData(),
      idempotencyKey: request.headers()['idempotency-key'] ?? '',
    };
    expect(command.idempotencyKey).not.toBe('');
    commands.push(command);
    if (commands.length === 1) {
      firstRegistration = route;
      return;
    }
    created = true;
    return route.fulfill({
      status: 201,
      json: { ...company, displayName: 'Unconfirmed Company' },
    });
  });
  await page.route(`**/api/companies/${company.id}`, (route) => {
    authoritativeRead = route;
  });

  await page.goto('/?frame=prisme#companies');
  const registration = page.getByRole('region', {
    name: 'Provider Company',
  });
  await expect(registration).toHaveClass(/company-registration--prisme/);
  expect(
    await registration
      .getByRole('heading', { name: 'Provider Company' })
      .evaluate((element) => getComputedStyle(element).fontFamily),
  ).toContain('Manrope');
  const submit = registration.getByRole('button', {
    name: 'Register Company',
  });
  await submit.focus();
  await expect(submit).toBeFocused();
  expect(
    await submit.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).toBe('solid');

  await submit.click();
  await expect(registration.getByRole('alert')).toHaveText(
    'Company display name is required.',
  );
  expect(commands).toHaveLength(0);

  await registration
    .getByLabel('Company display name')
    .fill('  First Provider Company  ');
  await submit.click();
  await expect(
    registration.getByRole('button', { name: 'Registering…' }),
  ).toBeDisabled();
  await expect.poll(() => Boolean(firstRegistration)).toBe(true);
  if (!firstRegistration) throw new Error('Expected pending registration');
  await firstRegistration.fulfill({ status: 503 });
  await expect(registration.getByRole('alert')).toContainText('retried safely');

  await submit.click();
  await expect.poll(() => Boolean(authoritativeRead)).toBe(true);
  expect(commands).toHaveLength(2);
  expect(commands[0]).toEqual(commands[1]);
  expect(commands[0]?.body).toBe(
    JSON.stringify({ displayName: company.displayName }),
  );
  await expect(
    registration.getByRole('heading', { name: company.displayName }),
  ).toHaveCount(0);
  if (!authoritativeRead) throw new Error('Expected authoritative read');
  await authoritativeRead.fulfill({ json: company });

  await expect(
    registration.getByRole('heading', { name: company.displayName }),
  ).toBeVisible();
  await expect(registration.getByText('Active', { exact: true })).toBeVisible();
  await expect(
    registration.getByText('Registered by Ada Ionescu'),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(
      `company-registration-ready-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });

  await openNavigationAtNarrowViewport(page, testInfo.project.name);
  const selector = page.getByLabel('Active Company', { exact: true });
  await expect(
    selector.getByRole('option', { name: company.displayName }),
  ).toHaveCount(1);
  await selectOption(selector, company.id);
  await expect.poll(() => Boolean(pendingSelection)).toBe(true);
  await expect(page.locator('.prisme-breadcrumb')).not.toContainText(
    company.displayName,
  );
  if (!pendingSelection) throw new Error('Expected pending selection');
  await pendingSelection.fulfill({
    json: {
      ...actorContextFixture,
      activeCompany: {
        id: company.id,
        displayName: company.displayName,
      },
    },
  });
  await expectValue(selector, company.id);
  await expect(page.locator('.prisme-breadcrumb')).toContainText(
    company.displayName,
  );
  await closeNavigationAtNarrowViewport(page, testInfo.project.name);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(
      `company-registration-active-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
});

test('server-denied registration reveals no protected Company metadata', async ({
  page,
}, testInfo) => {
  const protectedCompany = {
    id: 'protected-company-id',
    displayName: 'Protected Company Name',
  };
  await page.route('**/api/access/current-actor', (route) =>
    route.fulfill({ json: actorContextFixture }),
  );
  await page.route('**/api/activity-log', (route) =>
    route.fulfill({ json: { events: [] } }),
  );
  await page.route('**/api/companies', (route) =>
    route.request().method() === 'POST'
      ? route.fulfill({
          status: 403,
          json: { message: 'Forbidden', ...protectedCompany },
        })
      : route.fulfill({ json: [] }),
  );

  await page.goto('/?frame=prisme#companies');
  const registration = page.getByRole('region', {
    name: 'Provider Company',
  });
  await registration
    .getByLabel('Company display name')
    .fill('Denied registration');
  await registration.getByRole('button', { name: 'Register Company' }).click();
  await expect(registration.getByRole('alert')).toHaveText(
    'You do not have permission to register or view Companies in this Workspace.',
  );
  await expect(page.getByText(protectedCompany.displayName)).toHaveCount(0);
  await expect(page.getByText(protectedCompany.id)).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(
      `company-registration-denied-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
});

async function openNavigationAtNarrowViewport(page: Page, project: string) {
  if (project === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
}

async function closeNavigationAtNarrowViewport(page: Page, project: string) {
  if (project === 'narrow')
    await page.getByRole('button', { name: 'Close navigation' }).click();
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
