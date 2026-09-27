import {
  expect,
  test,
  type Page,
  type Route,
  type TestInfo,
} from '@playwright/test';
import { selectOption } from './select-option';
import { actorContextFixture } from './actor-context.fixture';

test.use({ locale: 'fr-FR', storageState: { cookies: [], origins: [] } });

const localeKey = 'prisma-prim.interface-locale';
const company = {
  id: '00000000-0000-4000-8000-000000000447',
  workspaceId: actorContextFixture.workspaceId,
  displayName: 'Societate Test',
  status: 'active',
  createdAt: '2026-09-27T08:30:00.000Z',
  createdByInternalUserId: actorContextFixture.internalUserId,
};

const locales = [
  {
    code: 'ro',
    languageLabel: 'Limba interfeței',
    publicTitle: 'Faceți fiecare decizie trasabilă.',
    access: 'Se verifică accesul…',
    greeting: 'Bună, Ada Ionescu.',
    overview: 'Prezentare generală',
    hero: 'Claritate pentru a merge înainte.',
    navigation: 'Navigare principală',
    companies: 'Companii',
    companyContext: 'Contextul Companiei',
    activeCompany: 'Companie activă',
    registration: 'Companie furnizoare',
    displayName: 'Numele afișat al Companiei',
  },
  {
    code: 'ru',
    languageLabel: 'Язык интерфейса',
    publicTitle: 'Сделайте каждое решение отслеживаемым.',
    access: 'Проверяем ваш доступ…',
    greeting: 'Здравствуйте, Ada Ionescu.',
    overview: 'Обзор',
    hero: 'Ясность для движения вперёд.',
    navigation: 'Основная навигация',
    companies: 'Компании',
    companyContext: 'Контекст Компании',
    activeCompany: 'Активная Компания',
    registration: 'Компания-поставщик',
    displayName: 'Отображаемое имя Компании',
  },
  {
    code: 'fr',
    languageLabel: 'Langue de l’interface',
    publicTitle: 'Rendez chaque décision traçable.',
    access: 'Vérification de votre accès…',
    greeting: 'Bonjour, Ada Ionescu.',
    overview: 'Vue d’ensemble',
    hero: 'La clarté pour avancer.',
    navigation: 'Navigation principale',
    companies: 'Entreprises',
    companyContext: 'Contexte de l’Entreprise',
    activeCompany: 'Entreprise active',
    registration: 'Entreprise prestataire',
    displayName: 'Nom affiché de l’Entreprise',
  },
  {
    code: 'en',
    languageLabel: 'Interface language',
    publicTitle: 'Make every decision traceable.',
    access: 'Verifying your access…',
    greeting: 'Hello, Ada Ionescu.',
    overview: 'Overview',
    hero: 'Clarity to move forward.',
    navigation: 'Primary navigation',
    companies: 'Companies',
    companyContext: 'Company context',
    activeCompany: 'Active Company',
    registration: 'Provider Company',
    displayName: 'Company display name',
  },
] as const;

type LocaleProof = (typeof locales)[number];

async function installJourneyRoutes(
  page: Page,
  initial: { holdActor: boolean; created: boolean },
) {
  const commands: Array<{ body: string | null; idempotencyKey: string }> = [];
  let pendingActor: Route | undefined;
  let holdActor = initial.holdActor;
  let created = initial.created;

  await page.route('**/api/access/current-actor', (route) => {
    if (holdActor) {
      pendingActor = route;
      return;
    }
    return route.fulfill({
      json: {
        ...actorContextFixture,
        ...(created &&
        route.request().headers()['x-company-context-id'] === company.id
          ? {
              activeCompany: {
                id: company.id,
                displayName: company.displayName,
              },
            }
          : {}),
      },
    });
  });
  await page.route('**/api/activity-log', (route) =>
    route.fulfill({ json: { events: [] } }),
  );
  await page.route('**/api/companies', (route) => {
    const request = route.request();
    if (request.method() === 'GET')
      return route.fulfill({ json: created ? [company] : [] });
    commands.push({
      body: request.postData(),
      idempotencyKey: request.headers()['idempotency-key'] ?? '',
    });
    if (commands.length === 1) return route.fulfill({ status: 503 });
    created = true;
    return route.fulfill({ status: 201, json: company });
  });
  await page.route(`**/api/companies/${company.id}`, (route) =>
    route.fulfill({ json: company }),
  );

  return {
    commands,
    async releaseActor() {
      await expect.poll(() => Boolean(pendingActor)).toBe(true);
      holdActor = false;
      if (!pendingActor) throw new Error('Expected pending access check');
      await pendingActor.fulfill({ json: actorContextFixture });
    },
    async expectActorPending() {
      await expect.poll(() => Boolean(pendingActor)).toBe(true);
    },
  };
}

