import {
  expect,
  test,
  type Page,
  type Route,
  type TestInfo,
} from '@playwright/test';
import {
  actorContextFixture,
  operationalHomeFixture,
} from './actor-context.fixture';
import { selectOption } from './select-option';

const locales = [
  {
    code: 'ro',
    launch: 'Client nou',
    title: 'Înregistrează un Client',
    name: 'Numele afișat al Clientului',
    tax: 'IDNO / cod fiscal',
    address: 'Adresă',
    telephone: 'Telefon',
    email: 'Email general',
    activity: 'Activitate economică',
    submit: 'Creează Client',
    pending: 'Se creează…',
    close: 'Închide înregistrarea',
    add: 'Adaugă Contact',
    remove: 'Elimină Contact',
    contact: 'Contact 1',
    contactName: 'Numele Contactului',
    contactTelephone: 'Telefonul Contactului',
    contactEmail: 'Emailul Contactului',
    position: 'Funcția Contactului',
    roles: 'Roluri în luarea deciziilor',
    roleLabels: [
      'Decident final',
      'Persoană de influență',
      'Utilizator',
      'Financiar',
      'Tehnic',
      'Opozant',
    ],
    preferences: 'Preferințele de comunicare ale Contactului',
    preferencesSummary:
      'Preferințe de comunicare: Română {limbă}\nРусский; email dimineața',
    rolesSummary: 'Roluri în luarea deciziilor: Decident final, Tehnic',
    help: 'Doar preferințe practice, precum limba, canalul preferat sau orele potrivite. Salvarea nu trimite mesaje și nu înregistrează consimțământ sau aprobare.',
    retry:
      'Crearea Clientului nu a putut fi confirmată. Reîncercați în siguranță cu aceleași date.',
    success: 'Client creat și asociat cu Compania activă.',
  },
  {
    code: 'ru',
    launch: 'Новый Клиент',
    title: 'Зарегистрировать Клиента',
    name: 'Отображаемое название Клиента',
    tax: 'IDNO / налоговый код',
    address: 'Адрес',
    telephone: 'Телефон',
    email: 'Общий email',
    activity: 'Хозяйственная деятельность',
    submit: 'Создать Клиента',
    pending: 'Создание…',
    close: 'Закрыть регистрацию',
    add: 'Добавить Контакт',
    remove: 'Удалить Контакт',
    contact: 'Контакт 1',
    contactName: 'Имя Контакта',
    contactTelephone: 'Телефон Контакта',
    contactEmail: 'Email Контакта',
    position: 'Должность Контакта',
    roles: 'Роли в принятии решений',
    roleLabels: [
      'Окончательный ЛПР',
      'Влиятельное лицо',
      'Пользователь',
      'Финансовая роль',
      'Техническая роль',
      'Противник',
    ],
    preferences: 'Предпочтения Контакта по общению',
    preferencesSummary:
      'Предпочтения по общению: Română {limbă}\nРусский; email dimineața',
    rolesSummary:
      'Роли в принятии решений: Окончательный ЛПР, Техническая роль',
    help: 'Только практические предпочтения: язык, предпочтительный канал или удобное время. Сохранение не отправляет сообщений и не фиксирует согласие или одобрение.',
    retry:
      'Не удалось подтвердить создание Клиента. Безопасно повторите попытку с теми же данными.',
    success: 'Клиент создан и связан с активной Компанией.',
  },
  {
    code: 'fr',
    launch: 'Nouveau Client',
    title: 'Inscrire un Client',
    name: 'Nom affiché du Client',
    tax: 'IDNO / code fiscal',
    address: 'Adresse',
    telephone: 'Téléphone',
    email: 'Email général',
    activity: 'Activité économique',
    submit: 'Créer le Client',
    pending: 'Création…',
    close: 'Fermer l’inscription',
    add: 'Ajouter un Contact',
    remove: 'Retirer le Contact',
    contact: 'Contact 1',
    contactName: 'Nom du Contact',
    contactTelephone: 'Téléphone du Contact',
    contactEmail: 'Email du Contact',
    position: 'Fonction du Contact',
    roles: 'Rôles dans la décision',
    roleLabels: [
      'Décideur final',
      'Personne influente',
      'Utilisateur',
      'Financier',
      'Technique',
      'Opposant',
    ],
    preferences: 'Préférences de communication du Contact',
    preferencesSummary:
      'Préférences de communication : Română {limbă}\nРусский; email dimineața',
    rolesSummary: 'Rôles dans la décision : Décideur final, Technique',
    help: 'Préférences pratiques uniquement : langue, canal préféré ou horaires adaptés. Leur enregistrement n’envoie aucun message et ne consigne ni consentement ni approbation.',
    retry:
      'La création du Client n’a pas pu être confirmée. Réessayez en toute sécurité avec les mêmes informations.',
    success: 'Client créé et lié à l’Entreprise active.',
  },
  {
    code: 'en',
    launch: 'New Client',
    title: 'Register a Client',
    name: 'Client display name',
    tax: 'IDNO / tax code',
    address: 'Address',
    telephone: 'Telephone',
    email: 'General email',
    activity: 'Business activity',
    submit: 'Create Client',
    pending: 'Creating…',
    close: 'Close registration',
    add: 'Add Contact',
    remove: 'Remove Contact',
    contact: 'Contact 1',
    contactName: 'Contact name',
    contactTelephone: 'Contact telephone',
    contactEmail: 'Contact email',
    position: 'Contact position',
    roles: 'Decision roles',
    roleLabels: [
      'Final decision-maker',
      'Influencer',
      'User',
      'Financial',
      'Technical',
      'Blocker',
    ],
    preferences: 'Contact communication preferences',
    preferencesSummary:
      'Communication preferences: Română {limbă}\nРусский; email dimineața',
    rolesSummary: 'Decision roles: Final decision-maker, Technical',
    help: 'Practical preferences only, such as language, preferred channel or suitable times. Saving them sends no message and records no consent or approval.',
    retry:
      'The Client creation could not be confirmed. Retry the same details safely.',
    success: 'Client created and linked to the active Company.',
  },
] as const;

