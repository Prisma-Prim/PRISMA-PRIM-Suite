import { enterClassicCompatibility } from './classic-compatibility';
import {
  expect,
  test,
  type Locator,
  type Page,
  type Request,
  type TestInfo,
} from '@playwright/test';

const apiOrigin = 'http://127.0.0.1:4174';
const apiIdentityHeaders = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'local-demonstration-user',
  'x-test-display-name': 'Ada Ionescu',
  'x-test-email': 'ada@example.test',
};

test('navigates between one Client dossier and its working Documents through the real API and PostgreSQL', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'Narrow' : 'Desktop';
  const clientName = `Document Navigation Client ${suffix}`;
  const relatedClientName = `${clientName} Partner`;
  const documentTitle = `Navigation questionnaire ${suffix}`;
  const relatedDocumentTitle = `Partner questionnaire ${suffix}`;
  const companyId = requiredEnvironment('ACCEPTANCE_PRIMARY_COMPANY_ID');

  // Registered through the same real API and PostgreSQL the browser reads.
  const clientId = await seedClient(page, companyId, clientName);
  const relatedClientId = await seedClient(page, companyId, relatedClientName);
  await seedDocument(page, companyId, {
    clientId,
    title: documentTitle,
    purpose: `Prepare the ${suffix} navigation interview`,
    url: `https://example.test/navigation-${suffix.toLowerCase()}`,
  });
  await seedDocument(page, companyId, {
    clientId: relatedClientId,
    title: relatedDocumentTitle,
    purpose: `Prepare the ${suffix} partner interview`,
    url: `https://example.test/navigation-partner-${suffix.toLowerCase()}`,
  });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const company = page.getByLabel('Active Company', { exact: true });
  const navigation = page.getByRole('navigation', {
    name: 'Primary navigation',
  });
  const clients = page.locator('.client-workspace');
  const dossier = page.locator('.client-dossier-detail');
  const workingDocuments = page.locator('.working-documents');
  const documentFilter = workingDocuments.getByRole('searchbox', {
    name: 'Filter working Documents',
  });
  await selectCompany(page, company, narrow);

  await navigate(page, navigation, 'Working Documents', narrow);
  await expect(
    workingDocuments.getByRole('button', { name: documentTitle, exact: true }),
  ).toBeVisible();
  await expect(
    workingDocuments.getByRole('button', {
      name: relatedDocumentTitle,
      exact: true,
    }),
  ).toBeVisible();

  const mutations: string[] = [];
  const documentListReads: string[] = [];
  const recordRequest = (request: Request) => {
    const { pathname } = new URL(request.url());
    if (!pathname.startsWith('/api/')) return;
    if (request.method() !== 'GET')
      mutations.push(`${request.method()} ${pathname}`);
    else if (pathname === '/api/documents') documentListReads.push(pathname);
  };
  page.on('request', recordRequest);

  await navigate(page, navigation, 'Clients', narrow);
  await openDossier(page, clients, clientName);
  await expect(
    dossier.getByRole('heading', { name: clientName, exact: true }),
  ).toBeVisible();
  await dossier
    .getByRole('button', { name: 'Open Client working Documents' })
    .click();

  await expect(page.locator('#documents')).toBeFocused();
  await expect(documentFilter).toHaveValue(clientName);
  await expect(workingDocuments.getByRole('listitem')).toHaveCount(1);
  await expect(
    workingDocuments.getByRole('button', { name: documentTitle, exact: true }),
  ).toBeVisible();
  await capture(
    page,
    testInfo,
    `client-document-navigation-${suffix.toLowerCase()}-prisme.png`,
  );

  // The existing free-text filter stays available outside the identity restriction.
  await documentFilter.fill(clientName.toLowerCase());
  await expect(workingDocuments.getByRole('listitem')).toHaveCount(2);
  await expect(
    workingDocuments.getByRole('button', {
      name: relatedDocumentTitle,
      exact: true,
    }),
  ).toBeVisible();

  await workingDocuments
    .getByRole('button', { name: documentTitle, exact: true })
    .click();
  await expect(
    workingDocuments.getByRole('heading', { name: documentTitle, exact: true }),
  ).toBeVisible();
  await workingDocuments
    .getByRole('button', { name: 'Open Client dossier' })
    .click();
  await expect(page.locator('#clients')).toBeFocused();
  await expect(
    dossier.getByRole('heading', { name: clientName, exact: true }),
  ).toBeVisible();
  page.off('request', recordRequest);
  expect(mutations).toEqual([]);
  expect(documentListReads).toEqual([]);

  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await enterClassicCompatibility(page);
  await dossier
    .getByRole('button', { name: 'Open Client working Documents' })
    .click();
  await expect(page.locator('#documents')).toBeFocused();
  await expect(documentFilter).toHaveValue(clientName);
  await expect(workingDocuments.getByRole('listitem')).toHaveCount(1);
  await expect(
    workingDocuments.getByRole('button', { name: documentTitle, exact: true }),
  ).toBeVisible();
  await capture(
    page,
    testInfo,
    `client-document-navigation-${suffix.toLowerCase()}-classic.png`,
  );
});

async function seedClient(
  page: Page,
  companyId: string,
  displayName: string,
): Promise<string> {
  return seed(page, companyId, '/api/clients', { displayName });
}

async function seedDocument(
  page: Page,
  companyId: string,
  input: { clientId: string; title: string; purpose: string; url: string },
): Promise<string> {
  return seed(page, companyId, '/api/documents', input);
}

async function seed(
  page: Page,
  companyId: string,
  path: string,
  data: Record<string, string>,
): Promise<string> {
  const response = await page.request.post(`${apiOrigin}${path}`, {
    headers: {
      ...apiIdentityHeaders,
      'x-company-context-id': companyId,
      'content-type': 'application/json',
      'idempotency-key': `acceptance-navigation-${crypto.randomUUID()}`,
    },
    data,
  });
  expect(response.status()).toBe(201);
  const value: unknown = await response.json();
  if (
    typeof value !== 'object' ||
    value === null ||
    !('id' in value) ||
    typeof value.id !== 'string'
  )
    throw new Error(`Expected an identified record from ${path}.`);
  return value.id;
}

async function openDossier(
  page: Page,
  clients: Locator,
  displayName: string,
): Promise<void> {
  await clients
    .getByRole('listitem')
    .filter({
      has: page.getByRole('heading', { name: displayName, exact: true }),
    })
    .getByRole('button', { name: 'Open dossier' })
    .click();
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function selectCompany(
  page: Page,
  company: Locator,
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
  navigation: Locator,
  label: string,
  narrow: boolean,
): Promise<void> {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await navigation.getByRole('link', { name: label, exact: true }).click();
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

async function capture(
  page: Page,
  testInfo: TestInfo,
  filename: string,
): Promise<void> {
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(filename),
    fullPage: true,
  });
}
