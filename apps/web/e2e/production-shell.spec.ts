import { expectValue, openSelect, selectOption } from './select-option';
import { expect, test, type Route } from '@playwright/test';
import type { ActorContext } from '../src/access-types';
import {
  actorContextFixture,
  operationalHomeFixture,
} from './actor-context.fixture';

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
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(navigation).toBeVisible();
  } else {
    await expect(navigation).toBeVisible();
  }
  await expect(page.getByRole('main')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Hello, Ada Ionescu.' }),
  ).toBeVisible();
  await expect(page.getByText('Ada Ionescu', { exact: true })).toBeVisible();
  await expect(page.getByText('ada@example.test')).toBeVisible();
  await expect(page.locator('.prisme-breadcrumb')).toContainText(
    'PRISMA Workspace',
  );
  await navigation
    .getByRole('link', { name: 'Activity Log', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Activity Log' }).first(),
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
    navigation.getByRole('link', { name: 'Overview', exact: true }),
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
    page.getByRole('heading', { name: 'Hello, Ada Ionescu.' }),
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
  await page.goto('/?frame=classic');

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
  let pendingActivity: Route | undefined;
  await page.route('**/api/activity-log', (route) => {
    pendingActivity = route;
  });
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
  await page.goto('/?frame=classic');

  await page.getByLabel('Company display name').fill('North Star Consulting');
  await page.getByRole('button', { name: 'Register Company' }).click();

  await expect(
    page.getByRole('heading', { name: 'North Star Consulting' }),
  ).toBeVisible();
  await expect(page.getByText('Active', { exact: true })).toBeVisible();
  await expect(page.getByText('Registered by Ada Ionescu')).toBeVisible();
  await expect(page.getByLabel('Active Company')).toBeVisible();
  const companySelect = page.getByLabel('Active Company');
  const companyChoices = await openSelect(companySelect);
  await expect(
    companyChoices.getByRole('option', { name: 'North Star Consulting' }),
  ).toHaveCount(1);
  await expect.poll(() => pendingActivity !== undefined).toBe(true);
  await pendingActivity!.fulfill({ json: { events: [] } });
  await expect(
    companyChoices.getByRole('option', { name: 'North Star Consulting' }),
  ).toHaveCount(1);
  await companySelect.press('Escape');
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

test('shows an empty Company context without exposing administration controls', async ({
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
  await page.route('**/api/companies', (route) => route.fulfill({ json: [] }));
  await page.goto('/?frame=classic');

  await expect(
    page.getByText(
      'No Company is assigned to you. Ask a Workspace Owner to grant Company Context Access.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByText(/permission to view Companies/)).toHaveCount(0);
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

  await page.goto('/?frame=classic');
  const companyContext = page.getByRole('region', {
    name: 'Company context',
  });
  await expect(companyContext.getByText('PRISMA Workspace')).toBeVisible();
  await expect(
    companyContext
      .getByRole('definition')
      .filter({ hasText: 'Select a Company' }),
  ).toBeVisible();

  await selectOption(
    companyContext.getByLabel('Active Company'),
    companies[1]!.id,
  );
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

  await selectOption(
    companyContext.getByLabel('Active Company'),
    companies[0]!.id,
  );
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

test('does not clear a newer Company when an older registration is rejected', async ({
  page,
}) => {
  const companies = [
    {
      id: '00000000-0000-4000-8000-000000000030',
      displayName: 'Company A',
    },
    {
      id: '00000000-0000-4000-8000-000000000031',
      displayName: 'Company B',
    },
  ];
  let pendingRegistration: Route | undefined;
  await page.route('**/api/access/current-actor', (route) => {
    const selectedId = route.request().headers()['x-company-context-id'];
    const selectedCompany = companies.find(({ id }) => id === selectedId);
    return route.fulfill({
      json: selectedCompany
        ? { ...actorContextFixture, activeCompany: selectedCompany }
        : actorContextFixture,
    });
  });
  await page.route('**/api/companies', (route) => {
    if (route.request().method() === 'POST') {
      pendingRegistration = route;
      return;
    }
    return route.fulfill({ json: companies });
  });
  await page.route('**/api/activity-log', (route) =>
    route.fulfill({ json: { events: [] } }),
  );

  await page.goto('/?frame=classic');
  await selectOption(page.getByLabel('Active Company'), companies[0]!.id);
  await expectValue(page.getByLabel('Active Company'), companies[0]!.id);
  await page.getByLabel('Company display name').fill('Delayed registration');
  await page.getByRole('button', { name: 'Register Company' }).click();
  await expect.poll(() => pendingRegistration !== undefined).toBe(true);

  await selectOption(page.getByLabel('Active Company'), companies[1]!.id);
  await expectValue(page.getByLabel('Active Company'), companies[1]!.id);
  await pendingRegistration!.fulfill({
    status: 403,
    json: { message: 'Forbidden', statusCode: 403 },
  });

  await expectValue(page.getByLabel('Active Company'), companies[1]!.id);
  await expect(
    page
      .getByRole('region', { name: 'Company context' })
      .locator('dd')
      .filter({ hasText: 'Company B' }),
  ).toBeVisible();
  await expectValue(page.getByLabel('Company display name'), '');
  await expect(
    page.getByRole('button', { name: 'Register Company' }),
  ).toBeEnabled();
  await expect(
    page.getByText(
      'You do not have permission to register or view Companies in this Workspace.',
    ),
  ).toHaveCount(0);
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

  await page.goto('/?frame=classic');
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
  await expectValue(
    companyContext.getByLabel('Active Company'),
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

  await page.goto('/?frame=classic');
  await selectOption(page.getByLabel('Active Company'), company.id);
  await expectValue(page.getByLabel('Active Company'), company.id);

  actor = {
    ...actorContextFixture,
    internalUserId: '00000000-0000-4000-8000-000000000019',
    workspaceMembershipId: '00000000-0000-4000-8000-000000000020',
    displayName: 'Second Workspace Owner',
    email: 'second-owner@example.test',
  };
  await page.reload();

  await expectValue(page.getByLabel('Active Company'), '');
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
  let availableCompanyBecameStale = false;
  const storageKey = companyContextStorageKey();
  await page.addInitScript(
    ({ key, staleId }) => localStorage.setItem(key, staleId),
    { key: storageKey, staleId: staleCompanyId },
  );
  await page.route('**/api/access/current-actor', (route) => {
    const selectedId = route.request().headers()['x-company-context-id'];
    if (
      selectedId === staleCompanyId ||
      (selectedId === availableCompany.id && availableCompanyBecameStale)
    ) {
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
      availableCompanyBecameStale = true;
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

  await page.goto('/?frame=classic');
  const companyContext = page.getByRole('region', {
    name: 'Company context',
  });
  await expect(companyContext.getByRole('alert')).toHaveText(
    'Your previous Company context is no longer available. Choose an active Company.',
  );
  const companySelect = companyContext.getByLabel('Active Company');
  const companyChoices = await openSelect(companySelect);
  await expect(
    companyChoices.getByRole('option', { name: 'Deactivated Provider' }),
  ).toHaveCount(0);
  await companySelect.press('Escape');
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), storageKey))
    .toBeNull();

  await selectOption(
    companyContext.getByLabel('Active Company'),
    availableCompany.id,
  );
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

test('grants, selects, and revokes narrow Company context access', async ({
  page,
}) => {
  const company = { id: 'company-assigned', displayName: 'Assigned Company' };
  const unassignedCompany = {
    id: 'company-unassigned',
    displayName: 'Unassigned Company',
  };
  const member = {
    workspaceMembershipId: 'member',
    displayName: 'Assigned Member',
    email: 'member@example.test',
  };
  let identity: 'owner' | 'member' = 'owner';
  let assigned = false;
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/company-context-assignments/administration')) {
      return route.fulfill({
        json: {
          members: [member],
          companies: [company],
          assignments: assigned
            ? [
                {
                  id: 'assignment',
                  workspaceMembershipId: member.workspaceMembershipId,
                  companyId: company.id,
                  bundle: 'Company Context Access',
                  permissionSetVersion: null,
                  active: true,
                },
              ]
            : [],
        },
      });
    }
    if (url.pathname.endsWith('/company-context-assignments')) {
      expect(route.request().headers()['idempotency-key']).toBeTruthy();
      expect(route.request().postDataJSON()).toEqual({
        workspaceMembershipId: member.workspaceMembershipId,
        companyId: company.id,
      });
      assigned = true;
      return route.fulfill({
        status: 201,
        json: {
          id: 'assignment',
          workspaceMembershipId: member.workspaceMembershipId,
          companyId: company.id,
          bundle: 'Company Context Access',
          active: true,
        },
      });
    }
    if (url.pathname.includes('/company-context-assignments/')) {
      expect(route.request().headers()['idempotency-key']).toBeTruthy();
      assigned = false;
      return route.fulfill({
        json: {
          id: 'assignment',
          workspaceMembershipId: member.workspaceMembershipId,
          companyId: company.id,
          bundle: 'Company Context Access',
          active: false,
        },
      });
    }
    if (url.pathname.endsWith('/companies'))
      return route.fulfill({
        json: identity === 'member' && assigned ? [company] : [],
      });
    if (url.pathname.endsWith('/activity-log'))
      return route.fulfill({ json: { events: [] } });
    if (url.pathname.endsWith('/access/current-actor')) {
      const selected = route.request().headers()['x-company-context-id'];
      if (identity === 'member' && selected && !assigned)
        return route.fulfill({ status: 403 });
      return route.fulfill({
        json:
          identity === 'owner'
            ? {
                ...actorContextFixture,
                workspacePermissions: [
                  'company.manage',
                  'company.assignment.manage',
                ],
              }
            : {
                ...actorContextFixture,
                internalUserId: 'member-user',
                workspaceMembershipId: member.workspaceMembershipId,
                displayName: member.displayName,
                email: member.email,
                workspacePermissions: [],
                ...(selected && assigned ? { activeCompany: company } : {}),
              },
      });
    }
    return route.fallback();
  });

  await page.goto('/?frame=classic');
  await selectOption(page.getByLabel('Workspace member'), {
    label: `${member.displayName} — ${member.email}`,
  });
  await selectOption(page.getByLabel('Company', { exact: true }), {
    label: company.displayName,
  });
  await page.getByRole('button', { name: 'Grant access' }).click();
  await expect(
    page.getByText('Access granted. Server state refreshed.'),
  ).toBeVisible();

  identity = 'member';
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Company access' }),
  ).toHaveCount(0);
  await expect(page.getByLabel('Company display name')).toHaveCount(0);
  const companySelect = page.getByLabel('Active Company');
  const companyChoices = await openSelect(companySelect);
  await expect(
    companyChoices.getByRole('option', { name: unassignedCompany.displayName }),
  ).toHaveCount(0);
  await companySelect.press('Escape');
  await selectOption(page.getByLabel('Active Company'), company.id);
  await expect(
    page
      .getByRole('region', { name: 'Company context' })
      .locator('dd')
      .filter({ hasText: company.displayName }),
  ).toBeVisible();

  identity = 'owner';
  await page.reload();
  await selectOption(page.getByLabel('Workspace member'), {
    label: `${member.displayName} — ${member.email}`,
  });
  await selectOption(page.getByLabel('Company', { exact: true }), {
    label: company.displayName,
  });
  await page.getByRole('button', { name: 'Revoke access' }).click();
  await expect(
    page.getByText('Access revoked. Server state refreshed.'),
  ).toBeVisible();

  identity = 'member';
  await page.reload();
  await expect(page.getByLabel('Active Company')).toHaveCount(0);
  await expect(
    page.getByText(
      'No Company is assigned to you. Ask a Workspace Owner to grant Company Context Access.',
    ),
  ).toBeVisible();
  await expect(page.getByText(/permission to view Companies/)).toHaveCount(0);
});

test('creates and reuses one shared Client identity across two Company contexts', async ({
  page,
}, testInfo) => {
  const companies = [
    {
      id: '00000000-0000-4000-8000-000000001411',
      displayName: 'PRISMA-PRIM',
    },
    {
      id: '00000000-0000-4000-8000-000000001412',
      displayName: 'BIC',
    },
  ];
  const client = {
    id: '00000000-0000-4000-8000-000000001413',
    displayName: 'Exemplu Client SRL',
    relatedToActiveCompany: true,
  };
  let dossier = {
    ...client,
    taxId: null,
    address: null,
    telephone: null,
    generalEmail: null,
    contacts: [],
    businessActivity: null,
    version: 1,
    involvedCompanyDisplayNames: ['PRISMA-PRIM'],
  };
  const relatedCompanyIds = new Set<string>();
  const activityEvents: Array<{
    action: string;
    target: { companyId?: string; [key: string]: unknown };
    [key: string]: unknown;
  }> = [];

  await page.route('**/api/access/current-actor', (route) => {
    const selectedId = route.request().headers()['x-company-context-id'];
    const activeCompany = companies.find(({ id }) => id === selectedId);
    return route.fulfill({
      json: {
        ...actorContextFixture,
        workspacePermissions: [
          'company.manage',
          'company.assignment.manage',
          'client.manage',
        ],
        ...(activeCompany
          ? {
              activeCompany: {
                ...activeCompany,
                clientPermissions: [
                  'client.read',
                  'client.create',
                  'client.update',
                ],
              },
            }
          : {}),
      },
    });
  });
  await page.route('**/api/companies', (route) =>
    route.fulfill({ json: companies }),
  );
  await page.route('**/api/operational-home', (route) => {
    const companyId = route.request().headers()['x-company-context-id'] ?? '';
    return route.fulfill({
      json: operationalHomeFixture(companyId, {
        active_clients: relatedCompanyIds.has(companyId) ? 1 : 0,
      }),
    });
  });
  await page.route('**/api/activity-log', (route) => {
    const companyId = route.request().headers()['x-company-context-id'];
    return route.fulfill({
      json: {
        events: activityEvents.filter(
          (event) =>
            event.action !== 'client_company_relationship.established' ||
            event.target.companyId === companyId,
        ),
      },
    });
  });
  await page.route(/\/api\/clients(?:\/[^?]*)?(?:\?.*)?$/, (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const companyId = request.headers()['x-company-context-id'];
    expect(companyId).toBeTruthy();

    if (url.pathname.endsWith('/clients/search')) {
      expect(url.searchParams.get('query')).toBe('Exemplu');
      return route.fulfill({
        json: [
          {
            ...client,
            relatedToActiveCompany: relatedCompanyIds.has(companyId!),
          },
        ],
      });
    }
    if (url.pathname.endsWith('/active-company-relationship')) {
      expect(request.method()).toBe('PUT');
      relatedCompanyIds.add(companyId!);
      activityEvents.push({
        id: `relationship-${companyId}`,
        action: 'client_company_relationship.established',
        occurredAt: '2026-08-22T12:05:00.000Z',
        actor: {
          internalUserId: actorContextFixture.internalUserId,
          displayName: actorContextFixture.displayName,
        },
        target: {
          type: 'client_company_relationship',
          relationshipId: `relationship-${companyId}`,
          clientAccountId: client.id,
          clientDisplayName: client.displayName,
          companyId,
          companyDisplayName: companies.find(({ id }) => id === companyId)!
            .displayName,
        },
        metadata: {},
      });
      return route.fulfill({ json: client });
    }
    if (url.pathname.endsWith(`/clients/${client.id}`)) {
      if (request.method() === 'PATCH') {
        expect(request.headers()['idempotency-key']).toBeTruthy();
        const body = request.postDataJSON();
        expect(body.expectedVersion).toBe(dossier.version);
        dossier = {
          ...dossier,
          ...body,
          version: dossier.version + 1,
          involvedCompanyDisplayNames: ['BIC', 'PRISMA-PRIM'],
        };
        activityEvents.push({
          id: 'client-corrected',
          action: 'client.corrected',
          occurredAt: '2026-08-22T12:10:00.000Z',
          actor: {
            internalUserId: actorContextFixture.internalUserId,
            displayName: actorContextFixture.displayName,
          },
          target: {
            type: 'client_account',
            clientAccountId: client.id,
            displayName: client.displayName,
            companyId,
            companyDisplayName: companies.find(({ id }) => id === companyId)!
              .displayName,
          },
          metadata: {
            changes: {
              telephone: {
                before: null,
                after: body.telephone,
              },
            },
          },
        });
        return route.fulfill({ json: dossier });
      }
      dossier = {
        ...dossier,
        involvedCompanyDisplayNames: [...relatedCompanyIds]
          .map(
            (id) => companies.find((company) => company.id === id)!.displayName,
          )
          .sort(),
      };
      return route.fulfill({ json: dossier });
    }
    if (request.method() === 'POST') {
      expect(request.headers()['idempotency-key']).toBeTruthy();
      expect(request.postDataJSON()).toEqual({
        displayName: client.displayName,
      });
      relatedCompanyIds.add(companyId!);
      activityEvents.push(
        {
          id: 'client-created',
          action: 'client.created',
          occurredAt: '2026-08-22T12:00:00.000Z',
          actor: {
            internalUserId: actorContextFixture.internalUserId,
            displayName: actorContextFixture.displayName,
          },
          target: {
            type: 'client_account',
            clientAccountId: client.id,
            displayName: client.displayName,
          },
          metadata: {},
        },
        {
          id: `relationship-${companyId}`,
          action: 'client_company_relationship.established',
          occurredAt: '2026-08-22T12:01:00.000Z',
          actor: {
            internalUserId: actorContextFixture.internalUserId,
            displayName: actorContextFixture.displayName,
          },
          target: {
            type: 'client_company_relationship',
            relationshipId: `relationship-${companyId}`,
            clientAccountId: client.id,
            clientDisplayName: client.displayName,
            companyId,
            companyDisplayName: companies.find(({ id }) => id === companyId)!
              .displayName,
          },
          metadata: {},
        },
      );
      return route.fulfill({ status: 201, json: client });
    }
    return route.fulfill({
      json: relatedCompanyIds.has(companyId!) ? [client] : [],
    });
  });

  await page.goto('/?frame=classic');
  await selectOption(page.getByLabel('Active Company'), companies[0]!.id);
  await expect(page.getByText('No Clients for PRISMA-PRIM yet.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Clients' })).toHaveCount(1);
  await page.getByLabel('Client display name').fill(client.displayName);
  await page.getByRole('button', { name: 'Create Client' }).click();
  await expect(
    page.getByRole('heading', { name: client.displayName }),
  ).toBeVisible();
  await expect(page.getByText(`Client ID: ${client.id}`)).toBeVisible();
  await expect(
    page.getByText(`${actorContextFixture.displayName} created a Client`),
  ).toBeVisible();

  await selectOption(page.getByLabel('Active Company'), companies[1]!.id);
  await expect(page.getByText('No Clients for BIC yet.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Clients' })).toHaveCount(1);
  await page.getByLabel('Find a shared Client').fill('Exemplu');
  await page.getByRole('button', { name: 'Search Clients' }).click();
  await page.getByRole('button', { name: 'Add to BIC' }).click();
  await expect(page.getByText('Available in BIC')).toBeVisible();
  await expect(page.getByText(`Client ID: ${client.id}`)).toHaveCount(2);
  await expect(
    page.getByText(
      `Target: ${client.displayName} — ${companies[1]!.displayName}`,
    ),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Open dossier' }).click();
  await expect(page.getByText('BIC, PRISMA-PRIM')).toBeVisible();
  const correctionForm = page.getByRole('form', {
    name: 'Correct Client dossier',
  });
  await correctionForm
    .getByLabel('Telephone', { exact: true })
    .fill('+373 69 111 222');
  await correctionForm.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByText('Version 2')).toBeVisible();
  await expect(
    page.getByText(
      `${actorContextFixture.displayName} corrected a Client dossier`,
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      `Target: ${client.displayName} — ${companies[1]!.displayName}`,
    ),
  ).toHaveCount(2);

  const geometry = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  await page.screenshot({
    path: testInfo.outputPath(`shared-client-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test('covers the Owner-to-Director shared Client journey and immediate revocation', async ({
  page,
}, testInfo) => {
  const companies = [
    {
      id: '00000000-0000-4000-8000-000000001461',
      displayName: 'PRISMA-PRIM',
    },
    {
      id: '00000000-0000-4000-8000-000000001462',
      displayName: 'BIC',
    },
  ];
  const directors = {
    a: {
      internalUserId: 'director-a',
      workspaceMembershipId: 'director-membership-a',
      displayName: 'PRISMA Director',
      email: 'director-a@example.test',
      company: companies[0]!,
    },
    b: {
      internalUserId: 'director-b',
      workspaceMembershipId: 'director-membership-b',
      displayName: 'BIC Director',
      email: 'director-b@example.test',
      company: companies[1]!,
    },
  };
  const client = {
    id: '00000000-0000-4000-8000-000000001463',
    displayName: 'Director Client SRL',
    relatedToActiveCompany: true,
  };
  type Identity = 'owner' | 'director-a' | 'director-b';
  let identity: Identity = 'owner';
  const assignments = new Set<string>();
  const relatedCompanyIds = new Set<string>();
  let clientCreated = false;
  let correctionRecorded = false;
  let dossier = {
    ...client,
    taxId: null as string | null,
    address: null as string | null,
    telephone: null as string | null,
    generalEmail: null as string | null,
    contacts: [] as Array<{
      name: string;
      telephone?: string;
      email?: string;
    }>,
    businessActivity: null as string | null,
    version: 1,
    involvedCompanyDisplayNames: [] as string[],
  };
  const assignmentKey = (membershipId: string, companyId: string) =>
    `${membershipId}:${companyId}`;
  const administrationState = () => ({
    members: Object.values(directors).map((director) => ({
      workspaceMembershipId: director.workspaceMembershipId,
      displayName: director.displayName,
      email: director.email,
    })),
    companies,
    assignments: [...assignments].map((key, index) => {
      const [workspaceMembershipId, companyId] = key.split(':');
      return {
        id: `director-assignment-${index}`,
        workspaceMembershipId,
        companyId,
        bundle: 'Company Director Client Access',
        permissionSetVersion: 'v2',
        active: true,
      };
    }),
  });

  await page.route('**/api/access/current-actor', (route) => {
    const selectedCompanyId = route.request().headers()['x-company-context-id'];
    if (identity === 'owner') {
      const activeCompany = companies.find(
        (company) => company.id === selectedCompanyId,
      );
      return route.fulfill({
        json: {
          ...actorContextFixture,
          workspacePermissions: [
            'company.manage',
            'company.assignment.manage',
            'client.manage',
          ],
          ...(activeCompany ? { activeCompany } : {}),
        },
      });
    }
    const director = identity === 'director-a' ? directors.a : directors.b;
    const assigned = assignments.has(
      assignmentKey(director.workspaceMembershipId, director.company.id),
    );
    return route.fulfill({
      json: {
        ...actorContextFixture,
        internalUserId: director.internalUserId,
        workspaceMembershipId: director.workspaceMembershipId,
        displayName: director.displayName,
        email: director.email,
        workspacePermissions: [],
        ...(assigned
          ? {
              activeCompany: {
                ...director.company,
                clientPermissions: [
                  'client.read',
                  'client.create',
                  'client.update',
                ],
              },
            }
          : {}),
      },
    });
  });
  await page.route('**/api/companies', (route) =>
    route.fulfill({ json: companies }),
  );
  await page.route(
    '**/api/company-context-assignments/administration',
    (route) => route.fulfill({ json: administrationState() }),
  );
  await page.route(
    /\/api\/company-director-client-assignments(?:\/.*)?$/,
    (route) => {
      const request = route.request();
      expect(request.headers()['idempotency-key']).toBeTruthy();
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        assignments.add(
          assignmentKey(body.workspaceMembershipId, body.companyId),
        );
        return route.fulfill({
          status: 201,
          json: {
            ...body,
            bundle: 'Company Director Client Access',
            active: true,
          },
        });
      }
      const pathParts = new URL(request.url()).pathname.split('/');
      const companyId = pathParts.pop()!;
      const membershipId = pathParts.pop()!;
      assignments.delete(assignmentKey(membershipId, companyId));
      return route.fulfill({
        json: {
          workspaceMembershipId: membershipId,
          companyId,
          bundle: 'Company Director Client Access',
          active: false,
        },
      });
    },
  );
  // Only the Client directory read is held, so only its summary appears.
  await page.route('**/api/operational-home', (route) => {
    const companyId = route.request().headers()['x-company-context-id'] ?? '';
    return route.fulfill({
      json: operationalHomeFixture(companyId, {
        active_clients:
          clientCreated && relatedCompanyIds.has(companyId) ? 1 : 0,
      }),
    });
  });
  await page.route('**/api/activity-log', (route) =>
    route.fulfill({
      json: {
        events: correctionRecorded
          ? [
              {
                id: 'director-client-corrected',
                action: 'client.corrected',
                occurredAt: '2026-08-23T12:10:00.000Z',
                actor: {
                  internalUserId: directors.a.internalUserId,
                  displayName: directors.a.displayName,
                },
                target: {
                  type: 'client_account',
                  clientAccountId: client.id,
                  displayName: client.displayName,
                  companyId: directors.a.company.id,
                  companyDisplayName: directors.a.company.displayName,
                },
                metadata: {},
              },
            ]
          : [],
      },
    }),
  );
  await page.route(/\/api\/clients(?:\/[^?]*)?(?:\?.*)?$/, (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const companyId = request.headers()['x-company-context-id'];
    const activeDirector =
      identity === 'director-a'
        ? directors.a
        : identity === 'director-b'
          ? directors.b
          : undefined;
    if (
      activeDirector &&
      !assignments.has(
        assignmentKey(
          activeDirector.workspaceMembershipId,
          activeDirector.company.id,
        ),
      )
    ) {
      return route.fulfill({ status: 403, json: { message: 'Forbidden' } });
    }
    expect(companyId).toBeTruthy();
    if (url.pathname.endsWith('/clients/search')) {
      return route.fulfill({
        json: clientCreated
          ? [
              {
                ...client,
                relatedToActiveCompany: relatedCompanyIds.has(companyId!),
              },
            ]
          : [],
      });
    }
    if (url.pathname.endsWith('/active-company-relationship')) {
      relatedCompanyIds.add(companyId!);
      return route.fulfill({ json: client });
    }
    if (url.pathname.endsWith(`/clients/${client.id}`)) {
      if (!clientCreated || !relatedCompanyIds.has(companyId!)) {
        return route.fulfill({ status: 404, json: { message: 'Not Found' } });
      }
      dossier = {
        ...dossier,
        involvedCompanyDisplayNames: [...relatedCompanyIds]
          .map(
            (id) => companies.find((company) => company.id === id)!.displayName,
          )
          .sort(),
      };
      if (request.method() === 'PATCH') {
        expect(request.headers()['idempotency-key']).toBeTruthy();
        const body = request.postDataJSON();
        expect(body.expectedVersion).toBe(dossier.version);
        dossier = { ...dossier, ...body, version: dossier.version + 1 };
        correctionRecorded = true;
      }
      return route.fulfill({ json: dossier });
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON();
      expect(request.headers()['idempotency-key']).toBeTruthy();
      clientCreated = true;
      relatedCompanyIds.add(companyId!);
      dossier = {
        ...dossier,
        ...body,
        version: 1,
        involvedCompanyDisplayNames: [companies[0]!.displayName],
      };
      return route.fulfill({ status: 201, json: client });
    }
    return route.fulfill({
      json: clientCreated && relatedCompanyIds.has(companyId!) ? [client] : [],
    });
  });

  await page.goto('/?frame=classic');
  await selectOption(page.getByLabel('Access bundle'), 'director-client');
  for (const director of [directors.a, directors.b]) {
    await selectOption(page.getByLabel('Workspace member'), {
      label: `${director.displayName} — ${director.email}`,
    });
    await selectOption(page.getByLabel('Company', { exact: true }), {
      label: director.company.displayName,
    });
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/company-director-client-assignments') &&
          response.request().method() === 'POST',
      ),
      page.getByRole('button', { name: 'Grant access' }).click(),
    ]);
    await expect(
      page.getByText('Access granted. Server state refreshed.'),
    ).toBeVisible();
  }

  identity = 'director-a';
  await page.reload();
  await expect(page.getByRole('region', { name: 'Clients' })).toBeVisible();
  await expect(page.getByText('No Clients for PRISMA-PRIM yet.')).toBeVisible();
  await page.getByLabel('Client display name').fill(client.displayName);
  await page.getByLabel('IDNO / tax code').first().fill('1003600123456');
  await page.getByLabel('Address').first().fill('Chișinău');
  await page.getByLabel('General email').first().fill('office@example.test');
  await page.getByLabel('Business activity').first().fill('Consulting');
  await page.getByRole('button', { name: 'Add Contact' }).click();
  await page.getByRole('button', { name: 'Add Contact' }).click();
  const firstContact = page.getByRole('group', { name: 'Contact 1' });
  await firstContact.getByLabel('Contact name').fill('Ana Popescu');
  await firstContact.getByLabel('Contact telephone').fill('+373 60 111 111');
  const secondContact = page.getByRole('group', { name: 'Contact 2' });
  await secondContact.getByLabel('Contact name').fill('Ion Ionescu');
  await secondContact.getByLabel('Contact email').fill('ion@example.test');
  await page.getByRole('button', { name: 'Create Client' }).click();
  await expect(page.getByText(`Client ID: ${client.id}`)).toBeVisible();
  await page.getByRole('button', { name: 'Open dossier' }).click();
  const correctionForm = page.getByRole('form', {
    name: 'Correct Client dossier',
  });
  await correctionForm
    .getByLabel('Telephone', { exact: true })
    .fill('+373 69 111 222');
  await correctionForm.getByRole('button', { name: 'Save correction' }).click();
  await expect(page.getByText('Version 2')).toBeVisible();

  identity = 'owner';
  await page.reload();
  await selectOption(page.getByLabel('Active Company'), companies[1]!.id);
  await page.getByLabel('Find a shared Client').fill('Director Client');
  await page.getByRole('button', { name: 'Search Clients' }).click();
  await page.getByRole('button', { name: 'Add to BIC' }).click();
  await expect(page.getByText('Available in BIC')).toBeVisible();

  identity = 'director-b';
  await page.reload();
  await page.getByRole('button', { name: 'Open dossier' }).click();
  await expect(page.getByText('BIC, PRISMA-PRIM')).toBeVisible();
  await expect(page.getByText('1003600123456')).toBeVisible();
  await expect(page.getByText('+373 69 111 222')).toBeVisible();
  const contactsRegion = page.getByRole('region', { name: 'Contacts' });
  await expect(contactsRegion.getByText('Ana Popescu')).toBeVisible();
  await expect(contactsRegion.getByText('Ion Ionescu')).toBeVisible();
  await expect(page.getByText('Contract')).toHaveCount(0);
  await expect(page.getByText('Invoice')).toHaveCount(0);
  await expect(page.getByText('Project')).toHaveCount(0);

  identity = 'owner';
  await page.reload();
  await selectOption(page.getByLabel('Access bundle'), 'director-client');
  await selectOption(page.getByLabel('Workspace member'), {
    label: `${directors.a.displayName} — ${directors.a.email}`,
  });
  await selectOption(page.getByLabel('Company', { exact: true }), {
    label: directors.a.company.displayName,
  });
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/company-director-client-assignments/') &&
        response.request().method() === 'DELETE',
    ),
    page.getByRole('button', { name: 'Revoke access' }).click(),
  ]);
  await expect(
    page.getByText('Access revoked. Server state refreshed.'),
  ).toBeVisible();

  identity = 'director-a';
  await page.reload();
  await expect(page.getByRole('region', { name: 'Clients' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Clients' })).toHaveCount(0);

  const geometry = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  await page.screenshot({
    path: testInfo.outputPath(`director-client-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

test('upgrades complete authority before reviewing and attaching an exact-ID duplicate', async ({
  page,
}, testInfo) => {
  const candidateCompany = {
    id: '00000000-0000-4000-8000-000000000158',
    displayName: 'Candidate Company A',
  };
  const attemptedCompany = {
    id: '00000000-0000-4000-8000-000000000159',
    displayName: 'Attempted Company B',
  };
  const companies = [candidateCompany, attemptedCompany].map((company) => ({
    ...company,
    workspaceId: actorContextFixture.workspaceId,
    status: 'active',
    createdAt: '2026-08-29T08:00:00.000Z',
    createdByInternalUserId: actorContextFixture.internalUserId,
  }));
  const reference = '00000000-0000-4000-8000-000000001158';
  const continuationCursor = '00000000-0000-4000-8000-000000001169';
  const candidateId = '00000000-0000-4000-8000-000000003158';
  let reviewPending = false;
  let candidateAttached = false;
  let candidateAuthority: 'legacy-v1' | 'revoked' | 'v2' = 'legacy-v1';
  const resolverActor = {
    ...actorContextFixture,
    workspacePermissions: [
      'company.manage',
      'company.assignment.manage',
      'client.manage',
    ],
    activeCompany: {
      id: attemptedCompany.id,
      displayName: attemptedCompany.displayName,
      clientPermissions: [
        'client.read',
        'client.create',
        'client.update',
        'client.duplicate.resolve',
      ],
      clientPermissionAssignmentId: '00000000-0000-4000-8000-000000002158',
      clientPermissionSetVersion: 'v2',
    },
  } satisfies ActorContext;

  const administration = () => ({
    members: [
      {
        workspaceMembershipId: resolverActor.workspaceMembershipId,
        displayName: resolverActor.displayName,
        email: resolverActor.email,
      },
    ],
    companies: companies.map(({ id, displayName }) => ({ id, displayName })),
    assignments: [
      ...(candidateAuthority === 'revoked'
        ? []
        : [
            {
              id:
                candidateAuthority === 'legacy-v1'
                  ? '00000000-0000-4000-8000-000000004158'
                  : '00000000-0000-4000-8000-000000005158',
              workspaceMembershipId: resolverActor.workspaceMembershipId,
              companyId: candidateCompany.id,
              bundle: 'Company Director Client Access',
              permissionSetVersion:
                candidateAuthority === 'legacy-v1' ? 'v1' : 'v2',
              active: true,
            },
          ]),
      {
        id: resolverActor.activeCompany.clientPermissionAssignmentId,
        workspaceMembershipId: resolverActor.workspaceMembershipId,
        companyId: attemptedCompany.id,
        bundle: 'Company Director Client Access',
        permissionSetVersion: 'v2',
        active: true,
      },
    ],
  });

  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    const request = route.request();
    if (url.pathname.endsWith('/access/current-actor')) {
      return route.fulfill({ json: resolverActor });
    }
    if (url.pathname.endsWith('/operational-home'))
      return route.fulfill({
        json: operationalHomeFixture(attemptedCompany.id, {
          active_clients: candidateAttached ? 1 : 0,
        }),
      });
    if (url.pathname.endsWith('/company-context-assignments/administration')) {
      return route.fulfill({ json: administration() });
    }
    if (url.pathname.endsWith('/company-director-client-assignments')) {
      expect(request.method()).toBe('POST');
      expect(request.postDataJSON()).toEqual({
        workspaceMembershipId: resolverActor.workspaceMembershipId,
        companyId: candidateCompany.id,
      });
      candidateAuthority = 'v2';
      return route.fulfill({
        status: 201,
        json: administration().assignments.find(
          (assignment) => assignment.companyId === candidateCompany.id,
        ),
      });
    }
    if (url.pathname.includes('/company-director-client-assignments/')) {
      expect(request.method()).toBe('DELETE');
      expect(url.pathname).toContain(resolverActor.workspaceMembershipId);
      expect(url.pathname).toContain(candidateCompany.id);
      candidateAuthority = 'revoked';
      return route.fulfill({
        json: {
          id: '00000000-0000-4000-8000-000000004158',
          workspaceMembershipId: resolverActor.workspaceMembershipId,
          companyId: candidateCompany.id,
          bundle: 'Company Director Client Access',
          permissionSetVersion: 'v1',
          active: false,
        },
      });
    }
    if (url.pathname.endsWith('/companies')) {
      return route.fulfill({ json: companies });
    }
    if (url.pathname.endsWith('/activity-log')) {
      return route.fulfill({ json: { events: [] } });
    }
    if (url.pathname.endsWith(`/client-duplicate-reviews/${reference}`)) {
      if (candidateAuthority !== 'v2' || candidateAttached) {
        return route.fulfill({ status: 404 });
      }
      return route.fulfill({
        json: {
          outcome: 'comparison',
          duplicate_review_reference: reference,
          proposal: {
            kind: 'registration',
            fields: {
              displayName: 'Proposed Duplicate Client',
              taxId: 'IDNO-158',
              address: 'Proposed address',
              telephone: null,
              generalEmail: null,
              contacts: [],
              businessActivity: null,
            },
          },
          candidate: {
            id: candidateId,
            displayName: 'Existing Shared Client',
            taxId: 'IDNO-158',
            address: 'Existing address',
            telephone: '+373 22 158 158',
            generalEmail: null,
            contacts: [],
            businessActivity: 'Consulting',
            version: 1,
            relatedToActiveCompany: false,
            involvedCompanyDisplayNames: [candidateCompany.displayName],
          },
        },
      });
    }
    if (url.pathname.endsWith('/client-duplicate-reviews')) {
      expect(url.searchParams.get('page_size')).toBe('20');
      const cursor = url.searchParams.get('cursor');
      if (cursor !== null) expect(cursor).toBe(continuationCursor);
      return route.fulfill({
        json: {
          items:
            cursor === continuationCursor &&
            reviewPending &&
            candidateAuthority === 'v2' &&
            !candidateAttached
              ? [{ duplicate_review_reference: reference }]
              : [],
          next_cursor:
            cursor === null &&
            reviewPending &&
            candidateAuthority === 'v2' &&
            !candidateAttached
              ? continuationCursor
              : null,
        },
      });
    }
    if (
      url.pathname.endsWith(
        `/clients/${candidateId}/active-company-relationship`,
      )
    ) {
      expect(request.method()).toBe('PUT');
      candidateAttached = true;
      return route.fulfill({
        json: {
          id: candidateId,
          displayName: 'Existing Shared Client',
          relatedToActiveCompany: true,
        },
      });
    }
    if (url.pathname.endsWith('/clients')) {
      if (request.method() === 'POST') {
        reviewPending = true;
        return route.fulfill({
          status: 409,
          json: {
            statusCode: 409,
            error: 'Conflict',
            code: 'possible_duplicate_review_required',
            duplicate_review_reference: reference,
          },
        });
      }
      return route.fulfill({
        json: candidateAttached
          ? [
              {
                id: candidateId,
                displayName: 'Existing Shared Client',
                relatedToActiveCompany: true,
              },
            ]
          : [],
      });
    }
    return route.fulfill({ status: 404 });
  });

  await page.goto('/?frame=classic');
  await expect(page.getByRole('region', { name: 'Clients' })).toBeVisible();
  await page
    .getByLabel('Client display name')
    .fill('Proposed Duplicate Client');
  await page.getByLabel('IDNO / tax code').first().fill(' IDNO-158 ');
  await page.getByRole('button', { name: 'Create Client' }).click();
  await expect(page.getByText(/may already exist/i)).toBeVisible();
  await expect(page.getByText(reference)).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Review possible duplicate 1' }),
  ).toHaveCount(0);

  await selectOption(page.getByLabel('Access bundle'), 'director-client');
  await selectOption(page.getByLabel('Workspace member'), {
    label: `${resolverActor.displayName} — ${resolverActor.email}`,
  });
  await selectOption(page.getByLabel('Company', { exact: true }), {
    label: candidateCompany.displayName,
  });
  const companyAccess = page.getByRole('region', { name: 'Company access' });
  const capturedVersionExplanation = companyAccess.getByText(
    'The version is captured when access is granted. A later version applies only after this access is revoked and granted again.',
  );
  await expect(page.getByText(/Current server state:/)).toHaveText(
    'Current server state: Granted — captured version v1',
  );
  await expect(capturedVersionExplanation).toBeVisible();
  await companyAccess.screenshot({
    path: testInfo.outputPath(
      `company-access-legacy-version-${testInfo.project.name}.png`,
    ),
  });
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes('/company-director-client-assignments/') &&
        response.request().method() === 'DELETE',
    ),
    page.getByRole('button', { name: 'Revoke access' }).click(),
  ]);
  await expect(
    page.getByText('Access revoked. Server state refreshed.'),
  ).toBeVisible();
  await expect(page.getByText(/Current server state:/)).toHaveText(
    'Current server state: Not granted',
  );
  await expect(capturedVersionExplanation).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Review possible duplicate 1' }),
  ).toHaveCount(0);

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith('/company-director-client-assignments') &&
        response.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'Grant access' }).click(),
  ]);
  await expect(
    page.getByText('Access granted. Server state refreshed.'),
  ).toBeVisible();
  await expect(page.getByText(/Current server state:/)).toHaveText(
    'Current server state: Granted — captured version v2',
  );
  await expect(capturedVersionExplanation).toBeVisible();
  await companyAccess.screenshot({
    path: testInfo.outputPath(
      `company-access-fresh-version-${testInfo.project.name}.png`,
    ),
  });
  await page.goto('/?frame=prisme#clients');
  await expect(
    page.getByRole('button', { name: 'Review possible duplicate 1' }),
  ).toHaveCount(0);
  await expect(page.getByText(continuationCursor)).toHaveCount(0);
  await page
    .getByRole('button', { name: 'Load more possible duplicate reviews' })
    .click();

  await page
    .getByRole('button', { name: 'Review possible duplicate 1' })
    .click();
  await expect(
    page.getByRole('heading', {
      name: 'Compare the proposed and existing Client',
    }),
  ).toBeVisible();
  await expect(page.getByText('Proposed Duplicate Client')).toBeVisible();
  await expect(page.getByText('Existing Shared Client')).toBeVisible();
  await expect(page.getByText(reference)).toHaveCount(0);

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response
          .url()
          .endsWith(`/clients/${candidateId}/active-company-relationship`) &&
        response.request().method() === 'PUT',
    ),
    page
      .getByRole('button', {
        name: 'Use this existing Client in the active Company',
      })
      .click(),
  ]);
  await expect(
    page.getByText('Existing Client linked to the active Company.'),
  ).toBeVisible();
  expect(candidateAttached).toBe(true);

  const geometry = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(geometry.documentWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  await page.screenshot({
    path: testInfo.outputPath(`duplicate-review-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

function companyContextStorageKey(): string {
  return `prisma-prim.company-context:${actorContextFixture.workspaceId}:${actorContextFixture.workspaceMembershipId}`;
}
