import {
  expect,
  test,
  type Page,
  type Route,
  type TestInfo,
} from '@playwright/test';
import {
  installDossierFixture,
  dossierCompany,
} from './prisme-dossier.fixture';
import { actorContextFixture } from './actor-context.fixture';
import type { InterfaceLocale } from '../src/localization/interface-locale';
import type { ClientContact } from '../src/client/ClientContactEditor';

const locales = [
  {
    code: 'ro',
    open: 'Deschide dosarul',
    form: 'Corectează dosarul Clientului',
    close: 'Închide corectarea',
    name: 'Numele afișat al Clientului',
    address: 'Adresă',
    save: 'Salvează corectarea',
    pending: 'Se salvează…',
    required: 'Numele afișat al Clientului este obligatoriu.',
    uncertain: 'Corectarea nu a putut fi salvată. Reîncearcă în siguranță.',
    saved: 'Corectarea Clientului a fost salvată cu istoric atribuibil.',
    contactName: 'Numele Contactului',
    position: 'Funcția Contactului',
    preferences: 'Preferințele de comunicare ale Contactului',
    financial: 'Financiar',
    history: 'Istoricul corectărilor',
    showHistory: 'Arată istoricul corectărilor',
    hideHistory: 'Ascunde istoricul corectărilor',
    list: 'Corectări, cele mai noi primele',
    older: 'Arată corectări mai vechi',
    loadingOlder: 'Se încarcă corectările mai vechi…',
    before: 'Înainte',
    after: 'După',
    attribution: 'Corectat de Ada {literal}',
    previousActor: 'Corectat de Actor anterior',
    roles: 'Roluri în luarea deciziilor: Financiar, Tehnic',
  },
  {
    code: 'ru',
    open: 'Открыть досье',
    form: 'Исправить досье Клиента',
    close: 'Закрыть исправление',
    name: 'Отображаемое название Клиента',
    address: 'Адрес',
    save: 'Сохранить исправление',
    pending: 'Сохранение…',
    required: 'Укажите отображаемое название Клиента.',
    uncertain: 'Не удалось сохранить исправление. Безопасно повторите попытку.',
    saved: 'Исправление Клиента сохранено с указанием автора в истории.',
    contactName: 'Имя Контакта',
    position: 'Должность Контакта',
    preferences: 'Предпочтения Контакта по общению',
    financial: 'Финансовая роль',
    history: 'История исправлений',
    showHistory: 'Показать историю исправлений',
    hideHistory: 'Скрыть историю исправлений',
    list: 'Исправления, сначала новые',
    older: 'Показать предыдущие исправления',
    loadingOlder: 'Загрузка предыдущих исправлений…',
    before: 'До',
    after: 'После',
    attribution: 'Исправил: Ada {literal}',
    previousActor: 'Исправил: Actor anterior',
    roles: 'Роли в принятии решений: Финансовая роль, Техническая роль',
  },
  {
    code: 'fr',
    open: 'Ouvrir le dossier',
    form: 'Corriger le dossier du Client',
    close: 'Fermer la correction',
    name: 'Nom affiché du Client',
    address: 'Adresse',
    save: 'Enregistrer la correction',
    pending: 'Enregistrement…',
    required: 'Le nom affiché du Client est obligatoire.',
    uncertain:
      'La correction n’a pas pu être enregistrée. Réessayez en toute sécurité.',
    saved: 'Correction du Client enregistrée avec un historique attribuable.',
    contactName: 'Nom du Contact',
    position: 'Fonction du Contact',
    preferences: 'Préférences de communication du Contact',
    financial: 'Financier',
    history: 'Historique des corrections',
    showHistory: 'Afficher l’historique des corrections',
    hideHistory: 'Masquer l’historique des corrections',
    list: 'Corrections, les plus récentes d’abord',
    older: 'Afficher les corrections plus anciennes',
    loadingOlder: 'Chargement des corrections plus anciennes…',
    before: 'Avant',
    after: 'Après',
    attribution: 'Corrigé par Ada {literal}',
    previousActor: 'Corrigé par Actor anterior',
    roles: 'Rôles dans la décision : Financier, Technique',
  },
  {
    code: 'en',
    open: 'Open dossier',
    form: 'Correct Client dossier',
    close: 'Close correction',
    name: 'Client display name',
    address: 'Address',
    save: 'Save correction',
    pending: 'Saving…',
    required: 'Client display name is required.',
    uncertain: 'The correction could not be saved. Retry safely.',
    saved: 'Client correction saved with attributable history.',
    contactName: 'Contact name',
    position: 'Contact position',
    preferences: 'Contact communication preferences',
    financial: 'Financial',
    history: 'Correction history',
    showHistory: 'Show correction history',
    hideHistory: 'Hide correction history',
    list: 'Corrections, newest first',
    older: 'Show older corrections',
    loadingOlder: 'Loading older corrections…',
    before: 'Before',
    after: 'After',
    attribution: 'Corrected by Ada {literal}',
    previousActor: 'Corrected by Actor anterior',
    roles: 'Decision roles: Financial, Technical',
  },
] as const;

