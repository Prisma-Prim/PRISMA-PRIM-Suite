import { expect, test, type Page } from '@playwright/test';
import {
  actorContextFixture,
  operationalHomeFixture,
} from './actor-context.fixture';
import { selectOption } from './select-option';
import {
  buildClientRequest,
  requestListItemFor,
} from '../src/test/commercial-intake-responses';

// Synthetic illustrative values only; this intercepts HTTP at the real App seam.
const locales = [
  {
    code: 'ro',
    index: 0,
    language: 'Limba interfeței',
    title: 'Tarificare ilustrativă',
    provisional: 'Ilustrativ și provizoriu',
    quantity: 'Cantitate',
    apply: 'Aplică o reducere netă fixă',
    reduction: 'Reducere netă',
    reason: 'Motivul ajustării',
    calculate: 'Calculează și salvează',
    retry: 'Reîncearcă același calcul',
    invalid:
      'Introduceți o reducere netă care nu depășește valoarea netă inițială a liniei.',
    uncertain:
      'Rezultatul este incert. Reîncercarea trimite exact aceleași valori și aceeași cheie.',
    close: 'Închide instantaneul',
    reopen: 'Redeschide instantaneul',
    original: 'Valori nete și taxe inițiale',
    adjusted: 'Valori nete și taxe ajustate',
    tariff: 'Versiunea tarifului',
    total: '337,02 EUR',
  },
  {
    code: 'ru',
    index: 1,
    language: 'Язык интерфейса',
    title: 'Иллюстративный расчёт цены',
    provisional: 'Иллюстративно и предварительно',
    quantity: 'Количество',
    apply: 'Применить фиксированную скидку нетто',
    reduction: 'Уменьшение нетто',
    reason: 'Причина корректировки',
    calculate: 'Рассчитать и сохранить',
    retry: 'Повторить тот же расчёт',
    invalid:
      'Введите уменьшение нетто, не превышающее исходную сумму нетто строки.',
    uncertain:
      'Результат неизвестен. Повторная попытка отправит те же значения и тот же ключ.',
    close: 'Закрыть снимок',
    reopen: 'Открыть снимок',
    original: 'Исходные нетто и налог',
    adjusted: 'Скорректированные нетто и налог',
    tariff: 'Версия тарифа',
    total: '337,02 EUR',
  },
  {
    code: 'fr',
    index: 2,
    language: 'Langue de l’interface',
    title: 'Tarification illustrative',
    provisional: 'Illustratif et provisoire',
    quantity: 'Quantité',
    apply: 'Appliquer une remise nette fixe',
    reduction: 'Réduction nette',
    reason: 'Motif de l’ajustement',
    calculate: 'Calculer et enregistrer',
    retry: 'Réessayer le même calcul',
    invalid:
      'Saisissez une réduction nette ne dépassant pas le net d’origine de la ligne.',
    uncertain:
      'Le résultat est incertain. Réessayer renvoie exactement les mêmes valeurs et la même clé.',
    close: 'Fermer l’instantané',
    reopen: 'Rouvrir l’instantané',
    original: 'Net et taxe d’origine',
    adjusted: 'Net et taxe ajustés',
    tariff: 'Version du tarif',
    total: '337,02 EUR',
  },
  {
    code: 'en',
    index: 3,
    language: 'Interface language',
    title: 'Illustrative pricing',
    provisional: 'Illustrative and provisional',
    quantity: 'Quantity',
    apply: 'Apply a fixed net discount',
    reduction: 'Net reduction',
    reason: 'Adjustment reason',
    calculate: 'Calculate and save',
    retry: 'Retry the same calculation',
    invalid: 'Enter a net reduction no greater than the original line net.',
    uncertain:
      'The outcome is uncertain. Retry sends the exact same values and key.',
    close: 'Close snapshot',
    reopen: 'Reopen snapshot',
    original: 'Original net and tax',
    adjusted: 'Adjusted net and tax',
    tariff: 'Tariff Version',
    total: '337.02 EUR',
  },
] as const;
const company = {
  id: '00000000-0000-4000-8000-000000000651',
  workspaceId: actorContextFixture.workspaceId,
  displayName: 'Synthetic Company {original} / Компания',
  status: 'active',
  createdAt: '2026-10-16T10:00:00.000Z',
  createdByInternalUserId: actorContextFixture.internalUserId,
};
const offeringId = '20000000-0000-4000-8000-000000000651';
const reason = '  Motiv {literal} / Причина păstrată  ';
const offeringName = 'Service {original} / Услуга';
const snapshotPath = '/api/pricing/opportunities/opportunity-1/snapshots';
const saved = {
  id: '30000000-0000-4000-8000-000000000651',
  opportunityId: 'opportunity-1',
  clientRequestId: 'request-1',
  clientReference: { displayName: 'Client {original} / Клиент' },
  calculatedByWorkspaceMembershipId: 'membership-calculator',
  pricingRuleVersion: { id: 'rule-3', versionNumber: 3 },
  currency: 'EUR',
  lines: [
    {
      position: 1,
      serviceCode: 'SERVICE-651',
      serviceName: offeringName,
      offeringId,
      commercialLabel: null,
      tariffVersionNumber: 4,
      unit: 'literal-unit',
      unitAmount: '123.4500',
      currency: 'EUR',
      taxRatePercent: '12.34',
      taxLabel: 'Literal tax label',
      quantity: '2.500',
      rawLineAmount: '308.6250000',
      lineNet: '308.63',
      rawLineTax: '38.0849420',
      lineTax: '38.08',
      adjustment: {
        type: 'FIXED_NET_DISCOUNT',
        netReduction: '8.63',
        taxReduction: '1.06',
        reason,
        appliedByWorkspaceMembershipId: 'membership-adjuster',
        appliedAt: '2026-09-26T10:00:00.000Z',
      },
      netReduction: '8.63',
      taxReduction: '1.06',
      adjustedLineNet: '300.00',
      adjustedRawLineTax: '37.0200000',
      adjustedLineTax: '37.02',
    },
  ],
  subtotal: '300.00',
  taxTotal: '37.02',
  total: '337.02',
  calculatedAt: '2026-09-26T10:00:00.000Z',
  committedAt: '2026-09-26T10:00:01.000Z',
  provenance: 'ILLUSTRATIVE',
  provisional: true,
};

