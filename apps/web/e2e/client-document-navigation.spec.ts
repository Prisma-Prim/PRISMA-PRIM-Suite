import { expect, test, type Page, type Route } from '@playwright/test';
import { actorContextFixture } from './actor-context.fixture';

const company = { id: 'company-navigation', displayName: 'PRISMA-PRIM' };
const otherCompany = { id: 'company-second', displayName: 'BIC' };
const client = {
  id: 'client-navigation',
  displayName: 'Shared display name',
  relatedToActiveCompany: true,
};
const homonymClient = {
  id: 'client-homonym',
  displayName: 'Shared display name',
  relatedToActiveCompany: true,
};
const dossierOf = (account: { id: string; displayName: string }) => ({
  ...account,
  taxId: null,
  address: null,
  telephone: null,
  generalEmail: null,
  contacts: [],
  businessActivity: null,
  version: 1,
  involvedCompanyDisplayNames: [company.displayName],
});
const workingDocument = {
  id: 'document-navigation',
  companyId: company.id,
  clientId: 'historical-client-navigation',
  clientDossierId: client.id,
  clientDisplayName: client.displayName,
  title: 'Navigation questionnaire',
  purpose: 'Prepare the navigation interview',
  type: 'questionnaire',
  confidentiality: 'company-confidential',
  createdAt: '2026-09-19T08:00:00.000Z',
  workingRevision: 1,
  correction: 'allowed',
  version: {
    id: 'version-navigation',
    status: 'draft',
    representation: {
      id: 'representation-navigation',
      kind: 'external-reference',
      verification: 'unverified',
      access: 'granted',
      url: 'https://example.test/navigation',
    },
  },
};
const homonymDocument = {
  ...workingDocument,
  id: 'document-homonym',
  clientId: homonymClient.id,
  clientDossierId: homonymClient.id,
  title: 'Homonym questionnaire',
};
const unprojectedDocument = {
  ...workingDocument,
  id: 'document-unprojected',
  clientId: 'client-without-projection',
  clientDossierId: undefined,
  clientDisplayName: client.displayName,
  title: 'Unprojected questionnaire',
};
const otherCompanyDocument = {
  ...workingDocument,
  id: 'document-other-company',
  companyId: otherCompany.id,
  clientId: 'client-other-company',
  clientDossierId: 'client-other-company',
  clientDisplayName: 'Other Company Client',
  title: 'Other Company questionnaire',
};

function routeApi(page: Page, documentPermissions: string[]) {
  let documentListReads = 0;
  const handler = (route: Route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const companyContext = request.headers()['x-company-context-id'];
    if (path === '/api/access/current-actor')
      return route.fulfill({
        json: {
          ...actorContextFixture,
          workspacePermissions: ['client.manage'],
          ...(companyContext
            ? {
                activeCompany: {
                  ...(companyContext === otherCompany.id
                    ? otherCompany
                    : company),
                  clientPermissions: ['client.read'],
                  documentPermissions,
                },
              }
            : {}),
        },
      });
    if (path === '/api/companies')
      return route.fulfill({ json: [company, otherCompany] });
    if (path === '/api/activity-log')
      return route.fulfill({ json: { events: [] } });
    if (path === '/api/clients')
      return route.fulfill({
        json: companyContext === otherCompany.id ? [] : [client, homonymClient],
      });
    if (path === `/api/clients/${client.id}`)
      return route.fulfill({ json: dossierOf(client) });
    if (path === `/api/clients/${homonymClient.id}`)
      return route.fulfill({ json: dossierOf(homonymClient) });
    if (path === '/api/documents') {
      documentListReads += 1;
      return route.fulfill({
        json:
          companyContext === otherCompany.id
            ? [otherCompanyDocument]
            : [workingDocument, homonymDocument, unprojectedDocument],
      });
    }
    for (const document of [
      workingDocument,
      homonymDocument,
      unprojectedDocument,
      otherCompanyDocument,
    ])
      if (path === `/api/documents/${document.id}`)
        return route.fulfill({ json: document });
    return route.fulfill({ status: 404 });
  };
  return {
    install: () => page.route('**/api/**', handler),
    documentListReads: () => documentListReads,
  };
}