type LocaleCase = (typeof locales)[number];
type Command = {
  path: string;
  method: string;
  body: string | null;
  company: string | undefined;
  key: string | undefined;
};

function localeCase(code: InterfaceLocale): LocaleCase {
  const found = locales.find((locale) => locale.code === code);
  if (!found) throw new Error('Expected a supported locale.');
  return found;
}

async function chooseLocale(page: Page, code: InterfaceLocale) {
  const control = page.locator('#interface-locale');
  await control.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Home');
  for (
    let index = 0;
    index < locales.findIndex((locale) => locale.code === code);
    index += 1
  )
    await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(control).toHaveAttribute('data-value', code);
  await expect(control).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('lang', code);
}

async function openLocalizedDossier(
  page: Page,
  locale: LocaleCase,
  name: string,
) {
  await page.addInitScript(
    (code) => window.localStorage.setItem('prisma-prim.interface-locale', code),
    locale.code,
  );
  await page.goto('/?frame=prisme#clients');
  const open = page.getByRole('button', { name: locale.open, exact: true });
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#client-dossier-title')).toHaveText(name);
  await expect(page.locator('#client-dossier-title')).toBeFocused();
}

async function assertFit(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      Array.from(
        document.querySelectorAll('button, input, textarea, [role="combobox"]'),
      )
        .filter(
          (node) =>
            node.getClientRects().length > 0 && !node.closest('[hidden]'),
        )
        .map((node) => node.getBoundingClientRect())
        .every((rect) => rect.left >= 0 && rect.right <= window.innerWidth),
    ),
  ).toBe(true);
}

async function capture(page: Page, info: TestInfo, name: string) {
  await assertFit(page);
  await page.screenshot({ path: info.outputPath(`${name}-viewport.png`) });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    fullPage: true,
  });
}

