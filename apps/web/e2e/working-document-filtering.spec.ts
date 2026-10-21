import { enterClassicCompatibility } from './classic-compatibility';
import { expectValue, selectOption } from './select-option';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { WorkingDocument } from '../src/documents/document-response';
import {
  actorContextFixture,
  operationalHomeFixture,
} from './actor-context.fixture';
import {
  DOCUMENT_VERSIONS_PATH,
  draftVersionsOf,
} from './document-versions.fixture';

const firstCompany = {
  id: 'document-filter-company',
  displayName: 'PRISMA-PRIM',
};
const secondCompany = {
  id: 'document-filter-company-other',
  displayName: 'BIC',
};
const firstDocument = {
  id: 'document-filter-first',
  companyId: firstCompany.id,
  clientId: 'document-filter-client-first',
  clientDisplayName: 'Țară Advisory',
  title: 'Ședință inițială',
  purpose: 'Prepare the assessment',
  type: 'questionnaire',
  confidentiality: 'company-confidential',
  createdAt: '2026-09-20T00:00:00.000Z',
  workingRevision: 1,
  correction: 'allowed',
  version: {
    id: 'document-filter-version-first',
    status: 'draft',
    representation: {
      id: 'document-filter-representation-first',
      kind: 'external-reference',
      verification: 'unverified',
      access: 'granted',
      url: 'https://example.test/initial-questionnaire',
    },
  },
} satisfies WorkingDocument;
const firstCompanyDocuments = [
  firstDocument,
  {
    ...firstDocument,
    id: 'document-filter-second',
    clientId: 'document-filter-client-second',
    clientDisplayName: 'Alpha Advisory',
    title: 'Supplier evidence checklist',
    version: {
      ...firstDocument.version,
      id: 'document-filter-version-second',
      representation: {
        ...firstDocument.version.representation,
        id: 'document-filter-representation-second',
        url: 'https://example.test/supplier-evidence',
      },
    },
  },
  {
    ...firstDocument,
    id: 'opaque-filter-secret',
    clientId: 'document-filter-client-third',
    clientDisplayName: 'Beta Industries',
    title: 'Annual review notes',
    version: {
      ...firstDocument.version,
      id: 'document-filter-version-third',
      representation: {
        ...firstDocument.version.representation,
        id: 'document-filter-representation-third',
        url: 'https://example.test/annual-review',
      },
    },
  },
] satisfies WorkingDocument[];
const secondCompanyDocument = {
  ...firstDocument,
  id: 'document-filter-other-company',
  companyId: secondCompany.id,
  clientId: 'document-filter-client-other-company',
  clientDisplayName: 'BIC Client',
  title: 'BIC preparation questionnaire',
  version: {
    ...firstDocument.version,
    id: 'document-filter-version-other-company',
    representation: {
      ...firstDocument.version.representation,
      id: 'document-filter-representation-other-company',
      url: 'https://example.test/bic-questionnaire',
    },
  },
} satisfies WorkingDocument;

