import { expect, test, type Page } from '@playwright/test';
import { installDossierFixture, openDossier } from './prisme-dossier.fixture';

const locales = [
  {
    code: 'ro',
    title: 'Entități juridice și sucursale',
    add: 'Adaugă o entitate juridică sau sucursală',
    addTitle: 'Adăugarea unei entități juridice sau sucursale',
    name: 'Denumirea juridică exactă',
    tax: 'IDNO / cod fiscal',
    address: 'Adresa juridică',
    save: 'Salvează entitatea juridică',
    cancel: 'Anulează',
    correct: 'Corectează',
    required: 'Introduceți denumirea juridică exactă.',
    recorded: 'Entitatea juridică sau sucursala a fost înregistrată.',
    corrected: 'Entitatea juridică sau sucursala a fost corectată.',
    unchanged: 'Modificați cel puțin o valoare înainte de salvare.',
    uncertain: 'Nu am putut confirma dacă această modificare a fost salvată.',
    stale:
      'Acest dosar al Clientului s-a modificat înainte de salvarea modificării dvs.',
    reload: 'Reîncarcă entitățile juridice și sucursalele',
  },
  {
    code: 'ru',
    title: 'Юридические лица и филиалы',
    add: 'Добавить юридическое лицо или филиал',
    addTitle: 'Добавление юридического лица или филиала',
    name: 'Точное юридическое наименование',
    tax: 'IDNO / налоговый код',
    address: 'Юридический адрес',
    save: 'Сохранить юридическое лицо',
    cancel: 'Отмена',
    correct: 'Исправить',
    required: 'Введите точное юридическое наименование.',
    recorded: 'Юридическое лицо или филиал зарегистрированы.',
    corrected: 'Юридическое лицо или филиал исправлены.',
    unchanged: 'Перед сохранением измените хотя бы одно значение.',
    uncertain: 'Не удалось подтвердить, сохранено ли это изменение.',
    stale: 'Досье этого Клиента изменилось до сохранения вашего изменения.',
    reload: 'Перезагрузить юридические лица и филиалы',
  },
  {
    code: 'fr',
    title: 'Entités juridiques et succursales',
    add: 'Ajouter une entité juridique ou une succursale',
    addTitle: 'Ajout d’une entité juridique ou d’une succursale',
    name: 'Dénomination juridique exacte',
    tax: 'IDNO / code fiscal',
    address: 'Adresse juridique',
    save: 'Enregistrer l’entité juridique',
    cancel: 'Annuler',
    correct: 'Corriger',
    required: 'Saisissez la dénomination juridique exacte.',
    recorded: 'Entité juridique ou succursale enregistrée.',
    corrected: 'Entité juridique ou succursale corrigée.',
    unchanged: 'Modifiez au moins une valeur avant d’enregistrer.',
    uncertain:
      'Nous n’avons pas pu confirmer si cette modification a été enregistrée.',
    stale:
      'Le dossier de ce Client a changé avant l’enregistrement de votre modification.',
    reload: 'Recharger les entités juridiques et succursales',
  },
  {
    code: 'en',
    title: 'Legal entities and branches',
    add: 'Add legal entity or branch',
    addTitle: 'Add a legal entity or branch',
    name: 'Exact legal name',
    tax: 'IDNO / tax code',
    address: 'Legal address',
    save: 'Save legal entity',
    cancel: 'Cancel',
    correct: 'Correct',
    required: 'Enter the exact legal name.',
    recorded: 'Legal entity or branch recorded.',
    corrected: 'Legal entity or branch corrected.',
    unchanged: 'Change at least one value before saving.',
    uncertain: 'We could not confirm whether this change was saved.',
    stale: 'This Client dossier changed before your change was saved.',
    reload: 'Reload legal entities and branches',
  },
] as const;

async function chooseLocale(
  page: Page,
  code: (typeof locales)[number]['code'],
) {
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
}

