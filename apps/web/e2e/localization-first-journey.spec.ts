import {
  expect,
  test,
  type Page,
  type Route,
  type TestInfo,
} from '@playwright/test';
import { selectOption } from './select-option';
import { actorContextFixture } from './actor-context.fixture';

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
    registration: 'Provider Company',
    displayName: 'Company display name',
  },
] as const;

type LocaleProof = (typeof locales)[number];

test('completes the Romanian-first entry-to-Company journey in all four interface languages', async ({
  page,
}, testInfo) => {
  const commands: Array<{ body: string | null; idempotencyKey: string }> = [];
  let pendingActor: Route | undefined;
  let holdActor = true;
  let created = false;

  await page.route('**/api/access/current-actor', (route) => {
    if (holdActor) {
      pendingActor = route;
      return;
    }
    return route.fulfill({
      json: {
        ...actorContextFixture,
        ...(created
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
  await expect.poll(() => Boolean(pendingActor)).toBe(true);
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
  currentLocale = locales[0];
  holdActor = false;
  if (!pendingActor) throw new Error('Expected pending access check');
  await pendingActor.fulfill({ json: actorContextFixture });
  await expect(
    page.getByRole('heading', { name: 'Bună, Ada Ionescu.' }),
  ).toBeVisible();

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

  await chooseLocale(page, 'Limba interfeței', 'fr');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(
    page.getByRole('heading', { name: 'Bonjour, Ada Ionescu.' }),
  ).toBeVisible();
  await openNavigation(page, testInfo.project.name);
  await expect(
    page.getByRole('combobox', { name: 'Entreprise active' }),
  ).toHaveAttribute('data-value', company.id);
  await expect(page.getByText(company.displayName).first()).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(`locale-fr-reload-${testInfo.project.name}.png`),
    fullPage: true,
  });
});

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

  await openCompanies(page, project, locale.companies);
  await expect(
    page.getByRole('region', { name: locale.companyContext }),
  ).toBeVisible();
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