test('filters loaded Working Documents locally and resets at the Company boundary', async ({
  page,
}, testInfo) => {
  const listReads: string[] = [];
  const mutationRequests: string[] = [];
  await interceptApplication(page, listReads, mutationRequests);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?frame=prisme#documents');
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(
    page.getByLabel('Active Company', { exact: true }),
    firstCompany.id,
  );
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Close navigation' }).click();

  const workspace = page.getByRole('region', { name: 'Working Documents' });
  const filter = workspace.getByLabel('Filter working Documents');
  const documentButtons = workspace.locator('ul').getByRole('button');
  await expect(documentButtons).toHaveText([
    firstDocument.title,
    'Supplier evidence checklist',
    'Annual review notes',
  ]);
  expect(listReads).toEqual([firstCompany.id]);

  await filter.focus();
  await expect(filter).toBeFocused();
  expect(
    await filter.evaluate((element) => getComputedStyle(element).outlineStyle),
  ).toBe('solid');
  await filter.fill('ALPHA advisory');
  await expect(documentButtons).toHaveText(['Supplier evidence checklist']);
  expect(listReads).toEqual([firstCompany.id]);

  await filter.fill('opaque-filter-secret');
  await expect(
    workspace.getByText('No loaded working Documents match this filter.'),
  ).toBeVisible();
  await expect(
    workspace.getByText('No working references registered yet.'),
  ).toHaveCount(0);
  await expect(documentButtons).toHaveCount(0);
  expect(listReads).toEqual([firstCompany.id]);

  await filter.fill('');
  await expect(documentButtons).toHaveText([
    firstDocument.title,
    'Supplier evidence checklist',
    'Annual review notes',
  ]);
  await documentButtons.getByText(firstDocument.title, { exact: true }).click();
  await expect(
    workspace.getByRole('heading', { name: firstDocument.title }),
  ).toBeVisible();

  await workspace.getByRole('button', { name: 'Edit reference' }).click();
  await workspace.getByLabel('Title', { exact: true }).fill('Unsaved title');
  await filter.fill('hidden while detail stays open');
  await expect(workspace.locator('article')).toBeVisible();
  await expectValue(
    workspace.getByLabel('Title', { exact: true }),
    'Unsaved title',
  );

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath(
      `working-document-filter-prisme-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });

  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await enterClassicCompatibility(page);
  await expectValue(
    page.getByLabel('Filter working Documents'),
    'hidden while detail stays open',
  );
  await expectValue(page.getByLabel('Title', { exact: true }), 'Unsaved title');
  await page.getByLabel('Filter working Documents').focus();
  await expect(page.getByLabel('Filter working Documents')).toBeFocused();
  expect(
    await page
      .getByLabel('Filter working Documents')
      .evaluate((element) => getComputedStyle(element).outlineStyle),
  ).toBe('solid');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath(
      `working-document-filter-classic-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });

  await selectOption(
    page.getByLabel('Active Company', { exact: true }),
    secondCompany.id,
  );
  await expect(
    page.getByRole('button', { name: secondCompanyDocument.title }),
  ).toBeVisible();
  await expectValue(page.getByLabel('Filter working Documents'), '');
  await expect(page.getByLabel('Title', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Unsaved title')).toHaveCount(0);
  expect(listReads).toEqual([firstCompany.id, secondCompany.id]);
  expect(mutationRequests).toEqual([]);
});

test('matches Romanian Document spelling through all interface languages without I/O', async ({
  page,
}, testInfo) => {
  const listReads: string[] = [];
  const mutationRequests: string[] = [];
  await interceptApplication(page, listReads, mutationRequests);
  await page.goto('/?frame=prisme#documents');
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(
    page.getByLabel('Active Company', { exact: true }),
    firstCompany.id,
  );
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Close navigation' }).click();
  const firstWorkspace = page.getByRole('region', {
    name: 'Working Documents',
  });
  const initialFilter = firstWorkspace.getByRole('searchbox', {
    name: 'Filter working Documents',
  });
  await expect(firstWorkspace.locator('ul').getByRole('button')).toHaveCount(3);
  await initialFilter.fill('t\u0327ara');
  await expect(firstWorkspace.locator('ul').getByRole('button')).toHaveText([
    firstDocument.title,
  ]);
  await initialFilter.fill(' SEDINTA ');
  await initialFilter.press('Tab');
  await expect(
    firstWorkspace.getByRole('button', {
      name: firstDocument.title,
      exact: true,
    }),
  ).toBeFocused();
  let previousLanguageLabel = 'Interface language';
  for (const locale of [
    {
      code: 'ro',
      index: 0,
      language: 'Limba interfeței',
      region: 'Documente de lucru',
      filter: 'Filtrează Documentele de lucru',
    },
    {
      code: 'ru',
      index: 1,
      language: 'Язык интерфейса',
      region: 'Рабочие Документы',
      filter: 'Фильтр рабочих Документов',
    },
    {
      code: 'fr',
      index: 2,
      language: 'Langue de l’interface',
      region: 'Documents de travail',
      filter: 'Filtrer les Documents de travail',
    },
    {
      code: 'en',
      index: 3,
      language: 'Interface language',
      region: 'Working Documents',
      filter: 'Filter working Documents',
    },
  ]) {
    const languageControl = page.getByRole('combobox', {
      name: previousLanguageLabel,
      exact: true,
    });
    await languageControl.focus();
    await languageControl.press('Enter');
    await languageControl.press('Home');
    for (let index = 0; index < locale.index; index += 1)
      await languageControl.press('ArrowDown');
    await languageControl.press('Enter');
    await expect(
      page.getByRole('combobox', { name: locale.language, exact: true }),
    ).toBeFocused();
    const workspace = page.getByRole('region', { name: locale.region });
    const filter = workspace.getByRole('searchbox', { name: locale.filter });
    await expectValue(filter, ' SEDINTA ');
    await expect(workspace.locator('ul').getByRole('button')).toHaveText([
      firstDocument.title,
    ]);
    await filter.focus();
    await expect(filter).toBeFocused();
    expect(
      await filter.evaluate(
        (element) => getComputedStyle(element).outlineStyle,
      ),
    ).toBe('solid');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await filter.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(
        `working-document-romanian-${locale.code}-${testInfo.project.name}.png`,
      ),
      fullPage: false,
    });
    expect(listReads).toEqual([firstCompany.id]);
    expect(mutationRequests).toEqual([]);
    previousLanguageLabel = locale.language;
  }
  await initialFilter.fill('');
  await expect(firstWorkspace.locator('ul').getByRole('button')).toHaveText([
    firstDocument.title,
    'Supplier evidence checklist',
    'Annual review notes',
  ]);
  expect(listReads).toEqual([firstCompany.id]);
  expect(mutationRequests).toEqual([]);
});