test('defaults to Romanian and switches all four languages during entry and access', async ({
  page,
}, testInfo) => {
  const journey = await installJourneyRoutes(page, {
    holdActor: true,
    created: false,
  });

  await page.goto('/');
  await page.evaluate((key) => {
    localStorage.removeItem(key);
    sessionStorage.setItem('deterministic-auth-state', 'signed-out');
  }, localeKey);
  await page.reload();
  let currentLocale: LocaleProof = locales[0];
  for (const locale of locales) {
    if (locale !== currentLocale)
      await chooseLocale(page, currentLocale.languageLabel, locale.code);
    await expect(page.locator('html')).toHaveAttribute('lang', locale.code);
    await expect(
      page.getByRole('heading', { name: locale.publicTitle }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(
        `locale-${locale.code}-entry-${testInfo.project.name}.png`,
      ),
      fullPage: true,
    });
    currentLocale = locale;
  }
  await chooseLocale(page, currentLocale.languageLabel, 'ro');
  currentLocale = locales[0];

  await page.evaluate(() =>
    sessionStorage.setItem('deterministic-auth-state', 'signed-in'),
  );
  await page.reload();
  await journey.expectActorPending();
  for (const locale of locales) {
    if (locale !== currentLocale)
      await chooseLocale(page, currentLocale.languageLabel, locale.code);
    await expect(page.getByRole('status')).toHaveText(locale.access);
    await page.screenshot({
      path: testInfo.outputPath(
        `locale-${locale.code}-access-${testInfo.project.name}.png`,
      ),
      fullPage: true,
    });
    currentLocale = locale;
  }
  await chooseLocale(page, currentLocale.languageLabel, 'ro');
  await journey.releaseActor();
  await expect(
    page.getByRole('heading', { name: 'Bună, Ada Ionescu.' }),
  ).toBeVisible();
  expect(journey.commands).toHaveLength(0);
});

test('preserves Company drafts across all four languages and retries the identical command', async ({
  page,
}, testInfo) => {
  const { commands } = await installJourneyRoutes(page, {
    holdActor: false,
    created: false,
  });
  await page.goto('/app');
  await expect(
    page.getByRole('heading', { name: 'Bună, Ada Ionescu.' }),
  ).toBeVisible();
  let currentLocale: LocaleProof = locales[0];

  await openCompanies(page, testInfo.project.name, 'Companii');
  const draft = page.locator('#company-display-name');
  await draft.fill('  Societate Test  ');

  for (const locale of locales) {
    if (locale !== currentLocale)
      await chooseLocale(page, currentLocale.languageLabel, locale.code);
    await proveAuthenticatedJourney(
      page,
      testInfo.project.name,
      locale,
      draft,
      testInfo,
    );
    currentLocale = locale;
  }
  const englishRegistration = page.getByRole('region', {
    name: 'Provider Company',
  });
  await englishRegistration
    .getByRole('button', { name: 'Register Company' })
    .click();
  await expect(englishRegistration.getByRole('alert')).toContainText(
    'retried safely',
  );
  await page.screenshot({
    path: testInfo.outputPath(`locale-en-retry-${testInfo.project.name}.png`),
    fullPage: true,
  });

  await chooseLocale(page, 'Interface language', 'ro');
  await expect(draft).toHaveValue('  Societate Test  ');
  await page
    .getByRole('region', { name: 'Companie furnizoare' })
    .getByRole('button', { name: 'Înregistrați Compania' })
    .click();
  await expect(
    page.getByRole('heading', { name: company.displayName }),
  ).toBeVisible();
  expect(commands).toHaveLength(2);
  expect(commands[0]).toEqual(commands[1]);
  expect(commands[0]?.body).toBe(
    JSON.stringify({ displayName: company.displayName }),
  );
  expect(commands[0]?.idempotencyKey).not.toBe('');
  await page.screenshot({
    path: testInfo.outputPath(
      `locale-ro-registered-${testInfo.project.name}.png`,
    ),
    fullPage: true,
  });
});

