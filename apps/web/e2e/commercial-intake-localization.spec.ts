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

const locales = [
  {
    code: 'ro',
    timestamp: '20 sept. 2026, 10:00',
    label: 'Limba interfeței',
    name: 'Română',
    title: 'Solicitări ale Clienților',
    source: 'Textul original al solicitării',
    subject: 'Subiect',
    opportunity: 'Titlul Oportunității',
    next: 'Acțiunea următoare',
    capture: 'Înregistrează Solicitarea',
    search: 'Caută Clienți după nume',
    find: 'Caută Clienți',
    existing: 'Client existent',
    confirm: 'Confirmă asocierea Clientului',
    retry: 'Reîncearcă asocierea Clientului',
    back: 'Înapoi la Solicitări',
    error:
      'Solicitarea Clientului nu a putut fi încărcată sau salvată. Încercați din nou.',
  },
  {
    code: 'ru',
    timestamp: '20 сент. 2026 г., 10:00',
    label: 'Язык интерфейса',
    name: 'Русский',
    title: 'Запросы Клиентов',
    source: 'Исходный текст запроса',
    subject: 'Тема',
    opportunity: 'Название Возможности',
    next: 'Следующее действие',
    capture: 'Зарегистрировать Запрос',
    search: 'Поиск Клиентов по имени',
    find: 'Найти Клиентов',
    existing: 'Существующий Клиент',
    confirm: 'Подтвердить связь с Клиентом',
    retry: 'Повторить связывание с Клиентом',
    back: 'Назад к Запросам',
    error:
      'Не удалось загрузить или сохранить Запрос Клиента. Повторите попытку.',
  },
  {
    code: 'fr',
    timestamp: '20 sept. 2026, 10:00',
    label: 'Langue de l’interface',
    name: 'Français',
    title: 'Demandes Client',
    source: 'Texte original de la demande',
    subject: 'Objet',
    opportunity: 'Titre de l’Opportunité',
    next: 'Prochaine action',
    capture: 'Enregistrer la Demande',
    search: 'Rechercher des Clients par nom',
    find: 'Rechercher des Clients',
    existing: 'Client existant',
    confirm: 'Confirmer l’association du Client',
    retry: 'Réessayer l’association du Client',
    back: 'Retour aux Demandes',
    error:
      'Impossible de charger ou d’enregistrer la Demande Client. Réessayez.',
  },
  {
    code: 'en',
    timestamp: 'Sep 20, 2026, 10:00 AM',
    label: 'Interface language',
    name: 'English',
    title: 'Client Requests',
    source: 'Original request text',
    subject: 'Subject',
    opportunity: 'Opportunity title',
    next: 'Next action',
    capture: 'Capture Request',
    search: 'Search Clients by name',
    find: 'Search Clients',
    existing: 'Existing Client',
    confirm: 'Confirm Client association',
    retry: 'Retry Client association',
    back: 'Back to Requests',
    error: 'The Client Request could not be loaded or saved. Please try again.',
  },
] as const;

const company = {
  id: '00000000-0000-4000-8000-000000000622',
  workspaceId: actorContextFixture.workspaceId,
  displayName: 'Demo Company',
  status: 'active',
  createdAt: '2026-10-16T10:00:00.000Z',
  createdByInternalUserId: actorContextFixture.internalUserId,
};
const client = {
  id: '00000000-0000-4000-8000-000000000623',
  displayName: 'Client {original}',
  relatedToActiveCompany: true,
};
const originalText =
  'Original business text {untouched} — întrebări / вопросы.';
const saved = buildClientRequest({
  id: 'request-localized',
  capturedAt: '2026-09-20T10:00:00.000Z',
  companyId: company.id,
  subject: 'Demande {original}',
  originalText,
  initialOpportunity: {
    title: 'Original Opportunity',
    nextAction: 'Contact the Client',
  },
});