for (const locale of locales) {
  test(`preserves the real App dossier, full Contact draft, exact retry and Company history in ${locale.code}`, async ({
    page,
  }, testInfo) => {
    const state = await installDossierFixture(page);
    const pageErrors: string[] = [];
    const consoleErrors: string[] = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (
        message.type() === 'error' &&
        !message.text().includes('the server responded with a status of 503')
      )
        consoleErrors.push(message.text());
    });
    const firstContact = {
      name: 'Ana Ionescu',
      telephone: '+373 60 333 444',
      email: 'ana@example.test',
      position: 'Directrice — технический {literal} '.repeat(4),
      decisionRoles: ['technical'],
      communicationPreferences: 'Română; русский\nemail {dimineața}',
    } satisfies ClientContact;
    state.dossier = {
      ...state.dossier,
      contacts: [
        firstContact,
        {
          name: 'Ion Popa',
          telephone: '+373 60 555 666',
          email: 'ion@example.test',
        },
      ],
    };
    state.legalEntities = [
      {
        id: 'legal-private-id',
        legalName: 'Sucursală {literal} Я',
        taxId: 'ENTITY {literal}',
        legalAddress: 'Rue de la Știință {literal}',
        createdAt: '2026-09-24T07:00:00.000Z',
      },
    ];
    const original = state.dossier;
    const expectedContacts = [
      {
        name: 'Contact {literal} Ș Я',
        telephone: '+373 60 333 444',
        email: 'ana@example.test',
        position: 'Directrice — технический {literal} '.repeat(4).trim(),
        decisionRoles: ['financial', 'technical'],
        communicationPreferences:
          'Română / русский — email {matin}\n09:00–11:00; {literal}',
      },
      {
        name: 'Ion Popa',
        telephone: '+373 60 555 666',
        email: 'ion@example.test',
      },
    ] satisfies ClientContact[];
    const commands: Command[] = [];
    let releasePatch: (() => Promise<void>) | undefined;
    state.patch = (route: Route) => {
      const request = route.request();
      commands.push({
        path: new URL(request.url()).pathname,
        method: request.method(),
        body: request.postData(),
        company: request.headers()['x-company-context-id'],
        key: request.headers()['idempotency-key'],
      });
      if (commands.length === 1) {
        releasePatch = () => route.fulfill({ status: 503, json: {} });
        return;
      }
      expect(commands[1]).toEqual(commands[0]);
      state.dossier = {
        ...original,
        displayName: 'Cabinet {literal} Ș Я',
        address: 'Rue {littéral} Я',
        contacts: expectedContacts,
        version: 2,
      };
      return route.fulfill({ json: state.dossier });
    };
    let allRequests = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/')) allRequests += 1;
    });
    let releaseOlder: (() => Promise<void>) | undefined;
    const historyCursor = 'opaque-history+page?private';
    await page.route(
      '**/api/clients/client-dossier/correction-history*',
      (route) => {
        const request = route.request();
        const url = new URL(request.url());
        expect(request.headers()['x-company-context-id']).toBe(
          dossierCompany.id,
        );
        state.historyReads += 1;
        if (url.search) {
          expect(url.search).toBe(
            `?cursor=${encodeURIComponent(historyCursor)}`,
          );
          releaseOlder = () =>
            route.fulfill({
              json: {
                corrections: [
                  {
                    id: 'older-private-row',
                    occurredAt: '2026-09-23T08:00:00.000Z',
                    actor: { displayName: 'Actor anterior' },
                    changes: {
                      address: {
                        before: null,
                        after: 'Rue antérieure {literal} Я',
                      },
                    },
                  },
                ],
                nextCursor: null,
              },
            });
          return;
        }
        return route.fulfill({
          json: {
            corrections: [
              {
                id: 'first-private-row',
                occurredAt: '2026-09-24T09:15:00.000Z',
                actor: { displayName: 'Ada {literal}' },
                changes: {
                  displayName: {
                    before: original.displayName,
                    after: 'Cabinet {literal} Ș Я',
                  },
                  contacts: {
                    before: original.contacts,
                    after: expectedContacts,
                  },
                },
              },
            ],
            nextCursor: historyCursor,
            internalOperationId: 'PRIVATE operational metadata',
          },
        });
      },
    );
    await openLocalizedDossier(page, locale, original.displayName);
    await expect(
      page.getByText('Sucursală {literal} Я', { exact: true }),
    ).toBeVisible();
    const trigger = page.getByRole('button', {
      name: locale.form,
      exact: true,
    });
    await trigger.focus();
    await page.keyboard.press('Enter');
    let form = page.getByRole('form', { name: locale.form, exact: true });
    const name = form.getByRole('textbox', { name: locale.name, exact: true });
    await expect(name).toBeFocused();
    await name.fill('   ');
    await form.getByRole('button', { name: locale.save, exact: true }).click();
    await expect(name).toHaveAttribute('aria-invalid', 'true');
    await expect(name).toHaveAccessibleDescription(locale.required);
    expect(commands).toHaveLength(0);
    await name.scrollIntoViewIfNeeded();
    await capture(page, testInfo, `${locale.code}-validation`);
    await name.fill('  Cabinet {literal} Ș Я  ');
    await form
      .getByRole('textbox', { name: locale.address, exact: true })
      .fill('  Rue {littéral} Я  ');
    const contact = form.getByRole('group').first();
    await contact
      .getByRole('textbox', { name: locale.contactName, exact: true })
      .fill('  Contact {literal} Ș Я  ');
    await contact
      .getByRole('textbox', { name: locale.preferences, exact: true })
      .fill('  Română / русский — email {matin}\n09:00–11:00; {literal}  ');
    await contact
      .getByRole('checkbox', { name: locale.financial, exact: true })
      .check();
    const nameNode = await name.elementHandle();
    const formNode = await form.elementHandle();
    if (!nameNode || !formNode)
      throw new Error('Expected mounted correction controls.');
    await nameNode.evaluate((node) => {
      if (!(node instanceof HTMLInputElement))
        throw new Error('Expected input.');
      node.focus();
      node.setSelectionRange(3, 11);
    });
    const rawFields = await form
      .locator('input, textarea')
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          if (!(
            node instanceof HTMLInputElement ||
            node instanceof HTMLTextAreaElement
          ))
            throw new Error('Expected field.');
          return {
            value: node.value,
            checked: node instanceof HTMLInputElement ? node.checked : false,
          };
        }),
      );
    const other = localeCase(locale.code === 'en' ? 'ro' : 'en');
    const beforeSwitch = allRequests;
    await chooseLocale(page, other.code);
    form = page.getByRole('form', { name: other.form, exact: true });
    expect(
      await nameNode.evaluate(
        (node) => node === document.getElementById('dossier-displayName'),
      ),
    ).toBe(true);
    expect(
      await formNode.evaluate(
        (node) => node === document.querySelector('#client-correction form'),
      ),
    ).toBe(true);
    expect(
      await nameNode.evaluate((node) =>
        node instanceof HTMLInputElement
          ? [node.selectionStart, node.selectionEnd]
          : null,
      ),
    ).toEqual([3, 11]);
    expect(
      await form.locator('input, textarea').evaluateAll((nodes) =>
        nodes.map((node) => {
          if (!(
            node instanceof HTMLInputElement ||
            node instanceof HTMLTextAreaElement
          ))
            throw new Error('Expected field.');
          return {
            value: node.value,
            checked: node instanceof HTMLInputElement ? node.checked : false,
          };
        }),
      ),
    ).toEqual(rawFields);
    expect(allRequests).toBe(beforeSwitch);
    await chooseLocale(page, locale.code);
    await page.getByRole('button', { name: locale.close, exact: true }).click();
    await expect(
      page.getByRole('button', { name: locale.form, exact: true }),
    ).toBeFocused();
    await expect(
      page.getByRole('form', { name: locale.form, exact: true }),
    ).toBeHidden();
    await page.keyboard.press('Enter');
    form = page.getByRole('form', { name: locale.form, exact: true });
    await expect(
      form.getByRole('textbox', { name: locale.name, exact: true }),
    ).toHaveValue('  Cabinet {literal} Ș Я  ');
    expect(await nameNode.evaluate((node) => node.isConnected)).toBe(true);
    expect(state.dossierReads).toBe(1);
    await form.getByRole('button', { name: locale.save, exact: true }).click();
    await expect.poll(() => commands.length).toBe(1);
    await expect(
      form.getByRole('button', { name: locale.pending, exact: true }),
    ).toBeDisabled();
    const pendingRequests = allRequests;
    await chooseLocale(page, other.code);
    await expect(
      page
        .getByRole('form', { name: other.form, exact: true })
        .getByRole('button', { name: other.pending, exact: true }),
    ).toBeDisabled();
    expect(allRequests).toBe(pendingRequests);
    if (!releasePatch)
      throw new Error('Expected the uncertain correction response.');
    await releasePatch();
    await expect(
      page.getByText(other.uncertain, { exact: true }),
    ).toBeVisible();
    const uncertainRequests = allRequests;
    await chooseLocale(page, locale.code);
    expect(allRequests).toBe(uncertainRequests);
    await expect(
      page.getByText(locale.uncertain, { exact: true }),
    ).toBeVisible();
    expect(commands).toHaveLength(1);
    await page
      .getByText(locale.uncertain, { exact: true })
      .scrollIntoViewIfNeeded();
    await capture(page, testInfo, `${locale.code}-uncertain`);
    form = page.getByRole('form', { name: locale.form, exact: true });
    await form.getByRole('button', { name: locale.save, exact: true }).click();
    await expect(page.getByText(locale.saved, { exact: true })).toBeVisible();
    await expect(page.locator('#client-dossier-title')).toHaveText(
      'Cabinet {literal} Ș Я',
    );
    await expect.poll(() => state.legalEntityReads).toBe(2);
    expect(commands).toHaveLength(2);
    const command = commands[0];
    if (!command || command.body === null)
      throw new Error('Expected a serialized correction.');
    const payload: unknown = JSON.parse(command.body);
    expect(payload).toEqual({
      expectedVersion: 1,
      displayName: 'Cabinet {literal} Ș Я',
      taxId: original.taxId,
      address: 'Rue {littéral} Я',
      telephone: original.telephone,
      generalEmail: original.generalEmail,
      contacts: expectedContacts,
      businessActivity: original.businessActivity,
    });
    expect(command.path).toBe('/api/clients/client-dossier');
    expect(command.method).toBe('PATCH');
    expect(command.company).toBe(dossierCompany.id);
    expect(command.key).toBeTruthy();
    expect(commands[1]).toEqual(command);
    expect(state.historyReads).toBe(0);
    await page.getByRole('button', { name: locale.close, exact: true }).click();
    const historyToggle = page.getByRole('button', {
      name: locale.showHistory,
      exact: true,
    });
    await historyToggle.focus();
    await page.keyboard.press('Enter');
    let history = page.getByRole('region', {
      name: locale.history,
      exact: true,
    });
    const list = history.getByRole('list', { name: locale.list, exact: true });
    const first = list.locator(':scope > li').first();
    await expect(first).toContainText(locale.attribution);
    await expect(
      first.getByRole('group', { name: locale.before, exact: true }),
    ).toContainText(firstContact.communicationPreferences);
    await expect(
      first.getByRole('group', { name: locale.after, exact: true }),
    ).toContainText(locale.roles);
    await expect(first.locator('time')).toHaveAttribute(
      'datetime',
      '2026-09-24T09:15:00.000Z',
    );
    const firstNode = await first.elementHandle();
    if (!firstNode) throw new Error('Expected a history row.');
    await history
      .getByRole('button', { name: locale.older, exact: true })
      .click();
    await expect.poll(() => state.historyReads).toBe(2);
    await expect(
      history.getByRole('button', { name: locale.loadingOlder, exact: true }),
    ).toBeDisabled();
    const pendingPageRequests = allRequests;
    await chooseLocale(page, other.code);
    expect(allRequests).toBe(pendingPageRequests);
    history = page.getByRole('region', { name: other.history, exact: true });
    await expect(
      history.getByRole('button', { name: other.loadingOlder, exact: true }),
    ).toBeDisabled();
    if (!releaseOlder) throw new Error('Expected a pending older page.');
    await releaseOlder();
    await expect(
      history.getByText(other.previousActor, { exact: true }),
    ).toBeVisible();
    await chooseLocale(page, locale.code);
    history = page.getByRole('region', { name: locale.history, exact: true });
    await expect(
      history
        .getByRole('list', { name: locale.list, exact: true })
        .locator(':scope > li'),
    ).toHaveCount(2);
    await expect(
      history.getByText(locale.previousActor, { exact: true }),
    ).toBeVisible();
    expect(await firstNode.evaluate((node) => node.isConnected)).toBe(true);
    await expect(
      page.getByRole('button', { name: locale.hideHistory, exact: true }),
    ).toHaveAttribute('aria-expanded', 'true');
    await expect(
      history.getByRole('button', { name: locale.older, exact: true }),
    ).toHaveCount(0);
    await expect(
      history.getByText('Rue antérieure {literal} Я', { exact: true }),
    ).toBeVisible();
    await expect(history).not.toContainText('PRIVATE operational metadata');
    await expect(history).not.toContainText(historyCursor);
    await expect(history).not.toContainText('first-private-row');
    await expect(history.getByRole('link')).toHaveCount(0);
    await history.scrollIntoViewIfNeeded();
    await capture(page, testInfo, `${locale.code}-history`);
    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    await testInfo.attach('synthetic-correction-commands', {
      body: JSON.stringify(commands, null, 2),
      contentType: 'application/json',
    });
  });
}