for (const locale of locales) {
  test(`keeps legal-entity drafts, exact retry and explicit stale recovery in ${locale.code}`, async ({
    page,
  }, testInfo) => {
    const state = await installDossierFixture(page);
    const longName = 'Organizație — Юридическое лицо {legalName} '.repeat(4);
    state.legalEntities = [
      {
        id: 'existing-long-entity',
        legalName: longName,
        taxId: null,
        legalAddress: 'Adresă {address}\nКорпус Б — '.repeat(12),
        createdAt: '2026-09-26T07:00:00.000Z',
      },
    ];
    const commands: {
      path: string;
      method: string;
      body: string | null;
      key: string | undefined;
      company: string | undefined;
    }[] = [];
    let allRequests = 0;
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/')) allRequests += 1;
    });
    await page.route(
      (url) =>
        url.pathname === '/api/clients/client-dossier/legal-entities' ||
        url.pathname.startsWith('/api/clients/client-dossier/legal-entities/'),
      async (route) => {
        const request = route.request();
        if (request.method() === 'GET') return route.fallback();
        commands.push({
          path: new URL(request.url()).pathname,
          method: request.method(),
          body: request.postData(),
          key: request.headers()['idempotency-key'],
          company: request.headers()['x-company-context-id'],
        });
        if (commands.length === 1)
          return route.fulfill({ status: 503, json: {} });
        return route.fallback();
      },
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openDossier(page);
    await expect(page.getByText(longName, { exact: true })).toBeVisible();
    const beforeLocale = allRequests;
    await chooseLocale(page, locale.code);
    expect(allRequests).toBe(beforeLocale);
    const section = page.getByRole('region', {
      name: locale.title,
      exact: true,
    });
    const add = section.getByRole('button', { name: locale.add, exact: true });
    await add.focus();
    await page.keyboard.press('Enter');
    const form = section.getByRole('form', {
      name: locale.addTitle,
      exact: true,
    });
    const name = form.getByLabel(locale.name, { exact: true });
    await expect(name).toBeFocused();
    await form.getByRole('button', { name: locale.save, exact: true }).click();
    await expect(name).toHaveAccessibleDescription(locale.required);
    const literalName = '  Филиал {legalName} — Știință și lumină  ';
    const literalAddress = '  Str. Științei {address}\nКорпус Б, etaj 2  ';
    await name.fill(literalName);
    await form
      .getByLabel(locale.tax, { exact: true })
      .fill('  Налог {taxId}  ');
    await form.getByLabel(locale.address, { exact: true }).fill(literalAddress);
    const originalName = await name.elementHandle();
    if (!originalName) throw new Error('Expected the mounted legal-name field');
    const readsBeforeDraftLocale = allRequests;
    await chooseLocale(page, locale.code === 'fr' ? 'ru' : 'fr');
    const translatedName = page
      .getByRole('form')
      .filter({ has: page.locator('.client-legal-entity-actions') })
      .getByRole('textbox')
      .first();
    expect(
      await translatedName.evaluate(
        (element, original) => element === original,
        originalName,
      ),
    ).toBe(true);
    await expect(translatedName).toHaveValue(literalName);
    await expect(
      page.locator('.client-legal-entity-form textarea'),
    ).toHaveValue(literalAddress);
    expect(allRequests).toBe(readsBeforeDraftLocale);
    await chooseLocale(page, locale.code);
    await form.getByRole('button', { name: locale.save, exact: true }).click();
    await expect(form.getByRole('alert')).toContainText(locale.uncertain);
    const beforeRetryLocale = allRequests;
    await chooseLocale(page, locale.code === 'fr' ? 'ru' : 'fr');
    await chooseLocale(page, locale.code);
    expect(allRequests).toBe(beforeRetryLocale);
    await form.getByRole('button', { name: locale.save, exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(
      section.getByText(locale.recorded, { exact: true }),
    ).toBeVisible();
    expect(commands).toHaveLength(2);
    expect(commands[1]).toEqual(commands[0]);
    expect(commands[0]).toEqual({
      path: '/api/clients/client-dossier/legal-entities',
      method: 'POST',
      body: '{"expectedClientVersion":1,"legalName":"Филиал {legalName} — Știință și lumină","taxId":"Налог {taxId}","legalAddress":"Str. Științei {address}\\nКорпус Б, etaj 2"}',
      key: expect.any(String),
      company: 'company-dossier',
    });
    expect(commands[0]?.key).toBeTruthy();
    const saved = state.legalEntities.find(
      (entity) => entity.legalName === literalName.trim(),
    );
    if (!saved) throw new Error('Expected the exact saved entity');
    const correct = section.getByRole('button', {
      name: `${locale.correct} ${saved.legalName}`,
      exact: true,
    });
    await correct.focus();
    await page.keyboard.press('Enter');
    const correction = section.getByRole('form', {
      name: `${locale.correct} ${saved.legalName}`,
      exact: true,
    });
    await expect(
      correction.getByLabel(locale.name, { exact: true }),
    ).toBeFocused();
    await correction
      .getByRole('button', { name: locale.save, exact: true })
      .click();
    await expect(correction.getByRole('alert')).toHaveText(locale.unchanged);
    expect(commands).toHaveLength(2);
    await correction.getByLabel(locale.tax, { exact: true }).fill('   ');
    const beforeCorrectLocale = allRequests;
    await chooseLocale(page, locale.code === 'fr' ? 'ru' : 'fr');
    await chooseLocale(page, locale.code);
    expect(allRequests).toBe(beforeCorrectLocale);
    await expect(
      correction.getByLabel(locale.tax, { exact: true }),
    ).toHaveValue('   ');
    await correction
      .getByRole('button', { name: locale.save, exact: true })
      .click();
    await expect(
      section.getByText(locale.corrected, { exact: true }),
    ).toBeVisible();
    expect(commands[2]).toMatchObject({
      path: `/api/clients/client-dossier/legal-entities/${saved.id}`,
      method: 'PATCH',
      body: '{"expectedClientVersion":2,"changes":{"taxId":null}}',
      company: 'company-dossier',
    });
    expect(commands[2]?.key).not.toBe(commands[0]?.key);
    await section.scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(
        `legal-entities-${locale.code}-saved-viewport.png`,
      ),
    });
    await page.screenshot({
      path: testInfo.outputPath(`legal-entities-${locale.code}-saved.png`),
      fullPage: true,
    });

    await correct.click();
    const staleForm = section.getByRole('form', {
      name: `${locale.correct} ${saved.legalName}`,
      exact: true,
    });
    state.dossier = { ...state.dossier, version: 4 };
    await staleForm
      .getByLabel(locale.address, { exact: true })
      .fill('Stale {черновик}\nEtaj 4');
    await staleForm
      .getByRole('button', { name: locale.save, exact: true })
      .click();
    await expect(staleForm.getByRole('alert')).toContainText(locale.stale);
    expect(commands[3]).toMatchObject({
      path: `/api/clients/client-dossier/legal-entities/${saved.id}`,
      body: '{"expectedClientVersion":3,"changes":{"legalAddress":"Stale {черновик}\\nEtaj 4"}}',
    });
    const beforeStaleLocale = allRequests;
    await chooseLocale(page, locale.code === 'fr' ? 'ru' : 'fr');
    await chooseLocale(page, locale.code);
    expect(allRequests).toBe(beforeStaleLocale);
    await expect(
      staleForm.getByLabel(locale.address, { exact: true }),
    ).toHaveValue('Stale {черновик}\nEtaj 4');
    await staleForm
      .getByRole('button', { name: locale.reload, exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(staleForm).toHaveCount(0);
    await correct.focus();
    await page.keyboard.press('Enter');
    const fresh = section.getByRole('form', {
      name: `${locale.correct} ${saved.legalName}`,
      exact: true,
    });
    await expect(fresh.getByLabel(locale.address, { exact: true })).toHaveValue(
      literalAddress.trim(),
    );
    await expect(fresh.getByLabel(locale.tax, { exact: true })).toHaveValue('');
    await fresh
      .getByLabel(locale.address, { exact: true })
      .fill('Reîncărcat {address}\nКорпус В');
    await fresh.getByRole('button', { name: locale.save, exact: true }).click();
    await expect(
      section.getByText(locale.corrected, { exact: true }),
    ).toBeVisible();
    expect(commands[4]).toMatchObject({
      path: `/api/clients/client-dossier/legal-entities/${saved.id}`,
      body: '{"expectedClientVersion":4,"changes":{"legalAddress":"Reîncărcat {address}\\nКорпус В"}}',
    });
    await page.reload();
    await page
      .locator('.client-directory-rows')
      .getByRole('button')
      .first()
      .click();
    const reopened = page.getByRole('region', {
      name: locale.title,
      exact: true,
    });
    await reopened
      .getByRole('button', {
        name: `${locale.correct} ${saved.legalName}`,
        exact: true,
      })
      .click();
    const reopenedForm = reopened.getByRole('form');
    await expect(
      reopenedForm.getByLabel(locale.name, { exact: true }),
    ).toHaveValue(saved.legalName);
    await expect(
      reopenedForm.getByLabel(locale.address, { exact: true }),
    ).toHaveValue('Reîncărcat {address}\nКорпус В');
    await expect(
      reopenedForm.getByLabel(locale.tax, { exact: true }),
    ).toHaveValue('');
    await reopenedForm
      .getByRole('button', { name: locale.cancel, exact: true })
      .click();
    expect(state.legalEntities.map((entity) => entity.id)).toEqual([
      'existing-long-entity',
      saved.id,
    ]);
    expect(commands).toHaveLength(5);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await reopened.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(
        `legal-entities-${locale.code}-reloaded-viewport.png`,
      ),
    });
    await page.screenshot({
      path: testInfo.outputPath(`legal-entities-${locale.code}-reloaded.png`),
      fullPage: true,
    });
  });
}
