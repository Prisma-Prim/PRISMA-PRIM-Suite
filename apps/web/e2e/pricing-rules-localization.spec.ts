import { expect, test, type Page } from '@playwright/test';
import { actorContextFixture } from './actor-context.fixture';
import { selectOption } from './select-option';

test.use({ timezoneId: 'Europe/Chisinau' });

const locales = [
  {
    code: 'ro',
    language: 'Română',
    navigation: 'Configurarea tarifelor',
    title: 'Configurarea regulilor de tarifare',
    label: 'Denumire',
    from: 'Valabilă de la (Europe/Chisinau)',
    until: 'Valabilă până la, opțional (Europe/Chisinau)',
    publish: 'Publică versiunea',
    retry: 'Reîncearcă publicarea',
    uncertain: 'Rezultatul publicării este incert.',
    published: 'Versiunea 3 a fost publicată.',
    warning: 'Configurare ilustrativă: înregistrări provizorii',
    history: 'Versiunile regulii de tarifare',
  },
  {
    code: 'ru',
    language: 'Русский',
    navigation: 'Настройка тарифов',
    title: 'Настройка правил ценообразования',
    label: 'Название',
    from: 'Действует с (Europe/Chisinau)',
    until: 'Действует до, необязательно (Europe/Chisinau)',
    publish: 'Опубликовать версию',
    retry: 'Повторить публикацию',
    uncertain: 'Результат публикации неизвестен.',
    published: 'Версия 3 опубликована.',
    warning: 'Иллюстративная настройка: предварительные записи',
    history: 'Версии правила ценообразования',
  },
  {
    code: 'fr',
    language: 'Français',
    navigation: 'Configuration tarifaire',
    title: 'Configuration des règles de tarification',
    label: 'Libellé',
    from: 'Applicable à partir du (Europe/Chisinau)',
    until: 'Applicable jusqu’au, facultatif (Europe/Chisinau)',
    publish: 'Publier la version',
    retry: 'Réessayer la publication',
    uncertain: 'Le résultat de la publication est incertain.',
    published: 'Version 3 publiée.',
    warning: 'Configuration illustrative : enregistrements provisoires',
    history: 'Versions de règle de tarification',
  },
  {
    code: 'en',
    language: 'English',
    navigation: 'Pricing Configuration',
    title: 'Pricing Configuration',
    label: 'Label',
    from: 'Effective from (Europe/Chisinau)',
    until: 'Effective until, optional (Europe/Chisinau)',
    publish: 'Publish version',
    retry: 'Retry publication',
    uncertain: 'The publication outcome is uncertain.',
    published: 'Version 3 published.',
    warning: 'Illustrative configuration: provisional records',
    history: 'Pricing Rule Versions',
  },
] as const;

const company = {
  id: '00000000-0000-4000-8000-000000000649',
  workspaceId: actorContextFixture.workspaceId,
  displayName: 'Companie {originală} / Компания',
  status: 'active',
  createdAt: '2026-10-16T10:00:00.000Z',
};
const literalLabel =
  'Regulă {versionNumber} / Правило — ' + 'Originală '.repeat(6);

function version(number: number, state: 'CURRENT' | 'SCHEDULED') {
  return {
    id: `rule-${number}`,
    versionNumber: number,
    label: number === 3 ? literalLabel : `Regulă originală ${number} {label}`,
    effectiveFrom: `2029-0${number + 3}-01T09:00:00.000Z`,
    effectiveTo: number === 3 ? '2029-08-01T09:00:00.000Z' : null,
    ruleShape: 'UNIT_PRICE_TIMES_QUANTITY',
    roundingMode: 'HALF_UP',
    roundingScale: 2,
    taxApplication: 'PER_LINE',
    provenance: 'ILLUSTRATIVE',
    provisional: true,
    state,
    supersession: null,
    createdByWorkspaceMembershipId: actorContextFixture.workspaceMembershipId,
    createdAt: '2026-10-16T10:00:00.000Z',
  };
}

async function installRoutes(page: Page) {
  await page.addInitScript((workspaceId) => {
    sessionStorage.setItem('prisma-workspace-context', workspaceId);
  }, actorContextFixture.workspaceId);
  const commands: {
    body: string | null;
    key: string | undefined;
    companyId: string | undefined;
    workspaceId: string | undefined;
  }[] = [];
  const reads: string[] = [];
  const current = version(1, 'CURRENT');
  const scheduled = version(2, 'SCHEDULED');
  const published = version(3, 'SCHEDULED');
  let saved = false;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/access/current-actor')
      return route.fulfill({
        json: {
          ...actorContextFixture,
          ...(request.headers()['x-company-context-id'] === company.id
            ? {
                activeCompany: {
                  id: company.id,
                  displayName: company.displayName,
                  clientPermissions: [],
                  pricingConfigurationPermissionAssignmentId: 'grant-649',
                  pricingConfigurationPermissionSetVersion: 'v1',
                  pricingConfigurationPermissions: [
                    'commercial.pricing.configuration.read',
                    'commercial.pricing.configuration.manage',
                  ],
                },
              }
            : {}),
        },
      });
    if (url.pathname === '/api/companies')
      return route.fulfill({ json: [company] });
    if (url.pathname === '/api/activity-log')
      return route.fulfill({ json: { events: [] } });
    if (url.pathname === '/api/commercial-catalogue/offerings')
      return route.fulfill({ json: { items: [], provisional: true } });
    if (url.pathname.startsWith('/api/pricing-configuration/')) {
      if (request.method() === 'POST') {
        commands.push({
          body: request.postData(),
          key: request.headers()['idempotency-key'],
          companyId: request.headers()['x-company-context-id'],
          workspaceId: request.headers()['x-workspace-context-id'],
        });
        if (commands.length === 1) return route.fulfill({ status: 503 });
        saved = true;
        return route.fulfill({
          status: 201,
          json: { outcome: 'PUBLISHED', version: published },
        });
      }
      reads.push(url.pathname + url.search);
      return route.fulfill({
        json: url.pathname.endsWith('rule-scope')
          ? { current, headVersionNumber: saved ? 3 : 2, provisional: true }
          : {
              items: saved
                ? [published, scheduled, current]
                : [scheduled, current],
              provisional: true,
            },
      });
    }
    return route.fulfill({ status: 404 });
  });
  return { commands, reads };
}