test('keeps the real App dossier and Company history read-only through a language switch', async ({
  page,
}, testInfo) => {
  const state = await installDossierFixture(page);
  state.actor = {
    ...state.actor,
    activeCompany: { ...dossierCompany, clientPermissions: ['client.read'] },
  };
  state.history = {
    corrections: [
      {
        id: 'private-read-only-row',
        occurredAt: '2026-09-24T09:15:00.000Z',
        actor: { displayName: 'Actor {literal}' },
        changes: { address: { before: null, after: 'Rue {literal}' } },
      },
    ],
    nextCursor: null,
  };
  await openLocalizedDossier(page, localeCase('fr'), state.dossier.displayName);
  await expect(
    page.getByRole('button', {
      name: 'Corriger le dossier du Client',
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(page.locator('#client-correction')).toHaveCount(0);
  await page
    .getByRole('button', {
      name: 'Afficher l’historique des corrections',
      exact: true,
    })
    .click();
  await expect(
    page.getByText('Corrigé par Actor {literal}', { exact: true }),
  ).toBeVisible();
  const reads = state.historyReads;
  await chooseLocale(page, 'ro');
  await expect(
    page.getByText('Corectat de Actor {literal}', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Corectează dosarul Clientului',
      exact: true,
    }),
  ).toHaveCount(0);
  expect(state.historyReads).toBe(reads);
  expect(state.commands).toHaveLength(0);
  expect(state.legalEntityCommands).toHaveLength(0);
  await capture(page, testInfo, 'ro-read-only-history');
});

test('retires the real App draft and late correction after history revalidation loses actual read authority', async ({
  page,
}, testInfo) => {
  const state = await installDossierFixture(page);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  let releasePatch: (() => Promise<void>) | undefined;
  state.patch = (route) => {
    releasePatch = () =>
      route.fulfill({
        json: {
          ...state.dossier,
          displayName: 'PRIVATE late correction',
          version: 2,
        },
      });
  };
  let releaseHistory: (() => Promise<void>) | undefined;
  await page.route(
    '**/api/clients/client-dossier/correction-history',
    (route) => {
      state.historyReads += 1;
      releaseHistory = () => route.fulfill({ status: 403, json: {} });
    },
  );
  await openLocalizedDossier(page, localeCase('fr'), state.dossier.displayName);
  await page
    .getByRole('button', {
      name: 'Afficher l’historique des corrections',
      exact: true,
    })
    .click();
  await expect.poll(() => state.historyReads).toBe(1);
  await page
    .getByRole('button', { name: 'Corriger le dossier du Client', exact: true })
    .click();
  const form = page.getByRole('form', {
    name: 'Corriger le dossier du Client',
    exact: true,
  });
  await form
    .getByRole('textbox', { name: 'Nom affiché du Client', exact: true })
    .fill('PRIVATE retained draft');
  await form
    .getByRole('button', { name: 'Enregistrer la correction', exact: true })
    .click();
  await expect.poll(() => state.commands.length).toBe(1);
  state.actor = {
    ...actorContextFixture,
    workspacePermissions: ['client.manage'],
    activeCompany: dossierCompany,
  };
  if (!releaseHistory) throw new Error('Expected the pending history request.');
  await releaseHistory();
  await expect(page.locator('#client-dossier-title')).toHaveCount(0);
  await expect(page.locator('#client-correction')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Ouvrir le dossier', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: state.dossier.displayName, exact: true }),
  ).toBeVisible();
  const listReads = state.listReads;
  const activityReads = state.activityReads;
  if (!releasePatch) throw new Error('Expected the pending correction.');
  await releasePatch();
  await chooseLocale(page, 'ro');
  await expect(page.locator('#client-correction')).toHaveCount(0);
  await expect(
    page.getByText('PRIVATE late correction', { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator('input[value="PRIVATE retained draft"]'),
  ).toHaveCount(0);
  await expect(page.getByText('TAX-233', { exact: true })).toHaveCount(0);
  expect(state.listReads).toBe(listReads);
  expect(state.activityReads).toBe(activityReads);
  expect(pageErrors).toEqual([]);
  await capture(page, testInfo, 'ro-authority-retired');
});
