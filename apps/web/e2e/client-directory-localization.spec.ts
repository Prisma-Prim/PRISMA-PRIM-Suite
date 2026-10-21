import { expect, test, type Page, type Route } from '@playwright/test';
import {
  actorContextFixture,
  operationalHomeFixture,
} from './actor-context.fixture';
import { selectOption } from './select-option';

const locales = [
  {
    code: 'ro',
    name: 'Română',
    localeLabel: 'Limba interfeței',
    searchLabel: 'Găsește un Client comun',
    search: 'Caută Clienți',
    link: 'Asociază cu Companie {company}',
    linking: 'Se asociază cu Companie {company}…',
    available: 'Disponibil în Companie {company}',
    error: 'Clienții nu au putut fi încărcați. Încercați din nou.',
    back: 'Înapoi la Clienții Companiei',
  },
  {
    code: 'ru',
    name: 'Русский',
    localeLabel: 'Язык интерфейса',
    searchLabel: 'Найти общего Клиента',
    search: 'Искать Клиентов',
    link: 'Связать с Companie {company}',
    linking: 'Связывание с Companie {company}…',
    available: 'Доступен в Companie {company}',
    error: 'Не удалось загрузить Клиентов. Повторите попытку.',
    back: 'Назад к Клиентам Компании',
  },
  {
    code: 'fr',
    name: 'Français',
    localeLabel: 'Langue de l’interface',
    searchLabel: 'Chercher un Client partagé',
    search: 'Rechercher des Clients',
    link: 'Ajouter à Companie {company}',
    linking: 'Ajout à Companie {company}…',
    available: 'Disponible dans Companie {company}',
    error: 'Impossible de charger les Clients. Réessayez.',
    back: 'Retour aux Clients de l’Entreprise',
  },
  {
    code: 'en',
    name: 'English',
    localeLabel: 'Interface language',
    searchLabel: 'Find a shared Client',
    search: 'Search Clients',
    link: 'Add to Companie {company}',
    linking: 'Adding to Companie {company}…',
    available: 'Available in Companie {company}',
    error: 'We could not load Clients. Please try again.',
    back: 'Back to Company Clients',
  },
] as const;

const company = { id: 'company-directory', displayName: 'Companie {company}' };
const client = {
  id: 'client-directory-literal',
  displayName: 'Știință {клиент} & Co',
  relatedToActiveCompany: false,
};
const query = '  Stiinta {клиент} & Co  ';

async function installRoutes(page: Page) {
  let linked = false;
  let directoryReads = 0;
  let firstLink: Route | undefined;
  const searches: { query: string | null; company: string | undefined }[] = [];
  const commands: {
    method: string;
    path: string;
    company: string | undefined;
    body: string | null;
    key: string | undefined;
  }[] = [];
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const companyId = request.headers()['x-company-context-id'];
    if (url.pathname.endsWith('/access/current-actor'))
      return route.fulfill({
        json: {
          ...actorContextFixture,
          workspacePermissions: ['company.manage', 'client.manage'],
          ...(companyId ? { activeCompany: company } : {}),
        },
      });
    if (url.pathname === '/api/companies')
      return route.fulfill({ json: [company] });
    if (url.pathname === '/api/activity-log')
      return route.fulfill({ json: { events: [] } });
    if (url.pathname === '/api/operational-home')
      return route.fulfill({
        json: operationalHomeFixture(company.id, {
          active_clients: linked ? 1 : 0,
        }),
      });
    if (url.pathname === '/api/clients/search') {
      searches.push({
        query: url.searchParams.get('query'),
        company: companyId,
      });
      return route.fulfill({
        json: [{ ...client, relatedToActiveCompany: linked }],
      });
    }
    if (
      url.pathname === `/api/clients/${client.id}/active-company-relationship`
    ) {
      commands.push({
        method: request.method(),
        path: url.pathname,
        company: companyId,
        body: request.postData(),
        key: request.headers()['idempotency-key'],
      });
      if (commands.length === 1) {
        firstLink = route;
        return;
      }
      linked = true;
      return route.fulfill({
        json: { ...client, relatedToActiveCompany: true },
      });
    }
    if (url.pathname === '/api/clients') {
      directoryReads += 1;
      expect(request.method()).toBe('GET');
      expect(companyId).toBe(company.id);
      return route.fulfill({
        json: linked ? [{ ...client, relatedToActiveCompany: true }] : [],
      });
    }
    return route.fulfill({ status: 404 });
  });
  return {
    searches,
    commands,
    directoryReads: () => directoryReads,
    async failFirstLink() {
      if (!firstLink) throw new Error('No pending explicit Client link');
      await firstLink.fulfill({
        status: 503,
        json: { message: 'Unavailable' },
      });
    },
  };
}