for (const frame of ['classic', 'prisme'] as const) {
  test(`${frame} restricts working Documents to one dossier identity and returns to it`, async ({
    page,
  }, testInfo) => {
    const api = routeApi(page, ['document.read', 'document.reference.read']);
    await api.install();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/?frame=${frame}#clients`);
    await selectCompany(page, frame, testInfo.project.name, company.id);
    await page.goto(`/?frame=${frame}#clients`);

    const workingDocuments = page.locator('.working-documents');
    const dossierRegion = page.locator('.client-dossier-detail');
    const documentFilter = workingDocuments.getByRole('searchbox', {
      name: 'Filter working Documents',
    });
    await openDossier(page, client.displayName, 0);
    await expect(
      dossierRegion.getByRole('heading', {
        name: client.displayName,
        exact: true,
      }),
    ).toBeVisible();
    const readsBeforeNavigation = api.documentListReads();
    await dossierRegion
      .getByRole('button', { name: 'Open Client working Documents' })
      .click();

    const documentsTarget = page.locator('#documents');
    await expect(documentsTarget).toBeFocused();
    expect(
      await documentsTarget.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.top < window.innerHeight && bounds.bottom > 0;
      }),
    ).toBe(true);
    await expect(documentFilter).toHaveValue(client.displayName);
    // Identity equality, never the displayed name shared with the homonym Client.
    await expect(workingDocuments.getByRole('listitem')).toHaveCount(1);
    await expect(
      workingDocuments.getByRole('button', {
        name: workingDocument.title,
        exact: true,
      }),
    ).toBeVisible();
    expect(api.documentListReads()).toBe(readsBeforeNavigation);

    await documentFilter.fill(client.displayName.toLowerCase());
    await expect(workingDocuments.getByRole('listitem')).toHaveCount(3);

    await workingDocuments
      .getByRole('button', { name: workingDocument.title, exact: true })
      .click();
    await expect(
      workingDocuments.getByRole('heading', {
        name: workingDocument.title,
        exact: true,
      }),
    ).toBeVisible();
    await workingDocuments
      .getByRole('button', { name: 'Open Client dossier' })
      .click();
    await expect(page.locator('#clients')).toBeFocused();
    await expect(
      dossierRegion.getByRole('heading', {
        name: client.displayName,
        exact: true,
      }),
    ).toBeVisible();

    await dossierRegion
      .getByRole('button', { name: 'Open Client working Documents' })
      .click();
    await expect(workingDocuments.getByRole('listitem')).toHaveCount(1);
    await selectCompany(page, frame, testInfo.project.name, otherCompany.id);
    await expect(
      workingDocuments.getByRole('button', {
        name: otherCompanyDocument.title,
        exact: true,
      }),
    ).toBeVisible();
    await expect(documentFilter).toHaveValue('');

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`${frame}-client-document-navigation.png`),
      fullPage: true,
    });
  });

  test(`${frame} hides the dossier action for working Documents without current read access`, async ({
    page,
  }, testInfo) => {
    const api = routeApi(page, []);
    await api.install();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/?frame=${frame}#clients`);
    await selectCompany(page, frame, testInfo.project.name, company.id);
    await page.goto(`/?frame=${frame}#clients`);

    await openDossier(page, client.displayName, 0);
    const dossierRegion = page.locator('.client-dossier-detail');
    await expect(
      dossierRegion.getByRole('heading', {
        name: client.displayName,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      dossierRegion.getByRole('button', {
        name: 'Open Client working Documents',
      }),
    ).toHaveCount(0);
  });
}

async function openDossier(
  page: Page,
  displayName: string,
  index: number,
): Promise<void> {
  await page
    .locator('.client-workspace')
    .getByRole('listitem')
    .filter({
      has: page.getByRole('heading', { name: displayName, exact: true }),
    })
    .nth(index)
    .getByRole('button', { name: 'Open dossier' })
    .click();
}

async function selectCompany(
  page: Page,
  frame: 'classic' | 'prisme',
  projectName: string,
  companyId: string,
): Promise<void> {
  const narrow = frame === 'prisme' && projectName === 'narrow';
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByLabel('Active Company', { exact: true })
    .selectOption(companyId);
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
}