for (const locale of locales) {
  test(`retains ${locale.code} and the selected Company after reload without issuing a command`, async ({
    page,
  }, testInfo) => {
    const { commands } = await installJourneyRoutes(page, {
      holdActor: false,
      created: true,
    });
    await page.goto('/app');
    await expect(
      page.getByRole('heading', { name: 'Bună, Ada Ionescu.' }),
    ).toBeVisible();
    await openCompanies(page, testInfo.project.name, 'Companii');
    await openNavigation(page, testInfo.project.name);
    await selectOption(
      page.getByRole('combobox', { name: 'Companie activă', exact: true }),
      company.id,
    );
    await expect(
      page.getByRole('combobox', { name: 'Companie activă', exact: true }),
    ).toHaveAttribute('data-value', company.id);
    await closeNavigation(page, testInfo.project.name);
    await chooseLocale(page, locales[0].languageLabel, locale.code);
    await page.reload();
    // Reload preserves the Companies route; Home requires its own navigation.
    await expect(page).toHaveURL(/#companies$/u);
    await expect(page.locator('html')).toHaveAttribute('lang', locale.code);
    await expect(
      page.getByRole('heading', { name: locale.companies, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: locale.registration }),
    ).toBeVisible();
    await openNavigation(page, testInfo.project.name);
    await expect(
      page.getByRole('region', { name: locale.companyContext }),
    ).toBeVisible();
    await expect(
      page.getByRole('combobox', { name: locale.activeCompany, exact: true }),
    ).toHaveAttribute('data-value', company.id);
    await page
      .getByRole('navigation', { name: locale.navigation })
      .getByRole('link', { name: locale.overview, exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: locale.greeting }),
    ).toBeVisible();
    await expect(
      page.getByRole('banner').getByText(company.displayName, { exact: true }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `locale-${locale.code}-reload-${testInfo.project.name}.png`,
      ),
      fullPage: true,
    });
    await openCompanies(page, testInfo.project.name, locale.companies);
    expect(commands).toHaveLength(0);
  });
}

async function chooseLocale(page: Page, label: string, locale: string) {
  await selectOption(page.getByRole('combobox', { name: label }), locale);
}

async function proveAuthenticatedJourney(
  page: Page,
  project: string,
  locale: LocaleProof,
  draft: ReturnType<Page['locator']>,
  testInfo: TestInfo,
) {
  await expect(page.locator('html')).toHaveAttribute('lang', locale.code);
  await openNavigation(page, project);
  await page
    .getByRole('navigation', { name: locale.navigation })
    .getByRole('link', { name: locale.overview, exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: locale.greeting }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: locale.hero })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath(`locale-${locale.code}-home-${project}.png`),
    fullPage: true,
  });

  // The narrow menu owns the Company context and closes on navigation.
  await openNavigation(page, project);
  await expect(
    page.getByRole('region', { name: locale.companyContext }),
  ).toBeVisible();
  await openCompanies(page, project, locale.companies);
  await expect(
    page.getByRole('region', { name: locale.registration }),
  ).toBeVisible();
  await expect(page.getByLabel(locale.displayName)).toHaveValue(
    '  Societate Test  ',
  );
  await expect(draft).toHaveValue('  Societate Test  ');
  await page.screenshot({
    path: testInfo.outputPath(`locale-${locale.code}-company-${project}.png`),
    fullPage: true,
  });
}

async function openCompanies(page: Page, project: string, label: string) {
  await openNavigation(page, project);
  await page
    .getByRole('navigation')
    .getByRole('link', { name: label, exact: true })
    .click();
}

async function openNavigation(page: Page, project: string) {
  if (project !== 'narrow') return;
  const open = page.getByRole('button', {
    name: /Deschideți navigarea|Открыть навигацию|Ouvrir la navigation|Open navigation/u,
  });
  if (await open.isVisible()) await open.click();
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

async function closeNavigation(page: Page, project: string) {
  if (project !== 'narrow') return;
  await page
    .getByRole('button', {
      name: /Închideți navigarea|Закрыть навигацию|Fermer la navigation|Close navigation/u,
    })
    .click();
}
