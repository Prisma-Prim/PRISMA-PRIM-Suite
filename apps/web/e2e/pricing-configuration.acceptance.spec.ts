import { expect, test, type Page, type Response } from '@playwright/test';

const apiOrigin = 'http://127.0.0.1:4174';
const apiAdministratorHeaders = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};
const otherCompanyHeaders = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'other-company-member',
  'x-test-display-name': 'Other Company Member',
  'x-test-email': 'other-company-member@example.test',
};
const marker = 'Illustrative configuration: provisional records';

test('publishes illustrative Pricing Rule Versions through the real API and PostgreSQL', async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'narrow' : 'desktop';
  // Each viewport configures its own synthetic Company so both runs start
  // from an empty rule scope in the shared acceptance database.
  const companyName = `Pricing ${suffix} ${crypto.randomUUID().slice(0, 8)}`;
  const membershipId = requiredEnvironment('ACCEPTANCE_PRIMARY_MEMBERSHIP_ID');
  const companyId = await createCompany(page, companyName);
  await changeAssignment(page, {
    operation: 'grant',
    bundle: 'company-context',
    workspaceMembershipId: membershipId,
    companyId,
  });
  // 1. The administrator grants Company Pricing Configuration v1 to member M.
  await changeAssignment(page, {
    operation: 'grant',
    bundle: 'company-pricing-configuration',
    workspaceMembershipId: membershipId,
    companyId,
  });
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const companySelect = page.getByLabel('Active Company', { exact: true });
    const navigation = page.getByRole('navigation', {
      name: 'Primary navigation',
    });
    await selectCompany(page, companySelect, companyName, narrow);
    await navigate(page, navigation, 'Pricing Configuration', narrow);
    const configuration = page.locator('.pricing-configuration');
    await expect(
      configuration.getByText(marker, { exact: true }),
    ).toBeVisible();
    const zone = await page.evaluate(
      () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    await expect(
      configuration.getByText(
        `Instants are entered and shown in your browser time zone: ${zone}.`,
        { exact: true },
      ),
    ).toBeVisible();
    await expect(configuration.getByText(/^No current version/u)).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`pricing-configuration-empty-${suffix}.png`),
      fullPage: true,
    });

    // 2. M publishes rule A a short time ahead: no version is current yet.
    await configuration
      .getByRole('button', { name: 'Publish version' })
      .click();
    await expect(configuration.getByRole('alert')).toContainText(
      'Enter a label of 1 to 120 characters',
    );
    const startA = await localDateTime(page, 60_000);
    await fillDraft(page, zone, 'Illustrative rule A', startA.local);
    await expect(
      configuration.getByLabel('Label', { exact: true }),
    ).toHaveValue('Illustrative rule A');
    expect(await publish(page)).toBe(201);
    await expect(
      configuration.getByText('Version 1 published.', { exact: true }),
    ).toBeVisible();
    await expect(configuration.getByText(/^No current version/u)).toBeVisible();
    await expect(
      configuration.getByText(
        'Head: version 1. A new publication follows this version.',
        { exact: true },
      ),
    ).toBeVisible();
    const versions = configuration.getByRole('list', {
      name: 'Pricing Rule Versions',
    });
    await expect(versions.getByRole('listitem')).toHaveCount(1);
    await expect(versions.getByRole('listitem').first()).toContainText(
      'Scheduled',
    );

    // A second tab opened now still displays head 1.
    const secondTab = await page.context().newPage();
    await secondTab.goto('/#pricing');
    const secondConfiguration = secondTab.locator('.pricing-configuration');
    await expect(
      secondConfiguration.getByText(
        'The new version will follow head version 1.',
        { exact: true },
      ),
    ).toBeVisible();

    // 3. M publishes v2 with expected head 1 and a later start.
    const startB = await localDateTime(page, 2 * 60 * 60 * 1000);
    await fillDraft(page, zone, 'Illustrative rule B', startB.local);
    expect(await publish(page)).toBe(201);
    await expect(
      configuration.getByText('Version 2 published.', { exact: true }),
    ).toBeVisible();
    await expect(versions.getByRole('listitem')).toHaveCount(2);
    await expect(
      configuration.getByText(
        'Head: version 2. A new publication follows this version.',
        { exact: true },
      ),
    ).toBeVisible();
    const scheduled = configuration.getByRole('list', {
      name: 'Scheduled successors',
    });
    await expect(scheduled.getByRole('listitem')).toHaveCount(2);
    await expect(scheduled.getByRole('listitem').nth(0)).toContainText(
      'Version 1',
    );
    await expect(scheduled.getByRole('listitem').nth(1)).toContainText(
      'Takes over from',
    );

    // 4. The second tab still expecting head 1 gets a stale conflict.
    const startC = await localDateTime(secondTab, 3 * 60 * 60 * 1000);
    await fillDraft(secondTab, zone, 'Second tab rule', startC.local);
    expect(await publish(secondTab)).toBe(409);
    await expect(secondConfiguration.getByRole('alert')).toHaveText(
      'The configuration changed: version 2 is now the head. Reload before publishing again.',
    );
    await secondConfiguration
      .getByRole('button', { name: 'Reload Pricing Rule Versions' })
      .click();
    await expect(
      secondConfiguration.getByText(
        'The new version will follow head version 2.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      secondConfiguration.getByLabel('Label', { exact: true }),
    ).toHaveValue('Second tab rule');
    await secondTab.close();

    // 5. Resubmitting v2's content unchanged allocates no version.
    await fillDraft(page, zone, 'Illustrative rule B', startB.local);
    expect(await publish(page)).toBe(201);
    await expect(
      configuration.getByText(
        'Version 2 already has this content. Nothing changed.',
        { exact: true },
      ),
    ).toBeVisible();
    await expect(versions.getByRole('listitem')).toHaveCount(2);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`pricing-configuration-${suffix}.png`),
      fullPage: true,
    });

    // 6. After v1's start, a reload shows v1 current and v2 scheduled.
    await page.waitForTimeout(Math.max(0, startA.epoch - Date.now() + 1_500));
    await configuration
      .getByRole('button', { name: 'Reload Pricing Rule Versions' })
      .click();
    const current = configuration.getByRole('region', {
      name: 'Current Pricing Rule Version',
    });
    await expect(current).toContainText('Version 1');
    await expect(current.locator('.pricing-configuration-state')).toHaveText(
      'Current',
    );
    await expect(scheduled.getByRole('listitem')).toHaveCount(1);
    await expect(scheduled.getByRole('listitem').first()).toContainText(
      'Version 2',
    );
    await page.screenshot({
      path: testInfo.outputPath(`pricing-configuration-current-${suffix}.png`),
      fullPage: true,
    });

    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('button', { name: 'Use classic frame' }).click();
    await expect(
      configuration.getByText(marker, { exact: true }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'Try Prisme' }).click();

    // 7. A Catalogue-only member sees no configuration screen, and a member of
    // another Company sees nothing of this one.
    await selectCompany(page, companySelect, 'PRISMA-PRIM', narrow);
    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(
      navigation.getByRole('link', { name: 'Service Catalogue', exact: true }),
    ).toHaveCount(1);
    await expect(
      navigation.getByRole('link', {
        name: 'Pricing Configuration',
        exact: true,
      }),
    ).toHaveCount(0);
    for (const otherCompanyId of [
      companyId,
      requiredEnvironment('ACCEPTANCE_OTHER_COMPANY_ID'),
    ]) {
      const denied = await page.request.get(
        `${apiOrigin}/api/pricing-configuration/rule-versions`,
        {
          headers: {
            ...otherCompanyHeaders,
            'x-company-context-id': otherCompanyId,
          },
        },
      );
      expect(denied.status()).toBe(403);
      expect(await denied.text()).not.toContain('Illustrative rule');
    }
  } finally {
    await changeAssignment(page, {
      operation: 'revoke',
      bundle: 'company-pricing-configuration',
      workspaceMembershipId: membershipId,
      companyId,
    });
    await changeAssignment(page, {
      operation: 'revoke',
      bundle: 'company-context',
      workspaceMembershipId: membershipId,
      companyId,
    });
  }
});