async function installRoutes(page: Page) {
  const requestRecord = buildClientRequest({
    companyId: company.id,
    subject: 'Request {original} / Запрос',
    initialOpportunity: {},
  });
  const calls: string[] = [];
  const commands: {
    payload: string | null;
    key: string | undefined;
    company: string | undefined;
  }[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    calls.push(`${request.method()} ${path}`);
    if (path === '/api/access/current-actor')
      return route.fulfill({
        json: {
          ...actorContextFixture,
          ...(request.headers()['x-company-context-id'] === company.id
            ? {
                activeCompany: {
                  id: company.id,
                  displayName: company.displayName,
                  commercialIntakePermissionAssignmentId: 'intake-651',
                  commercialIntakePermissionSetVersion: 'v2',
                  commercialIntakePermissions: [
                    'commercial.request.read',
                    'commercial.request.create',
                    'commercial.opportunity.read',
                    'commercial.opportunity.create',
                    'commercial.opportunity.next_action.update',
                  ],
                  pricingUserPermissionAssignmentId: 'pricing-651',
                  pricingUserPermissionSetVersion: 'v1',
                  pricingUserPermissions: [
                    'commercial.offering.read',
                    'commercial.pricing.configuration.read',
                    'commercial.pricing.calculate',
                    'commercial.pricing.snapshot.read',
                  ],
                  pricingAdjustmentPermissionAssignmentId: 'adjustment-651',
                  pricingAdjustmentPermissionSetVersion: 'v1',
                  pricingAdjustmentPermissions: [
                    'commercial.pricing.adjustment.apply',
                  ],
                },
              }
            : {}),
        },
      });
    if (path === '/api/companies') return route.fulfill({ json: [company] });
    if (path === '/api/activity-log')
      return route.fulfill({ json: { events: [] } });
    if (path === '/api/operational-home')
      return route.fulfill({ json: operationalHomeFixture(company.id, {}) });
    if (path === '/api/commercial-intake/requests')
      return route.fulfill({
        json: { items: [requestListItemFor(requestRecord)] },
      });
    if (path === '/api/commercial-intake/requests/request-1')
      return route.fulfill({ json: requestRecord });
    if (path === '/api/pricing-configuration/rule-scope')
      return route.fulfill({
        json: { current: { id: 'rule-3', versionNumber: 3 } },
      });
    if (path === '/api/commercial-catalogue/offerings')
      return route.fulfill({
        json: {
          items: [
            {
              id: offeringId,
              serviceDefinition: { code: 'SERVICE-651', name: offeringName },
              commercialLabel: null,
            },
          ],
        },
      });
    if (
      path === `/api/pricing-configuration/offerings/${offeringId}/tariff-scope`
    )
      return route.fulfill({
        json: {
          offeringId,
          current: {
            id: 'tariff-4',
            versionNumber: 4,
            unit: 'literal-unit',
            unitAmount: '123.4500',
            currency: 'EUR',
            taxRatePercent: '12.34',
            taxLabel: 'Literal tax label',
          },
        },
      });
    if (path === `${snapshotPath}/${saved.id}`)
      return route.fulfill({ json: saved });
    if (path === snapshotPath && request.method() === 'GET')
      return route.fulfill({
        json: { items: commands.length >= 3 ? [saved] : [] },
      });
    if (path === snapshotPath && request.method() === 'POST') {
      commands.push({
        payload: request.postData(),
        key: request.headers()['idempotency-key'],
        company: request.headers()['x-company-context-id'],
      });
      if (commands.length === 1)
        return route.fulfill({
          status: 400,
          json: {
            code: 'VALIDATION_ERROR',
            field: 'lines[0].adjustment.netReduction',
            message: 'Raw server validation is not translated interface copy.',
          },
        });
      if (commands.length === 2) return route.fulfill({ status: 503 });
      return route.fulfill({ status: 201, json: saved });
    }
    return route.fulfill({ status: 404 });
  });
  return { calls, commands };
}