const company = {
  id: 'company-registration-644',
  displayName: 'Companie {company}',
};
const client = {
  id: 'client-registration-644',
  displayName: 'Știință {клиент} & Co',
  relatedToActiveCompany: true,
  taxId: 'MD-{644}',
  address: 'Strada Științei {адрес}',
  telephone: '+373 60 000 644',
  generalEmail: 'client@example.test',
  businessActivity: 'Cercetare {наука}',
  contacts: [
    {
      name: 'Ion {контакт}',
      telephone: '+373 60 001 644',
      email: 'ion@example.test',
      position: 'Director {funcție}',
      decisionRoles: ['final_decision_maker', 'technical'],
      communicationPreferences: 'Română {limbă}\nРусский; email dimineața',
    },
  ],
  version: 1,
  involvedCompanyDisplayNames: [company.displayName],
};
const expectedBody = JSON.stringify({
  displayName: 'Știință {клиент} & Co',
  taxId: 'MD-{644}',
  address: 'Strada Științei {адрес}',
  telephone: '+373 60 000 644',
  generalEmail: 'client@example.test',
  contacts: client.contacts,
  businessActivity: 'Cercetare {наука}',
});
const localeLabels = [
  'Limba interfeței',
  'Язык интерфейса',
  'Langue de l’interface',
  'Interface language',
] as const;

type LocaleFixture = (typeof locales)[number];
async function keyboardLocale(
  page: Page,
  label: string,
  locale: LocaleFixture,
) {
  const control = page.getByRole('combobox', { name: label, exact: true });
  await control.focus();
  await control.press('Home');
  for (
    let index = 0;
    index < locales.findIndex((candidate) => candidate.code === locale.code);
    index += 1
  )
    await control.press('ArrowDown');
  await control.press('Enter');
  await expect(
    page.getByRole('combobox', {
      name: localeLabels[locales.indexOf(locale)],
      exact: true,
    }),
  ).toBeFocused();
}