for (const locale of locales) {
  test(`Client search and explicit Company link preserve content and recovery in ${locale.code}`, async ({
    page,
  }, testInfo) => {
    const observed = await installRoutes(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/?frame=prisme#clients');
    if (testInfo.project.name === 'narrow')
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await selectOption(
      page.getByLabel('Active Company', { exact: true }),
      company.id,
    );
    if (testInfo.project.name === 'narrow')
      await page.getByRole('button', { name: 'Close navigation' }).click();
    const workspace = page.locator('#clients');
    await expect(workspace.getByLabel('Find a shared Client')).toBeVisible();
    await expect(
      workspace.getByText('No Clients for Companie {company} yet.', {
        exact: true,
      }),
    ).toBeVisible();
    await workspace.getByLabel('Find a shared Client').fill(query);
    const loadedDirectoryReads = observed.directoryReads();
    await selectOption(page.getByLabel('Interface language', { exact: true }), {
      label: locale.name,
    });
    await expect(workspace.getByLabel(locale.searchLabel)).toHaveValue(query);
    expect(observed.searches).toHaveLength(0);
    expect(observed.commands).toHaveLength(0);
    expect(observed.directoryReads()).toBe(loadedDirectoryReads);
    await workspace
      .getByRole('button', { name: locale.search, exact: true })
      .click();
    await expect(
      workspace.getByRole('heading', { name: client.displayName, exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`client-directory-${locale.code}-search.png`),
      fullPage: true,
    });
    await workspace
      .getByRole('button', { name: locale.link, exact: true })
      .click();
    await expect.poll(() => observed.commands.length).toBe(1);
    await expect(
      workspace.getByRole('button', { name: locale.linking, exact: true }),
    ).toBeDisabled();
    const alternate = locale.code === 'en' ? locales[0] : locales[3];
    await selectOption(page.getByLabel(locale.localeLabel, { exact: true }), {
      label: alternate.name,
    });
    await expect(
      workspace.getByRole('button', { name: alternate.linking, exact: true }),
    ).toBeDisabled();
    await expect(workspace.getByLabel(alternate.searchLabel)).toHaveValue(
      query,
    );
    expect(observed.commands).toHaveLength(1);
    expect(observed.searches).toHaveLength(1);
    expect(observed.directoryReads()).toBe(loadedDirectoryReads);
    await observed.failFirstLink();
    await expect(workspace.getByRole('alert')).toHaveText(alternate.error);
    await selectOption(
      page.getByLabel(alternate.localeLabel, { exact: true }),
      { label: locale.name },
    );
    await expect(workspace.getByRole('alert')).toHaveText(locale.error);
    await expect(workspace.getByLabel(locale.searchLabel)).toHaveValue(query);
    expect(observed.commands).toHaveLength(1);
    expect(observed.searches).toHaveLength(1);
    expect(observed.directoryReads()).toBe(loadedDirectoryReads);
    await workspace
      .getByRole('button', { name: locale.search, exact: true })
      .click();
    await expect(
      workspace.getByRole('heading', { name: client.displayName, exact: true }),
    ).toBeVisible();
    await workspace
      .getByRole('button', { name: locale.link, exact: true })
      .click();
    await expect(
      workspace.getByText(locale.available, { exact: true }),
    ).toBeVisible();
    expect(observed.searches).toEqual([
      { query: 'Stiinta {клиент} & Co', company: company.id },
      { query: 'Stiinta {клиент} & Co', company: company.id },
    ]);
    expect(observed.commands).toEqual([
      {
        method: 'PUT',
        path: '/api/clients/client-directory-literal/active-company-relationship',
        company: company.id,
        body: null,
        key: undefined,
      },
      {
        method: 'PUT',
        path: '/api/clients/client-directory-literal/active-company-relationship',
        company: company.id,
        body: null,
        key: undefined,
      },
    ]);
    await workspace
      .getByRole('button', { name: locale.back, exact: true })
      .click();
    await page.reload();
    await expect(
      workspace.getByRole('heading', { name: client.displayName, exact: true }),
    ).toBeVisible();
    await expect(
      workspace.getByText(locale.available, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel(locale.localeLabel, { exact: true }),
    ).toHaveAttribute('data-value', locale.code);
    expect(observed.commands).toHaveLength(2);
    expect(observed.searches).toHaveLength(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`client-directory-${locale.code}.png`),
      fullPage: true,
    });
  });
}