async function chooseLanguage(page: Page, currentLabel: string, index: number) {
  const picker = page.getByRole('combobox', {
    name: currentLabel,
    exact: true,
  });
  await picker.focus();
  await picker.press('Enter');
  const listbox = page.getByRole('listbox');
  await expect(listbox).toBeVisible();
  await picker.press('Home');
  for (let step = 0; step < index; step += 1) await picker.press('ArrowDown');
  await picker.press('Enter');
  await expect(page.getByRole('listbox')).toHaveCount(0);
}

for (const locale of locales) {
  test(`calculates, corrects and reopens an immutable adjusted Pricing Snapshot in ${locale.code}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const observed = await installRoutes(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    if (testInfo.project.name === 'narrow')
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await selectOption(
      page.getByRole('combobox', { name: 'Active Company', exact: true }),
      { label: company.displayName },
    );
    await page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name: 'Client Requests', exact: true })
      .click();
    const intake = page.locator('.commercial-intake-workspace');
    await intake
      .getByRole('button')
      .filter({
        has: page.getByText('Request {original} / Запрос', { exact: true }),
      })
      .click();
    const panel = intake.locator('.pricing-snapshot-panel');
    await panel
      .getByRole('checkbox', { name: offeringName, exact: true })
      .check();
    await panel
      .getByRole('textbox', { name: 'Quantity', exact: true })
      .fill('2.500');
    await panel
      .getByRole('checkbox', {
        name: 'Apply a fixed net discount',
        exact: true,
      })
      .check();
    await panel
      .getByRole('textbox', { name: 'Net reduction', exact: true })
      .fill('999.00');
    await panel
      .getByRole('textbox', { name: 'Adjustment reason', exact: true })
      .fill(reason);
    const beforeChoice = observed.calls.length;
    await chooseLanguage(page, 'Interface language', locale.index);
    await expect(
      panel.getByRole('heading', { name: locale.title, exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole('textbox', { name: locale.quantity, exact: true }),
    ).toHaveValue('2.500');
    await expect(
      panel.getByRole('textbox', { name: locale.reduction, exact: true }),
    ).toHaveValue('999.00');
    await expect(
      panel.getByRole('textbox', { name: locale.reason, exact: true }),
    ).toHaveValue(reason);
    expect(observed.calls).toHaveLength(beforeChoice);
    await panel
      .getByRole('button', { name: locale.calculate, exact: true })
      .click();
    const reduction = panel.getByRole('textbox', {
      name: locale.reduction,
      exact: true,
    });
    await expect(reduction).toHaveAccessibleDescription(locale.invalid);
    await expect(reduction).toHaveAttribute('aria-invalid', 'true');
    await expect(
      panel.getByText(locale.provisional, { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(testInfo.project.name === 'narrow' ? 390 : 1440);
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`snapshot-${locale.code}-validation.png`),
      fullPage: true,
    });
    const alternate = locale.code === 'en' ? locales[2] : locales[3];
    const beforeCorrectionChoice = observed.calls.length;
    await chooseLanguage(page, locale.language, alternate.index);
    await expect(
      panel.getByRole('textbox', { name: alternate.reduction, exact: true }),
    ).toHaveAccessibleDescription(alternate.invalid);
    expect(observed.calls).toHaveLength(beforeCorrectionChoice);
    await panel
      .getByRole('textbox', { name: alternate.reduction, exact: true })
      .fill('8.63');
    await panel
      .getByRole('button', { name: alternate.calculate, exact: true })
      .click();
    await expect(
      panel.getByText(alternate.uncertain, { exact: true }),
    ).toBeVisible();
    const beforeRetryChoice = observed.calls.length;
    await chooseLanguage(page, alternate.language, locale.index);
    await expect(
      panel.getByText(locale.uncertain, { exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole('textbox', { name: locale.reason, exact: true }),
    ).toHaveValue(reason);
    await expect(
      panel.getByRole('textbox', { name: locale.quantity, exact: true }),
    ).toBeDisabled();
    expect(observed.calls).toHaveLength(beforeRetryChoice);
    expect(observed.commands).toHaveLength(2);
    await panel
      .getByRole('button', { name: locale.retry, exact: true })
      .click();
    const detail = panel.locator('.pricing-snapshot-detail');
    await expect(detail.getByText(locale.total, { exact: true })).toBeVisible();
    expect(observed.commands).toHaveLength(3);
    expect(observed.commands[1]?.key).toBeTruthy();
    expect(observed.commands[2]).toEqual(observed.commands[1]);
    expect(observed.commands[1]).toMatchObject({
      company: company.id,
      payload: JSON.stringify({
        pricingRuleVersionNumber: 3,
        lines: [
          {
            offeringId,
            tariffVersionNumber: 4,
            quantity: '2.500',
            adjustment: {
              type: 'FIXED_NET_DISCOUNT',
              netReduction: '8.63',
              reason,
            },
          },
        ],
      }),
    });
    await detail
      .getByRole('button', { name: locale.close, exact: true })
      .click();
    const tariffReads = observed.calls.filter((call) =>
      call.includes('/tariff-scope'),
    ).length;
    await panel
      .getByRole('button', { name: new RegExp(`^${locale.reopen}`, 'u') })
      .click();
    await expect(detail.getByText(locale.total, { exact: true })).toBeVisible();
    await expect(detail).toContainText(`${locale.tariff}: 4`);
    await expect(detail).toContainText(locale.original);
    await expect(detail).toContainText(locale.adjusted);
    await expect(detail).toContainText('membership-adjuster');
    await expect(detail).toContainText('Client {original} / Клиент');
    await expect(detail).toContainText('Motiv {literal} / Причина păstrată');
    await expect(detail).toContainText(
      locale.code === 'en'
        ? '2.500 × 123.4500 EUR/literal-unit'
        : '2,500 × 123,4500 EUR/literal-unit',
    );
    expect(
      observed.calls.filter((call) => call.includes('/tariff-scope')),
    ).toHaveLength(tariffReads);
    expect(observed.commands).toHaveLength(3);
    await expect(page.getByRole('banner')).toContainText(company.displayName);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(testInfo.project.name === 'narrow' ? 390 : 1440);
    await detail.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`snapshot-${locale.code}-reopened.png`),
      fullPage: true,
    });
  });
}