async function inspectFocusedSkip({
  page,
  testInfo,
  locale,
}: {
  page: Page;
  testInfo: TestInfo;
  locale: LocaleFixture;
}) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const skip = page.locator('.prisme-skip-link');
  const label = page.locator('label[for="interface-locale"]');
  await skip.focus();
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport({ ratio: 1 });
  await expect(label).toBeInViewport({ ratio: 1 });
  const geometry = await skip.evaluate((link) => {
    const label = document.querySelector('label[for="interface-locale"]');
    const picker = document.querySelector('.interface-locale-control');
    const header = document.querySelector('header');
    if (!label || !picker || !header)
      throw new Error('Expected the real language label, picker and header.');
    function rectangle(element: Element) {
      const bounds = element.getBoundingClientRect();
      return {
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
        left: bounds.left,
        width: bounds.width,
        height: bounds.height,
      };
    }
    const skip = rectangle(link);
    const languageLabel = rectangle(label);
    return {
      skip,
      languageLabel,
      picker: rectangle(picker),
      header: rectangle(header),
      overlap: {
        width: Math.max(
          0,
          Math.min(skip.right, languageLabel.right) -
            Math.max(skip.left, languageLabel.left),
        ),
        height: Math.max(
          0,
          Math.min(skip.bottom, languageLabel.bottom) -
            Math.max(skip.top, languageLabel.top),
        ),
      },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scroll: { x: window.scrollX, y: window.scrollY },
      skipFocused: document.activeElement === link,
      label: label.textContent,
      skipText: link.textContent,
    };
  });
  await testInfo.attach(`language-skip-${locale.code}-geometry.json`, {
    body: JSON.stringify(geometry, null, 2),
    contentType: 'application/json',
  });
  await page.screenshot({
    path: testInfo.outputPath(
      `client-registration-${locale.code}-language-skip-viewport.png`,
    ),
  });
  expect(geometry.picker.bottom).toBeLessThanOrEqual(geometry.header.top);
  expect(
    geometry.overlap.width * geometry.overlap.height,
    'The focused skip link must not cover the interface language label',
  ).toBe(0);
  await skip.press('Enter');
  await expect(page.locator('#prisme-page-title')).toBeFocused();
}

