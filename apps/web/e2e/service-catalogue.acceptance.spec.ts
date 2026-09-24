import { expect, test, type Page, type Response } from '@playwright/test';

test('defines a shared Service and records a Company offering through the real API and PostgreSQL', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'NARROW' : 'DESKTOP';
  const code = `ACCEPTANCE-${suffix}`;
  const name = `Acceptance service ${suffix.toLowerCase()}`;
  const label = `Illustrative offering ${suffix.toLowerCase()}`;
  const disclaimer =
    'This illustrative offering is non-operational: it is not evidence that the Company may perform, certify, sell or contract the service. A real offering requires a separately reviewed governed transition.';

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const company = page.getByLabel('Active Company', { exact: true });
  const navigation = page.getByRole('navigation', {
    name: 'Primary navigation',
  });
  await selectCompany(page, company, narrow);
  await navigate(page, navigation, 'Service Catalogue', narrow);

  const catalogue = page.locator('.service-catalogue');
  await expect(catalogue.getByText(disclaimer, { exact: true })).toBeVisible();
  await expect(
    catalogue.getByText('Illustrative catalogue: provisional records', {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(
      `service-catalogue-empty-${suffix.toLowerCase()}.png`,
    ),
    fullPage: true,
  });

  await catalogue.getByRole('button', { name: 'Define Service' }).click();
  await expect(catalogue.getByRole('alert')).toContainText(
    'Enter a service code of 1 to 40 characters',
  );
  await catalogue.getByLabel('Service code').fill(code);
  await expect(catalogue.getByLabel('Service code')).toHaveValue(code);
  await catalogue.getByLabel('Service name').fill(name);
  const definitionResponse = page.waitForResponse(
    mutationResponse('POST', '/api/commercial-catalogue/service-definitions'),
  );
  await catalogue.getByRole('button', { name: 'Define Service' }).click();
  expect((await definitionResponse).status()).toBe(201);
  await expect(
    catalogue.getByText(`Service Definition ${code} recorded.`, {
      exact: true,
    }),
  ).toBeVisible();
  const definitions = catalogue.getByRole('list', {
    name: 'Service Definitions',
  });
  await expect(definitions.getByText(code, { exact: true })).toBeVisible();

  await catalogue
    .getByLabel('Service Definition', { exact: true })
    .selectOption({ label: `${code} — ${name}` });
  await catalogue.getByLabel('Commercial label').fill(label);
  const offeringResponse = page.waitForResponse(
    mutationResponse('POST', '/api/commercial-catalogue/offerings'),
  );
  await catalogue.getByRole('button', { name: 'Record offering' }).click();
  expect((await offeringResponse).status()).toBe(201);
  await expect(
    catalogue.getByText(`Offering for ${name} recorded as available.`, {
      exact: true,
    }),
  ).toBeVisible();
  const offerings = catalogue.getByRole('list', {
    name: 'Company Service Offerings',
  });
  await expect(offerings.getByText(label, { exact: true })).toBeVisible();
  // Both viewport projects share one database, so scope the badge to the
  // offering this run recorded.
  const recordedOffering = offerings
    .getByRole('listitem')
    .filter({ has: page.getByText(label, { exact: true }) });
  await expect(recordedOffering).toHaveCount(1);
  await expect(
    recordedOffering.getByText('Illustrative', { exact: true }),
  ).toBeVisible();

  await catalogue
    .getByLabel('Service Definition', { exact: true })
    .selectOption({ label: `${code} — ${name}` });
  await catalogue.getByLabel('Commercial label').fill(`${label} changed`);
  const duplicateResponse = page.waitForResponse(
    mutationResponse('POST', '/api/commercial-catalogue/offerings'),
  );
  await catalogue.getByRole('button', { name: 'Record offering' }).click();
  expect((await duplicateResponse).status()).toBe(409);
  await expect(
    catalogue.getByText(
      `This Company already offers ${name} with a different commercial label. Offerings cannot be changed here.`,
      { exact: true },
    ),
  ).toBeVisible();
  await expect(catalogue.getByLabel('Commercial label')).toHaveValue(
    `${label} changed`,
  );

  await catalogue.getByLabel('Service code').fill(code);
  await catalogue.getByLabel('Service name').fill(`${name} renamed`);
  const conflictResponse = page.waitForResponse(
    mutationResponse('POST', '/api/commercial-catalogue/service-definitions'),
  );
  await catalogue.getByRole('button', { name: 'Define Service' }).click();
  expect((await conflictResponse).status()).toBe(409);
  await expect(
    catalogue.getByText(
      `Service code ${code} already exists in this Workspace with different content. Choose another code or reuse the existing definition unchanged.`,
      { exact: true },
    ),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(`service-catalogue-${suffix.toLowerCase()}.png`),
    fullPage: true,
  });

  await page.reload();
  await expect(definitions.getByText(code, { exact: true })).toBeVisible();
  await expect(offerings.getByText(label, { exact: true })).toBeVisible();
  await expect(catalogue.getByText(disclaimer, { exact: true })).toBeVisible();

  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Use classic frame' }).click();
  await expect(catalogue.getByText(disclaimer, { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Try Prisme' }).click();

  await navigate(page, navigation, 'Activity Log', narrow);
  const activity = page.locator('.activity-log');
  await expect(activity.getByText(code, { exact: false })).toHaveCount(0);

  await revokeServiceCatalogue(page);
  try {
    await page.reload();
    await expect(
      navigation.getByRole('link', { name: 'Service Catalogue', exact: true }),
    ).toHaveCount(0);
  } finally {
    await grantServiceCatalogue(page);
  }
});

const apiAdministratorHeaders = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};

async function revokeServiceCatalogue(page: Page): Promise<void> {
  const response = await page.request.delete(
    `http://127.0.0.1:4174/api/company-service-catalogue-assignments/${requiredEnvironment('ACCEPTANCE_PRIMARY_MEMBERSHIP_ID')}/${requiredEnvironment('ACCEPTANCE_PRIMARY_COMPANY_ID')}`,
    {
      headers: {
        ...apiAdministratorHeaders,
        'idempotency-key': `acceptance-revoke-catalogue-${crypto.randomUUID()}`,
      },
    },
  );
  expect(response.status()).toBe(200);
}

async function grantServiceCatalogue(page: Page): Promise<void> {
  const response = await page.request.post(
    'http://127.0.0.1:4174/api/company-service-catalogue-assignments',
    {
      headers: {
        ...apiAdministratorHeaders,
        'content-type': 'application/json',
        'idempotency-key': `acceptance-grant-catalogue-${crypto.randomUUID()}`,
      },
      data: {
        workspaceMembershipId: requiredEnvironment(
          'ACCEPTANCE_PRIMARY_MEMBERSHIP_ID',
        ),
        companyId: requiredEnvironment('ACCEPTANCE_PRIMARY_COMPANY_ID'),
      },
    },
  );
  expect(response.status()).toBe(201);
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function selectCompany(
  page: Page,
  company: ReturnType<Page['getByLabel']>,
  narrow: boolean,
): Promise<void> {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await company.selectOption({ label: 'PRISMA-PRIM' });
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