async function createCompany(page: Page, displayName: string): Promise<string> {
  const response = await page.request.post(`${apiOrigin}/api/companies`, {
    headers: {
      ...apiAdministratorHeaders,
      'content-type': 'application/json',
      'idempotency-key': `acceptance-pricing-company-${crypto.randomUUID()}`,
    },
    data: { displayName },
  });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  if (
    typeof body !== 'object' ||
    body === null ||
    !('id' in body) ||
    typeof body.id !== 'string'
  )
    throw new Error('Expected the registered Company id.');
  return body.id;
}

async function changeAssignment(
  page: Page,
  {
    operation,
    bundle,
    workspaceMembershipId,
    companyId,
  }: {
    operation: 'grant' | 'revoke';
    bundle: 'company-context' | 'company-pricing-configuration';
    workspaceMembershipId: string;
    companyId: string;
  },
): Promise<void> {
  const key = `acceptance-${operation}-${bundle}-${crypto.randomUUID()}`;
  const response =
    operation === 'grant'
      ? await page.request.post(`${apiOrigin}/api/${bundle}-assignments`, {
          headers: {
            ...apiAdministratorHeaders,
            'content-type': 'application/json',
            'idempotency-key': key,
          },
          data: { workspaceMembershipId, companyId },
        })
      : await page.request.delete(
          `${apiOrigin}/api/${bundle}-assignments/${workspaceMembershipId}/${companyId}`,
          { headers: { ...apiAdministratorHeaders, 'idempotency-key': key } },
        );
  expect(response.status()).toBe(operation === 'grant' ? 201 : 200);
}

// A datetime-local value names a wall-clock time in the browser time zone.
async function localDateTime(
  page: Page,
  offsetMilliseconds: number,
): Promise<{ local: string; epoch: number }> {
  return page.evaluate((offset) => {
    const instant = new Date(Date.now() + offset);
    instant.setMilliseconds(0);
    const pad = (value: number) => String(value).padStart(2, '0');
    return {
      local: `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}T${pad(instant.getHours())}:${pad(instant.getMinutes())}:${pad(instant.getSeconds())}`,
      epoch: instant.getTime(),
    };
  }, offsetMilliseconds);
}

async function fillDraft(
  page: Page,
  zone: string,
  label: string,
  effectiveFrom: string,
): Promise<void> {
  const configuration = page.locator('.pricing-configuration');
  await configuration.getByLabel('Label', { exact: true }).fill(label);
  await configuration
    .getByLabel(`Effective from (${zone})`, { exact: true })
    .fill(effectiveFrom);
}

async function publish(page: Page): Promise<number> {
  const response = page.waitForResponse(
    mutationResponse('POST', '/api/pricing-configuration/rule-versions'),
  );
  await page
    .locator('.pricing-configuration')
    .getByRole('button', { name: 'Publish version' })
    .click();
  return (await response).status();
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function selectCompany(
  page: Page,
  company: ReturnType<Page['getByLabel']>,
  label: string,
  narrow: boolean,
): Promise<void> {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await company.selectOption({ label });
  await expect(company.locator('option:checked')).toHaveText(label);
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
