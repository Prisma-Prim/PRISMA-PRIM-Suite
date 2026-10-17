import { expect, test, type Page, type Request } from '@playwright/test';
import { actorContextFixture } from './actor-context.fixture';
import { selectOption } from './select-option';

test.use({ timezoneId: 'Europe/Chisinau' });

const locales = [
  {
    code: 'ro',
    language: 'Română',
    navigation: 'Configurarea tarifelor',
    title: 'Versiunile tarifului',
    offering: 'Ofertă de serviciu a Companiei',
    unit: 'Unitate',
    amount: 'Sumă unitară',
    currency: 'Monedă',
    rate: 'Cotă de taxă în procente',
    tax: 'Denumirea taxei',
    from: 'Valabilă de la (Europe/Chisinau)',
    until: 'Valabilă până la, opțional (Europe/Chisinau)',
    publish: 'Publică versiunea de tarif',
    retry: 'Reîncearcă publicarea tarifului',
    uncertain: 'Rezultatul publicării este incert.',
    invalid: 'Introduceți o denumire a taxei de 1 până la 60 de caractere.',
    published: 'Versiunea de tarif 3 a fost publicată.',
    warning: 'Tarife ilustrative: înregistrări provizorii',
    history: 'Versiunile tarifului',
    current: 'Versiunea curentă a tarifului',
    scheduled: 'Versiuni succesoare de tarif programate',
    amountText: '1.234.567,8900 EUR pe',
  },
  {
    code: 'ru',
    language: 'Русский',
    navigation: 'Настройка тарифов',
    title: 'Версии тарифа',
    offering: 'Предложение услуги Компании',
    unit: 'Единица',
    amount: 'Сумма за единицу',
    currency: 'Валюта',
    rate: 'Налоговая ставка в процентах',
    tax: 'Название налога',
    from: 'Действует с (Europe/Chisinau)',
    until: 'Действует до, необязательно (Europe/Chisinau)',
    publish: 'Опубликовать версию тарифа',
    retry: 'Повторить публикацию тарифа',
    uncertain: 'Результат публикации неизвестен.',
    invalid: 'Введите название налога длиной от 1 до 60 символов.',
    published: 'Версия тарифа 3 опубликована.',
    warning: 'Иллюстративные тарифы: предварительные записи',
    history: 'Версии тарифа',
    current: 'Текущая версия тарифа',
    scheduled: 'Запланированные последующие версии тарифа',
    amountText: '1\u00a0234\u00a0567,8900 EUR за',
  },
  {
    code: 'fr',
    language: 'Français',
    navigation: 'Configuration tarifaire',
    title: 'Versions du tarif',
    offering: 'Prestation de la Compagnie',
    unit: 'Unité',
    amount: 'Montant unitaire',
    currency: 'Devise',
    rate: 'Taux de taxe en pourcentage',
    tax: 'Libellé de taxe',
    from: 'Valable à partir du (Europe/Chisinau)',
    until: 'Valable jusqu’au, facultatif (Europe/Chisinau)',
    publish: 'Publier la version de tarif',
    retry: 'Réessayer la publication du tarif',
    uncertain: 'Le résultat de la publication est incertain.',
    invalid: 'Saisissez un libellé de taxe de 1 à 60 caractères.',
    published: 'Version de tarif 3 publiée.',
    warning: 'Tarifs illustratifs : enregistrements provisoires',
    history: 'Versions du tarif',
    current: 'Version courante du tarif',
    scheduled: 'Versions de tarif successives programmées',
    amountText: '1\u202f234\u202f567,8900 EUR par',
  },
  {
    code: 'en',
    language: 'English',
    navigation: 'Pricing Configuration',
    title: 'Tariff Versions',
    offering: 'Company Service Offering',
    unit: 'Unit',
    amount: 'Unit amount',
    currency: 'Currency',
    rate: 'Tax rate percent',
    tax: 'Tax label',
    from: 'Effective from (Europe/Chisinau)',
    until: 'Effective until, optional (Europe/Chisinau)',
    publish: 'Publish Tariff Version',
    retry: 'Retry Tariff publication',
    uncertain: 'The publication outcome is uncertain.',
    invalid: 'Enter a tax label of 1 to 60 characters.',
    published: 'Tariff Version 3 published.',
    warning: 'Illustrative tariffs: provisional records',
    history: 'Tariff Versions',
    current: 'Current Tariff Version',
    scheduled: 'Scheduled Tariff successors',
    amountText: '1,234,567.8900 EUR per',
  },
] as const;