async function interceptApplication(
  page: Page,
  listReads: string[],
  mutationRequests: string[],
) {
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const companyId = request.headers()['x-company-context-id'];
    if (request.method() !== 'GET') mutationRequests.push(path);
    if (path === '/api/access/current-actor') {
      const company = [firstCompany, secondCompany].find(
        (candidate) => candidate.id === companyId,
      );
      return route.fulfill({
        json: {
          ...actorContextFixture,
          workspacePermissions: [],
          ...(company
            ? {
                activeCompany: {
                  ...company,
                  clientPermissions: ['client.read'],
                  documentPermissions: [
                    'document.read',
                    'document.reference.read',
                    'document.correct',
                  ],
                },
              }
            : {}),
        },
      });
    }
    if (path === '/api/companies')
      return route.fulfill({ json: [firstCompany, secondCompany] });
    if (path === '/api/operational-home' && companyId)
      return route.fulfill({
        json: operationalHomeFixture(companyId, { active_clients: 0 }),
      });
    if (path === '/api/clients') return route.fulfill({ json: [] });
    if (path === '/api/activity-log')
      return route.fulfill({ json: { events: [] } });
    if (path === '/api/documents') {
      listReads.push(companyId ?? '');
      return route.fulfill({
        json:
          companyId === secondCompany.id
            ? [secondCompanyDocument]
            : firstCompanyDocuments,
      });
    }
    if (path.startsWith('/api/documents/')) {
      const documentId = path.split('/')[3];
      const document = [...firstCompanyDocuments, secondCompanyDocument].find(
        (candidate) => candidate.id === documentId,
      );
      if (document && DOCUMENT_VERSIONS_PATH.test(path))
        return route.fulfill({ json: draftVersionsOf(document) });
      return document
        ? route.fulfill({ json: document })
        : route.fulfill({ status: 404 });
    }
    return route.fulfill({ status: 404 });
  });
}