async function installRoutes(page: Page) {
  let created = false;
  let reads = 0;
  let firstRoute: Route | undefined;
  const requests: {
    method: string;
    path: string;
    company: string | undefined;
  }[] = [];
  const commands: {
    body: string | null;
    key: string | undefined;
    company: string | undefined;
  }[] = [];
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const companyId = request.headers()['x-company-context-id'];
    requests.push({ method: request.method(), path, company: companyId });
    if (path === '/api/access/current-actor')
      return route.fulfill({
        json: {
          ...actorContextFixture,
          workspacePermissions: [],
          ...(companyId
            ? {
                activeCompany: {
                  ...company,
                  clientPermissions: [
                    'client.read',
                    'client.create',
                    'client.update',
                  ],
                  clientPermissionAssignmentId: 'director-registration-644',
                  clientPermissionSetVersion: 'v1',
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
        json: operationalHomeFixture(company.id, {
          active_clients: created ? 1 : 0,
        }),
      });
    if (path === '/api/clients') {
      if (request.method() === 'POST') {
        expect(companyId).toBe(company.id);
        expect(request.postData()).toBe(expectedBody);
        expect(request.headers()['idempotency-key']).toBeTruthy();
        commands.push({
          body: request.postData(),
          key: request.headers()['idempotency-key'],
          company: companyId,
        });
        created = true;
        if (commands.length === 1) {
          firstRoute = route;
          return;
        }
        return route.fulfill({ status: 201, json: client });
      }
      reads += 1;
      return route.fulfill({ json: created ? [client] : [] });
    }
    if (path === `/api/clients/${client.id}`) {
      expect(companyId).toBe(company.id);
      return route.fulfill({ json: client });
    }
    if (path === `/api/clients/${client.id}/legal-entities`)
      return route.fulfill({ json: { clientVersion: 1, legalEntities: [] } });
    return route.fulfill({ status: 404 });
  });
  return {
    commands,
    requests,
    reads: () => reads,
    failConfirmation: async () => {
      if (!firstRoute) throw new Error('Expected first pending creation');
      await firstRoute.fulfill({ status: 503, json: {} });
    },
  };
}

for (const locale of locales) {
  test(`Client registration preserves Contact content and exact lost-confirmation retry in ${locale.code}`, async ({
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
    await expect(
      workspace.getByText('No Clients for Companie {company} yet.', {
        exact: true,
      }),
    ).toBeVisible();
    const requestCount = observed.requests.length;
    const directoryReads = observed.reads();
    await keyboardLocale(page, 'Interface language', locale);
    expect(observed.requests).toHaveLength(requestCount);
    await inspectFocusedSkip({ page, testInfo, locale });
    const trigger = workspace.getByRole('button', {
      name: locale.launch,
      exact: true,
    });
    await trigger.focus();
    await trigger.press('Enter');
    await expect(
      workspace.getByRole('heading', { name: locale.title, exact: true }),
    ).toBeVisible();
    await expect(
      workspace.getByLabel(locale.name, { exact: true }),
    ).toBeFocused();
    await workspace
      .getByLabel(locale.name, { exact: true })
      .fill('  Știință {клиент} & Co  ');
    await workspace
      .getByLabel(locale.tax, { exact: true })
      .fill('  MD-{644}  ');
    await workspace
      .getByLabel(locale.address, { exact: true })
      .fill('  Strada Științei {адрес}  ');
    await workspace
      .getByLabel(locale.telephone, { exact: true })
      .fill('  +373 60 000 644  ');
    await workspace
      .getByLabel(locale.email, { exact: true })
      .fill('client@example.test');
    await workspace
      .getByLabel(locale.activity, { exact: true })
      .fill('  Cercetare {наука}  ');
    const add = workspace.getByRole('button', {
      name: locale.add,
      exact: true,
    });
    await add.focus();
    await add.press('Enter');
    await expect(
      workspace.getByRole('group', { name: locale.contact, exact: true }),
    ).toBeVisible();
    await expect(
      workspace.getByRole('group', { name: locale.roles, exact: true }),
    ).toBeVisible();
    await workspace
      .getByLabel(locale.contactName, { exact: true })
      .fill('  Ion {контакт}  ');
    await workspace
      .getByLabel(locale.contactTelephone, { exact: true })
      .fill('  +373 60 001 644  ');
    await workspace
      .getByLabel(locale.contactEmail, { exact: true })
      .fill('  ion@example.test  ');
    await workspace
      .getByLabel(locale.position, { exact: true })
      .fill('  Director {funcție}  ');
    await workspace
      .getByLabel(locale.preferences, { exact: true })
      .fill('  Română {limbă}\nРусский; email dimineața  ');
    const technical = workspace.getByRole('checkbox', {
      name: locale.roleLabels[4],
      exact: true,
    });
    await technical.focus();
    await technical.press('Space');
    await workspace
      .getByRole('checkbox', { name: locale.roleLabels[0], exact: true })
      .check();
    await add.click();
    const remove = workspace
      .getByRole('button', { name: locale.remove, exact: true })
      .nth(1);
    await remove.focus();
    await remove.press('Enter');
    await expect(
      workspace.getByLabel(locale.preferences, { exact: true }),
    ).toHaveAccessibleDescription(locale.help);
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`client-registration-${locale.code}-draft.png`),
      fullPage: true,
    });
    const preferences = workspace.getByLabel(locale.preferences, {
      exact: true,
    });
    await preferences.focus();
    await expect(preferences).toBeInViewport({ ratio: 1 });
    await page.screenshot({
      path: testInfo.outputPath(
        `client-registration-${locale.code}-contact-viewport.png`,
      ),
    });
    const submit = workspace.getByRole('button', {
      name: locale.submit,
      exact: true,
    });
    await submit.focus();
    await expect(submit).toBeInViewport({ ratio: 1 });
    await page.screenshot({
      path: testInfo.outputPath(
        `client-registration-${locale.code}-action-viewport.png`,
      ),
    });
    const alternate = locale.code === 'en' ? locales[0] : locales[3];
    await keyboardLocale(
      page,
      localeLabels[locales.indexOf(locale)],
      alternate,
    );
    await expect(
      workspace.getByLabel(alternate.name, { exact: true }),
    ).toHaveValue('  Știință {клиент} & Co  ');
    await expect(
      workspace.getByLabel(alternate.preferences, { exact: true }),
    ).toHaveValue('  Română {limbă}\nРусский; email dimineața  ');
    await expect(
      workspace.getByRole('checkbox', {
        name: alternate.roleLabels[4],
        exact: true,
      }),
    ).toBeChecked();
    expect(observed.requests).toHaveLength(requestCount);
    await workspace
      .getByRole('button', { name: alternate.submit, exact: true })
      .click();
    await expect.poll(() => observed.commands.length).toBe(1);
    await expect(
      workspace.getByRole('button', { name: alternate.pending, exact: true }),
    ).toBeDisabled();
    const pendingRequestCount = observed.requests.length;
    await keyboardLocale(
      page,
      localeLabels[locales.indexOf(alternate)],
      locale,
    );
    await expect(
      workspace.getByRole('button', { name: locale.pending, exact: true }),
    ).toBeDisabled();
    expect(observed.requests).toHaveLength(pendingRequestCount);
    await workspace
      .getByRole('button', { name: locale.close, exact: true })
      .click();
    await expect(
      workspace.getByRole('button', { name: locale.launch, exact: true }),
    ).toBeFocused();
    await expect(
      workspace.getByLabel(locale.name, { exact: true }),
    ).toBeHidden();
    await observed.failConfirmation();
    await expect(workspace.getByRole('alert')).toHaveText(locale.retry);
    await keyboardLocale(
      page,
      localeLabels[locales.indexOf(locale)],
      alternate,
    );
    await expect(workspace.getByRole('alert')).toHaveText(alternate.retry);
    expect(observed.requests).toHaveLength(pendingRequestCount);
    expect(observed.reads()).toBe(directoryReads);
    await workspace
      .getByRole('button', { name: alternate.launch, exact: true })
      .click();
    await expect(
      workspace.getByLabel(alternate.preferences, { exact: true }),
    ).toHaveValue('  Română {limbă}\nРусский; email dimineața  ');
    await keyboardLocale(
      page,
      localeLabels[locales.indexOf(alternate)],
      locale,
    );
    await expect(workspace.getByRole('alert')).toHaveText(locale.retry);
    await workspace
      .getByRole('button', { name: locale.submit, exact: true })
      .click();
    await expect(workspace.getByRole('status')).toHaveText(locale.success);
    expect(observed.commands).toHaveLength(2);
    expect(observed.commands[1]).toEqual(observed.commands[0]);
    await workspace
      .getByRole('button', { name: locale.close, exact: true })
      .click();
    await expect(
      workspace.getByRole('heading', { name: client.displayName, exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('combobox', {
        name: localeLabels[locales.indexOf(locale)],
        exact: true,
      }),
    ).toHaveAttribute('data-value', locale.code);
    const openLabels = {
      ro: 'Deschide dosarul',
      ru: 'Открыть досье',
      fr: 'Ouvrir le dossier',
      en: 'Open dossier',
    };
    const open = workspace.getByRole('button', {
      name: openLabels[locale.code],
      exact: true,
    });
    await open.focus();
    await open.press('Enter');
    const dossier = workspace.locator('.client-dossier-detail');
    await expect(
      dossier.getByRole('heading', { name: client.displayName, exact: true }),
    ).toBeFocused();
    const reading = dossier.locator('.client-dossier-reading');
    for (const value of [
      client.taxId,
      client.address,
      client.telephone,
      client.generalEmail,
      client.businessActivity,
      'Ion {контакт}',
      'Director {funcție}',
    ])
      await expect(reading.getByText(value, { exact: true })).toBeVisible();
    const preferencesSummary = reading.locator(
      '.client-contact-communication-preferences',
    );
    await expect(preferencesSummary).toHaveText(locale.preferencesSummary);
    expect(await preferencesSummary.textContent()).toBe(
      locale.preferencesSummary,
    );
    await expect(
      reading.getByText(locale.rolesSummary, {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      observed.requests.some(
        (request) =>
          request.path === `/api/clients/${client.id}` &&
          request.company === company.id,
      ),
    ).toBe(true);
    expect(observed.commands).toHaveLength(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: testInfo.outputPath(`client-registration-${locale.code}-saved.png`),
      fullPage: true,
    });
  });
}