const company = {
  id: '00000000-0000-4000-8000-000000000660',
  workspaceId: actorContextFixture.workspaceId,
  displayName: 'Companie {originală} / Компания',
  status: 'active',
  createdAt: '2026-10-17T10:00:00.000Z',
};
const offeringId = '10000000-0000-4000-8000-000000000660';
const serviceName = 'Serviciu {name} / Услуга — ' + 'Originală '.repeat(5);
const offeringName = `${serviceName} (ORIGINAL-660) — Etichetă {literal} / Название`;
const literalUnit = ' zi {unit} / день ';
const literalTax = ' Taxă {tax} / Налог ';
const correctedTax = ' Taxă {tax} / Налог — corectată ';

function version(number: number, state: 'CURRENT' | 'SCHEDULED') {
  return {
    id: `tariff-${number}`,
    offeringId,
    versionNumber: number,
    unit: literalUnit,
    unitAmount: number === 3 ? '123.4500' : '1234567.8900',
    currency: 'EUR',
    taxRatePercent: number === 3 ? '12.30' : '100.00',
    taxLabel: number === 3 ? correctedTax : literalTax,
    effectiveFrom: `2029-0${number + 3}-01T09:00:00.000Z`,
    effectiveTo: number === 3 ? '2029-08-01T09:00:00.000Z' : null,
    provenance: 'ILLUSTRATIVE',
    provisional: true,
    state,
    supersession: null,
    createdByWorkspaceMembershipId: actorContextFixture.workspaceMembershipId,
    createdAt: '2026-10-17T10:00:00.000Z',
  };
}

async function installRoutes(page: Page) {
  await page.addInitScript(
    (workspaceId) =>
      sessionStorage.setItem('prisma-workspace-context', workspaceId),
    actorContextFixture.workspaceId,
  );
  const commands: {
    path: string;
    body: string | null;
    key: string | undefined;
    companyId: string | undefined;
    workspaceId: string | undefined;
  }[] = [];
  const reads: string[] = [];
  const pendingReads = new Set<Request>();
  page.on('request', (request) => {
    if (request.method() === 'GET' && request.url().includes('/api/'))
      pendingReads.add(request);
  });
  page.on('requestfinished', (request) => pendingReads.delete(request));
  page.on('requestfailed', (request) => pendingReads.delete(request));
  let releaseHeld: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    releaseHeld = resolve;
  });
  let saved = false;
  const current = version(1, 'CURRENT');
  const scheduled = version(2, 'SCHEDULED');
  const published = version(3, 'SCHEDULED');
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === 'GET') reads.push(url.pathname + url.search);
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
                  pricingConfigurationPermissionAssignmentId: 'grant-660',
                  pricingConfigurationPermissionSetVersion: 'v1',
                  pricingConfigurationPermissions: [
                    'commercial.offering.read',
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
      return route.fulfill({
        json: {
          items: [
            {
              id: offeringId,
              serviceDefinition: { code: 'ORIGINAL-660', name: serviceName },
              commercialLabel: 'Etichetă {literal} / Название',
            },
          ],
        },
      });
    if (url.pathname.endsWith('/rule-scope'))
      return route.fulfill({
        json: { current: null, headVersionNumber: null, provisional: true },
      });
    if (url.pathname.endsWith('/rule-versions'))
      return route.fulfill({ json: { items: [], provisional: true } });
    if (
      url.pathname ===
      `/api/pricing-configuration/offerings/${offeringId}/tariff-scope`
    )
      return route.fulfill({
        json: {
          offeringId,
          current,
          headVersionNumber: saved ? 3 : 2,
          provisional: true,
        },
      });
    if (
      url.pathname ===
      `/api/pricing-configuration/offerings/${offeringId}/tariff-versions`
    ) {
      if (request.method() === 'POST') {
        commands.push({
          path: url.pathname,
          body: request.postData(),
          key: request.headers()['idempotency-key'],
          companyId: request.headers()['x-company-context-id'],
          workspaceId: request.headers()['x-workspace-context-id'],
        });
        if (commands.length === 1)
          return route.fulfill({
            status: 400,
            json: {
              code: 'VALIDATION_ERROR',
              field: 'taxLabel',
              message:
                'This raw English server sentence must not become the localized feedback.',
            },
          });
        if (commands.length === 2) {
          await held;
          return route.fulfill({ status: 503 });
        }
        saved = true;
        return route.fulfill({
          status: 201,
          json: { outcome: 'PUBLISHED', version: published },
        });
      }
      return route.fulfill({
        json: {
          items: saved ? [published, scheduled, current] : [scheduled, current],
          provisional: true,
        },
      });
    }
    return route.fulfill({ status: 404 });
  });
  return {
    commands,
    reads,
    pendingReads,
    releaseUncertain: () => {
      if (!releaseHeld) throw new Error('Publication boundary was not held.');
      releaseHeld();
    },
  };
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