async function chooseLocale(page: Page, language: string) {
  const control = page.getByRole('combobox', {
    name: /^(Limba interfeței|Язык интерфейса|Langue de l’interface|Interface language)$/u,
  });
  const index = locales.findIndex((locale) => locale.language === language);
  if (index < 0) throw new Error(`Unknown interface language: ${language}`);
  await control.press('Home');
  for (let position = 0; position < index; position += 1)
    await control.press('ArrowDown');
  await control.press('Enter');
  await expect(control).toHaveAttribute('title', language);
}

for (const locale of locales) {
  test(`publishes and reopens literal Pricing Rules in ${locale.code} with an exact uncertain retry`, async ({
    page,
  }, testInfo) => {
    const calls = await installRoutes(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    if (testInfo.project.name === 'narrow')
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await selectOption(page.getByLabel('Active Company', { exact: true }), {
      label: company.displayName,
    });
    await chooseLocale(page, locale.language);
    await page
      .getByRole('navigation')
      .getByRole('link', { name: locale.navigation, exact: true })
      .press('Enter');
    const configuration = page.locator('.pricing-configuration');
    await expect(
      configuration.getByRole('heading', { name: locale.title, exact: true }),
    ).toBeVisible();
    await expect(
      configuration.locator('.pricing-configuration-notice'),
    ).toContainText(locale.warning);
    await expect(configuration.locator('header')).toContainText(
      company.displayName,
    );
    await expect.poll(() => calls.reads.length).toBe(2);
    await configuration
      .getByLabel(locale.label, { exact: true })
      .fill(literalLabel);
    await configuration
      .getByLabel(locale.from, { exact: true })
      .fill('2029-06-01T12:00');
    await configuration
      .getByLabel(locale.until, { exact: true })
      .fill('2029-08-01T12:00');
    const alternate = locale.code === 'en' ? locales[0] : locales[3];
    await chooseLocale(page, alternate.language);
    await expect(
      configuration.getByLabel(alternate.label, { exact: true }),
    ).toHaveValue(literalLabel);
    await expect(
      configuration.getByLabel(alternate.from, { exact: true }),
    ).toHaveValue('2029-06-01T12:00');
    await expect(
      configuration.getByLabel(alternate.until, { exact: true }),
    ).toHaveValue('2029-08-01T12:00');
    expect(calls.reads).toHaveLength(2);
    expect(calls.commands).toHaveLength(0);
    await configuration
      .getByRole('button', { name: alternate.publish, exact: true })
      .press('Enter');
    await expect(configuration.getByRole('alert')).toContainText(
      alternate.uncertain,
    );
    await chooseLocale(page, locale.language);
    await expect(configuration.getByRole('alert')).toContainText(
      locale.uncertain,
    );
    expect(calls.reads).toHaveLength(2);
    expect(calls.commands).toHaveLength(1);
    await configuration
      .getByRole('button', { name: locale.retry, exact: true })
      .press('Enter');
    await expect(configuration.getByRole('status')).toHaveText(
      locale.published,
    );
    expect(calls.commands).toHaveLength(2);
    expect(calls.commands[1]).toEqual(calls.commands[0]);
    expect(calls.commands[0]).toEqual({
      body: JSON.stringify({
        label: literalLabel,
        effectiveFrom: '2029-06-01T09:00:00.000Z',
        effectiveTo: '2029-08-01T09:00:00.000Z',
        expectedActiveVersionNumber: 2,
      }),
      key: expect.any(String),
      companyId: company.id,
      workspaceId: actorContextFixture.workspaceId,
    });
    expect(calls.commands[0]?.key).toBeTruthy();
    await expect(
      configuration
        .getByRole('list', { name: locale.history, exact: true })
        .getByText(literalLabel, { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      configuration.getByRole('heading', { name: locale.title, exact: true }),
    ).toBeVisible();
    await expect(
      configuration
        .getByRole('list', { name: locale.history, exact: true })
        .getByText(literalLabel, { exact: true }),
    ).toBeVisible();
    await expect(
      configuration.getByText('Regulă originală 1 {label}', { exact: true }),
    ).toHaveCount(2);
    await expect(
      configuration.getByText('Regulă originală 2 {label}', { exact: true }),
    ).toHaveCount(2);
    expect(calls.commands).toHaveLength(2);
    await expect(
      configuration.locator('.pricing-configuration-notice'),
    ).toContainText(locale.warning);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.screenshot({
      path: testInfo.outputPath(
        `pricing-rules-${locale.code}-${testInfo.project.name}.png`,
      ),
      fullPage: true,
    });
  });
}