type Command = { body: string | null; key: string | undefined };
async function installRoutes(page: Page) {
  let captured = false;
  let associated = false;
  const captures: Command[] = [];
  const associations: Command[] = [];
  function detail() {
    return associated
      ? {
          ...saved,
          version: 2,
          clientAssociationStatus: 'visible',
          clientReference: {
            originalClientId: client.id,
            currentClientId: client.id,
            displayName: client.displayName,
          },
        }
      : saved;
  }
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/access/current-actor')
      return route.fulfill({
        json: {
          ...actorContextFixture,
          ...(request.headers()['x-company-context-id'] === company.id
            ? {
                activeCompany: {
                  id: company.id,
                  displayName: company.displayName,
                  clientPermissions: ['client.read'],
                  commercialIntakePermissionAssignmentId: 'demo-intake',
                  commercialIntakePermissionSetVersion: 'v3',
                  commercialIntakePermissions: [
                    'commercial.request.read',
                    'commercial.request.create',
                    'commercial.opportunity.read',
                    'commercial.opportunity.create',
                    'commercial.request.client.associate',
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
      return route.fulfill({
        json: operationalHomeFixture(company.id, { active_clients: 1 }),
      });
    if (path === '/api/clients/search')
      return route.fulfill({ json: [client] });
    if (path === '/api/commercial-intake/requests') {
      if (request.method() === 'POST') {
        captures.push({
          body: request.postData(),
          key: request.headers()['idempotency-key'],
        });
        if (captures.length === 1) return route.fulfill({ status: 503 });
        captured = true;
        return route.fulfill({ status: 201, json: saved });
      }
      return route.fulfill({
        json: { items: captured ? [requestListItemFor(saved)] : [] },
      });
    }
    if (
      path ===
      '/api/commercial-intake/requests/request-localized/client-association'
    ) {
      associations.push({
        body: request.postData(),
        key: request.headers()['idempotency-key'],
      });
      if (associations.length === 1) return route.fulfill({ status: 503 });
      associated = true;
      return route.fulfill({
        json: {
          receipt: { requestId: saved.id, version: 2, outcome: 'associated' },
          request: detail(),
        },
      });
    }
    if (path === '/api/commercial-intake/requests/request-localized')
      return route.fulfill({ json: detail() });
    return route.fulfill({ status: 404 });
  });
  return { captures, associations };
}

for (const locale of locales) {
  test(`captures, associates and reopens a Request in ${locale.code} without changing retry intent`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const commands = await installRoutes(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    if (testInfo.project.name === 'narrow')
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await selectOption(page.getByLabel('Active Company', { exact: true }), {
      label: company.displayName,
    });
    await page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name: 'Client Requests', exact: true })
      .click();
    await selectOption(page.getByLabel('Interface language', { exact: true }), {
      label: locale.name,
    });
    const intake = page.locator('.commercial-intake-workspace');
    await expect(
      intake.getByRole('heading', { name: locale.title, exact: true }),
    ).toBeVisible();
    await intake.getByLabel(locale.source, { exact: true }).fill(originalText);
    await intake
      .getByLabel(locale.subject, { exact: true })
      .fill(saved.subject ?? '');
    await intake
      .getByLabel(locale.opportunity, { exact: true })
      .fill('Original Opportunity');
    await intake
      .getByLabel(locale.next, { exact: true })
      .fill('Contact the Client');
    await intake
      .getByRole('button', { name: locale.capture, exact: true })
      .click();
    await expect(intake.locator(':scope > [role="alert"]')).toHaveText(
      locale.error,
    );
    if (testInfo.project.name === 'narrow') {
      for (const width of [390, 320, 820]) {
        await page.setViewportSize({ width, height: 844 });
        await expectNarrowLocaleRow(page);
        await expect(
          intake.getByRole('textbox', { name: locale.source, exact: true }),
        ).toHaveValue(originalText);
        await expect(
          intake.getByLabel(locale.subject, { exact: true }),
        ).toHaveValue('Demande {original}');
        await expect(page.getByRole('banner')).toContainText(
          company.displayName,
        );
      }
      await page.setViewportSize({ width: 390, height: 844 });
    }
    const alternate = locale.code === 'en' ? locales[0] : locales[3];
    await selectOption(page.getByLabel(locale.label, { exact: true }), {
      label: alternate.name,
    });
    await expect(intake.locator(':scope > [role="alert"]')).toHaveText(
      alternate.error,
    );
    await expect(
      intake.getByRole('textbox', { name: alternate.source, exact: true }),
    ).toHaveValue(originalText);
    await selectOption(page.getByLabel(alternate.label, { exact: true }), {
      label: locale.name,
    });
    await intake
      .getByRole('button', { name: locale.capture, exact: true })
      .click();
    await expect(
      intake.getByRole('heading', { name: 'Demande {original}', exact: true }),
    ).toBeVisible();
    expect(commands.captures).toHaveLength(2);
    expect(commands.captures[0]?.key).toBeTruthy();
    expect(commands.captures[1]).toEqual(commands.captures[0]);
    expect(commands.captures[0]?.body).toBe(
      JSON.stringify({
        originalText,
        subject: 'Demande {original}',
        opportunity: {
          title: 'Original Opportunity',
          nextAction: 'Contact the Client',
        },
      }),
    );
    const association = intake.locator('.commercial-intake-client-association');
    await association.getByLabel(locale.search, { exact: true }).fill('Client');
    await association
      .getByRole('button', { name: locale.find, exact: true })
      .click();
    await selectOption(
      association.getByLabel(locale.existing, { exact: true }),
      { label: client.displayName },
    );
    await association
      .getByRole('button', { name: locale.confirm, exact: true })
      .click();
    await expect(
      association.getByRole('button', { name: locale.retry, exact: true }),
    ).toBeVisible();
    await selectOption(page.getByLabel(locale.label, { exact: true }), {
      label: alternate.name,
    });
    await expect(
      association.getByLabel(alternate.search, { exact: true }),
    ).toHaveValue('Client');
    await expect(
      association.getByLabel(alternate.existing, { exact: true }),
    ).toHaveAttribute('data-value', client.id);
    await association
      .getByRole('button', { name: alternate.retry, exact: true })
      .click();
    expect(commands.associations).toHaveLength(2);
    expect(commands.associations[0]?.key).toBeTruthy();
    expect(commands.associations[1]).toEqual(commands.associations[0]);
    expect(commands.associations[0]?.body).toBe(
      JSON.stringify({ expectedVersion: 1, clientAccountId: client.id }),
    );
    await expect(intake.locator('.commercial-intake-detail')).toContainText(
      client.displayName,
    );
    await selectOption(page.getByLabel(alternate.label, { exact: true }), {
      label: locale.name,
    });
    await intake
      .getByRole('button', { name: locale.back, exact: true })
      .click();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', locale.code);
    await intake
      .getByRole('button')
      .filter({ has: page.getByText('Demande {original}', { exact: true }) })
      .click();
    await expect(intake.getByText(originalText, { exact: true })).toBeVisible();
    await expect(intake.locator('.commercial-intake-detail')).toContainText(
      client.displayName,
    );
    const timestamp = intake.locator('.commercial-intake-detail time').first();
    await expect(timestamp).toHaveText(locale.timestamp);
    await expect(timestamp).toHaveAttribute('datetime', saved.capturedAt);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(testInfo.project.name === 'narrow' ? 390 : 1440);
    await intake
      .getByRole('heading', { name: 'Demande {original}', exact: true })
      .click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`request-${locale.code}.png`),
      fullPage: true,
    });
    if (testInfo.project.name === 'narrow') {
      await page.goto('/?frame=classic#requests');
      await expect(page.locator('html')).toHaveAttribute('lang', locale.code);
      await expectNarrowLocaleRow(page);
      await page.screenshot({
        path: testInfo.outputPath(`locale-row-classic-${locale.code}.png`),
        fullPage: true,
      });
    }
  });
}

async function expectNarrowLocaleRow(page: Page): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  const control = page.locator('.interface-locale-control');
  const header = page.getByRole('banner');
  await expect(control).toBeVisible();
  await expect(header).toBeVisible();
  const controlBounds = await control.boundingBox();
  const headerBounds = await header.boundingBox();
  if (!controlBounds || !headerBounds)
    throw new Error(
      'The locale control and application header must have layout boxes',
    );
  expect(controlBounds.y + controlBounds.height).toBeLessThanOrEqual(
    headerBounds.y,
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
}