async function expectFit(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
}

for (const locale of locales) {
  test(`publishes and reopens literal Tariffs in ${locale.code} with exact pending and uncertain intent`, async ({
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
    const tariffs = page.locator('.tariff-versions');
    await expect(
      tariffs.getByRole('heading', { name: locale.title, exact: true }),
    ).toBeVisible();
    await expect(tariffs.locator('.tariff-versions-notice')).toContainText(
      locale.warning,
    );
    await expect(tariffs.locator('header')).toContainText(company.displayName);
    const offering = tariffs.getByRole('combobox', {
      name: locale.offering,
      exact: true,
    });
    await offering.press('End');
    await expect(
      page.getByRole('option', { name: offeringName, exact: true }),
    ).toBeVisible();
    await offering.press('Enter');
    await expect(
      tariffs
        .getByRole('list', { name: locale.history, exact: true })
        .getByRole('listitem'),
    ).toHaveCount(2);
    await expect.poll(() => calls.pendingReads.size).toBe(0);
    const unit = tariffs.getByLabel(locale.unit, { exact: true });
    await unit.fill(literalUnit);
    const originalUnit = await unit.elementHandle();
    if (!originalUnit) throw new Error('Tariff unit input is absent.');
    await tariffs.getByLabel(locale.amount, { exact: true }).fill('123.4500');
    await tariffs.getByLabel(locale.rate, { exact: true }).fill('12.30');
    await tariffs.getByLabel(locale.tax, { exact: true }).fill(literalTax);
    await tariffs
      .getByLabel(locale.from, { exact: true })
      .fill('2029-06-01T12:00');
    await tariffs
      .getByLabel(locale.until, { exact: true })
      .fill('2029-08-01T12:00');
    const currency = tariffs.getByRole('combobox', {
      name: locale.currency,
      exact: true,
    });
    await currency.press('e');
    await currency.press('Enter');
    const baseline = [...calls.reads];
    const alternate = locale.code === 'en' ? locales[0] : locales[3];
    await chooseLocale(page, alternate.language);
    expect(
      await tariffs
        .getByLabel(alternate.unit, { exact: true })
        .evaluate((node, original) => node === original, originalUnit),
    ).toBe(true);
    await expect(
      tariffs.getByLabel(alternate.unit, { exact: true }),
    ).toHaveValue(literalUnit);
    await expect(
      tariffs.getByLabel(alternate.amount, { exact: true }),
    ).toHaveValue('123.4500');
    await expect(
      tariffs.getByLabel(alternate.rate, { exact: true }),
    ).toHaveValue('12.30');
    await expect(
      tariffs.getByLabel(alternate.tax, { exact: true }),
    ).toHaveValue(literalTax);
    await expect(
      tariffs.getByLabel(alternate.from, { exact: true }),
    ).toHaveValue('2029-06-01T12:00');
    await expect(
      tariffs.getByLabel(alternate.until, { exact: true }),
    ).toHaveValue('2029-08-01T12:00');
    await expect(
      tariffs.getByRole('combobox', { name: alternate.currency, exact: true }),
    ).toHaveAttribute('data-value', 'EUR');
    expect(calls.reads).toEqual(baseline);
    expect(calls.commands).toHaveLength(0);
    await tariffs
      .getByRole('button', { name: alternate.publish, exact: true })
      .press('Enter');
    await expect(tariffs.getByRole('alert')).toHaveText(alternate.invalid);
    await chooseLocale(page, locale.language);
    await expect(tariffs.getByRole('alert')).toHaveText(locale.invalid);
    expect(calls.reads).toEqual(baseline);
    expect(calls.commands).toHaveLength(1);
    await expectFit(page);
    await tariffs.screenshot({
      path: testInfo.outputPath(
        `tariff-${locale.code}-${testInfo.project.name}-refusal.png`,
      ),
    });
    await tariffs.getByLabel(locale.tax, { exact: true }).fill(correctedTax);
    await tariffs
      .getByRole('button', { name: locale.publish, exact: true })
      .press('Enter');
    await expect.poll(() => calls.commands.length).toBe(2);
    await chooseLocale(page, alternate.language);
    await expect(
      tariffs.getByRole('button', { name: alternate.publish, exact: true }),
    ).toBeDisabled();
    await expect(
      tariffs.getByLabel(alternate.tax, { exact: true }),
    ).toHaveValue(correctedTax);
    expect(calls.reads).toEqual(baseline);
    expect(calls.commands).toHaveLength(2);
    calls.releaseUncertain();
    await expect(tariffs.getByRole('alert')).toContainText(alternate.uncertain);
    await chooseLocale(page, locale.language);
    await expect(tariffs.getByRole('alert')).toContainText(locale.uncertain);
    expect(calls.reads).toEqual(baseline);
    expect(calls.commands).toHaveLength(2);
    await expectFit(page);
    await tariffs.screenshot({
      path: testInfo.outputPath(
        `tariff-${locale.code}-${testInfo.project.name}-uncertain.png`,
      ),
    });
    await tariffs
      .getByRole('button', { name: locale.retry, exact: true })
      .press('Enter');
    await expect(tariffs.getByRole('status')).toHaveText(locale.published);
    expect(calls.commands).toHaveLength(3);
    expect(calls.commands[2]).toEqual(calls.commands[1]);
    expect(calls.commands[1]?.key).not.toBe(calls.commands[0]?.key);
    const command = calls.commands[1];
    expect(command).toEqual({
      path: `/api/pricing-configuration/offerings/${offeringId}/tariff-versions`,
      body: JSON.stringify({
        unit: literalUnit,
        unitAmount: '123.4500',
        currency: 'EUR',
        taxRatePercent: '12.30',
        taxLabel: correctedTax,
        effectiveFrom: '2029-06-01T09:00:00.000Z',
        effectiveTo: '2029-08-01T09:00:00.000Z',
        expectedActiveVersionNumber: 2,
      }),
      key: expect.any(String),
      companyId: company.id,
      workspaceId: actorContextFixture.workspaceId,
    });
    expect(command?.key).toBeTruthy();
    await page.reload();
    await expect(
      tariffs.getByRole('heading', { name: locale.title, exact: true }),
    ).toBeVisible();
    const reopenedOffering = tariffs.getByRole('combobox', {
      name: locale.offering,
      exact: true,
    });
    await reopenedOffering.press('End');
    await reopenedOffering.press('Enter');
    await expect(
      tariffs
        .getByRole('list', { name: locale.history, exact: true })
        .getByRole('listitem'),
    ).toHaveCount(3);
    const current = tariffs.getByRole('region', {
      name: locale.current,
      exact: true,
    });
    await expect(current).toContainText(locale.amountText);
    await expect(current.locator('time').first()).toHaveAttribute(
      'datetime',
      '2029-04-01T09:00:00.000Z',
    );
    const scheduled = tariffs.getByRole('list', {
      name: locale.scheduled,
      exact: true,
    });
    await expect(scheduled.getByRole('listitem')).toHaveCount(2);
    expect(
      await scheduled
        .locator('time')
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute('datetime')),
        ),
    ).toEqual(['2029-05-01T09:00:00.000Z', '2029-06-01T09:00:00.000Z']);
    const history = tariffs.getByRole('list', {
      name: locale.history,
      exact: true,
    });
    await expect(
      history.getByRole('listitem').filter({ hasText: correctedTax.trim() }),
    ).toHaveCount(1);
    expect(calls.commands).toHaveLength(3);
    await expect(tariffs.locator('.tariff-versions-notice')).toContainText(
      locale.warning,
    );
    await expectFit(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(
        `tariff-${locale.code}-${testInfo.project.name}-reopened.png`,
      ),
      fullPage: true,
    });
    await originalUnit.dispose();
  });
}
