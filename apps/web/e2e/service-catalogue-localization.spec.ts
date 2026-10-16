import { expect, test, type Page } from '@playwright/test';
import { actorContextFixture } from './actor-context.fixture';
import { selectOption } from './select-option';
const locales = [
  {
    code: 'ro',
    title: 'Catalogul serviciilor',
    codeLabel: 'Codul serviciului',
    name: 'Denumirea serviciului',
    description: 'Descriere',
    define: 'Definește serviciul',
    label: 'Denumire comercială',
    selected: 'Definiția serviciului',
    offer: 'Înregistrează oferta de serviciu',
    error: 'Catalogul nu a putut fi încărcat sau salvat. Reîncercați.',
    created: 'Definiția serviciului ORIGINAL-637 a fost înregistrată.',
    offered:
      'Oferta pentru Serviciu {name} / Услуга a fost înregistrată ca disponibilă.',
  },
  {
    code: 'ru',
    title: 'Каталог услуг',
    codeLabel: 'Код услуги',
    name: 'Название услуги',
    description: 'Описание',
    define: 'Определить услугу',
    label: 'Коммерческое название',
    selected: 'Определение услуги',
    offer: 'Зарегистрировать предложение услуги',
    error: 'Не удалось загрузить или сохранить каталог. Повторите попытку.',
    created: 'Определение услуги ORIGINAL-637 зарегистрировано.',
    offered:
      'Предложение для Serviciu {name} / Услуга зарегистрировано как доступное.',
  },
  {
    code: 'fr',
    title: 'Catalogue des services',
    codeLabel: 'Code du service',
    name: 'Nom du service',
    description: 'Description',
    define: 'Définir le service',
    label: 'Libellé commercial',
    selected: 'Définition de service',
    offer: 'Enregistrer la prestation',
    error: 'Le catalogue n’a pas pu être chargé ou enregistré. Réessayez.',
    created: 'Définition de service ORIGINAL-637 enregistrée.',
    offered:
      'Prestation pour Serviciu {name} / Услуга enregistrée comme disponible.',
  },
  {
    code: 'en',
    title: 'Service Catalogue',
    codeLabel: 'Service code',
    name: 'Service name',
    description: 'Description',
    define: 'Define Service',
    label: 'Commercial label',
    selected: 'Service Definition',
    offer: 'Record offering',
    error: 'The catalogue could not be loaded or saved. Please try again.',
    created: 'Service Definition ORIGINAL-637 recorded.',
    offered: 'Offering for Serviciu {name} / Услуга recorded as available.',
  },
] as const;

const company = {
  id: '00000000-0000-4000-8000-000000000637',
  workspaceId: actorContextFixture.workspaceId,
  displayName: 'Companie {originală}',
  status: 'active',
  createdAt: '2026-10-16T10:00:00.000Z',
};
const definition = {
  id: 'definition-637',
  code: 'ORIGINAL-637',
  name: 'Serviciu {name} / Услуга',
  description: 'Dovadă {code} / Доказательство',
  provenance: 'ILLUSTRATIVE',
  provisional: true,
  createdByWorkspaceMembershipId: actorContextFixture.workspaceMembershipId,
  createdAt: '2026-10-16T10:00:00.000Z',
};
const offering = {
  id: 'offering-637',
  companyId: company.id,
  serviceDefinitionId: definition.id,
  serviceDefinition: { code: definition.code, name: definition.name },
  commercialLabel: 'Etichetă {name} / Название',
  availability: 'AVAILABLE',
  provenance: 'ILLUSTRATIVE',
  provisional: true,
  createdByWorkspaceMembershipId: actorContextFixture.workspaceMembershipId,
  createdAt: '2026-10-16T10:05:00.000Z',
};
type Command = {
  body: string | null;
  key: string | undefined;
  companyId: string | undefined;
};

async function installRoutes(page: Page) {
  const definitions: Command[] = [];
  const offerings: Command[] = [];
  const catalogueReads: string[] = [];
  let definitionSaved = false;
  let offeringSaved = false;
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
                  serviceCataloguePermissionAssignmentId:
                    'catalogue-assignment-637',
                  serviceCataloguePermissionSetVersion: 'v1',
                  serviceCataloguePermissions: [
                    'service.definition.read',
                    'service.definition.create',
                    'commercial.offering.read',
                    'commercial.offering.manage',
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
    if (url.pathname.startsWith('/api/commercial-catalogue/')) {
      const isDefinition = url.pathname.endsWith('/service-definitions');
      if (request.method() === 'POST') {
        const commands = isDefinition ? definitions : offerings;
        commands.push({
          body: request.postData(),
          key: request.headers()['idempotency-key'],
          companyId: request.headers()['x-company-context-id'],
        });
        if (commands.length === 1) return route.fulfill({ status: 503 });
        if (isDefinition) definitionSaved = true;
        else offeringSaved = true;
        return route.fulfill({
          status: 201,
          json: isDefinition
            ? { outcome: 'CREATED', definition }
            : { outcome: 'CREATED', offering },
        });
      }
      catalogueReads.push(url.pathname + url.search);
      return route.fulfill({
        json: {
          items: isDefinition
            ? definitionSaved
              ? [definition]
              : []
            : offeringSaved
              ? [offering]
              : [],
        },
      });
    }
    return route.fulfill({ status: 404 });
  });
  return { definitions, offerings, catalogueReads };
}

async function chooseLocale(page: Page, name: string) {
  const control = page.getByRole('combobox', {
    name: /^(Limba interfeței|Язык интерфейса|Langue de l’interface|Interface language)$/u,
  });
  const optionIndex = Object.values(languageNames).indexOf(name);
  if (optionIndex < 0) throw new Error(`Unsupported test language: ${name}`);
  await control.press('Home');
  for (let index = 0; index < optionIndex; index += 1)
    await control.press('ArrowDown');
  await control.press('Enter');
  await expect(control).toHaveAttribute('title', name);
}
const languageNames = {
  ro: 'Română',
  ru: 'Русский',
  fr: 'Français',
  en: 'English',
};

for (const locale of locales) {
  test(`defines and reopens original Service Catalogue records in ${locale.code} with exact retries`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const calls = await installRoutes(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    if (testInfo.project.name === 'narrow')
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await selectOption(page.getByLabel('Active Company', { exact: true }), {
      label: company.displayName,
    });
    await page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name: 'Service Catalogue', exact: true })
      .click();
    await chooseLocale(page, languageNames[locale.code]);
    const catalogue = page.locator('.service-catalogue');
    await expect(
      catalogue.getByRole('heading', { name: locale.title, exact: true }),
    ).toBeVisible();
    await expect.poll(() => calls.catalogueReads.length).toBe(2);
    await expect(catalogue.locator('.service-catalogue-notice')).toContainText(
      {
        ro: 'Catalog ilustrativ: înregistrări provizorii',
        ru: 'Иллюстративный каталог: предварительные записи',
        fr: 'Catalogue illustratif : enregistrements provisoires',
        en: 'Illustrative catalogue: provisional records',
      }[locale.code],
    );
    await expect(catalogue.locator('header')).toContainText(
      company.displayName,
    );
    await catalogue
      .getByLabel(locale.codeLabel, { exact: true })
      .fill(definition.code);
    await catalogue
      .getByLabel(locale.name, { exact: true })
      .fill(definition.name);
    await catalogue
      .getByLabel(locale.description, { exact: true })
      .fill(definition.description);
    const alternate = locale.code === 'en' ? locales[0] : locales[3];
    await chooseLocale(page, languageNames[alternate.code]);
    await expect(
      catalogue.getByLabel(alternate.codeLabel, { exact: true }),
    ).toHaveValue(definition.code);
    await expect(
      catalogue.getByLabel(alternate.name, { exact: true }),
    ).toHaveValue(definition.name);
    await expect(
      catalogue.getByLabel(alternate.description, { exact: true }),
    ).toHaveValue(definition.description);
    expect(calls.catalogueReads).toHaveLength(2);
    expect(calls.definitions).toHaveLength(0);
    await catalogue
      .getByRole('button', { name: alternate.define, exact: true })
      .click();
    await expect(catalogue.getByRole('alert')).toHaveText(alternate.error);
    await chooseLocale(page, languageNames[locale.code]);
    await expect(catalogue.getByRole('alert')).toHaveText(locale.error);
    expect(calls.definitions).toHaveLength(1);
    await catalogue
      .getByRole('button', { name: locale.define, exact: true })
      .click();
    await expect(
      catalogue.getByText(locale.created, { exact: true }),
    ).toBeVisible();
    expect(calls.definitions).toHaveLength(2);
    expect(calls.definitions[1]).toEqual(calls.definitions[0]);
    expect(calls.definitions[0]).toEqual({
      body: JSON.stringify({
        code: definition.code,
        name: definition.name,
        description: definition.description,
      }),
      key: expect.any(String),
      companyId: company.id,
    });
    expect(calls.definitions[0]?.key).toBeTruthy();
    await expect(
      catalogue.getByLabel(locale.selected, { exact: true }),
    ).toContainText(definition.name);
    await catalogue
      .getByLabel(locale.label, { exact: true })
      .fill(offering.commercialLabel);
    const readCount = calls.catalogueReads.length;
    await chooseLocale(page, languageNames[alternate.code]);
    await expect(
      catalogue.getByText(alternate.created, { exact: true }),
    ).toBeVisible();
    await expect(
      catalogue.getByLabel(alternate.selected, { exact: true }),
    ).toContainText(definition.name);
    await expect(
      catalogue.getByLabel(alternate.label, { exact: true }),
    ).toHaveValue(offering.commercialLabel);
    expect(calls.catalogueReads).toHaveLength(readCount);
    expect(calls.offerings).toHaveLength(0);
    await catalogue
      .getByRole('button', { name: alternate.offer, exact: true })
      .click();
    await expect(catalogue.getByRole('alert')).toHaveText(alternate.error);
    await chooseLocale(page, languageNames[locale.code]);
    await expect(catalogue.getByRole('alert')).toHaveText(locale.error);
    expect(calls.offerings).toHaveLength(1);
    await catalogue
      .getByRole('button', { name: locale.offer, exact: true })
      .click();
    await expect(
      catalogue.getByText(locale.offered, { exact: true }),
    ).toBeVisible();
    expect(calls.offerings).toHaveLength(2);
    expect(calls.offerings[1]).toEqual(calls.offerings[0]);
    expect(calls.offerings[0]).toEqual({
      body: JSON.stringify({
        serviceDefinitionId: definition.id,
        commercialLabel: offering.commercialLabel,
      }),
      key: expect.any(String),
      companyId: company.id,
    });
    expect(calls.offerings[0]?.key).toBeTruthy();
    expect(calls.offerings[0]?.key).not.toBe(calls.definitions[0]?.key);
    await expect(
      catalogue.getByText(offering.commercialLabel, { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      catalogue.getByRole('heading', { name: locale.title, exact: true }),
    ).toBeVisible();
    await expect(
      catalogue.getByText(offering.commercialLabel, { exact: true }),
    ).toBeVisible();
    await expect(
      catalogue.getByText(definition.description, { exact: true }),
    ).toBeVisible();
    await expect(
      catalogue.getByText(definition.name, { exact: true }),
    ).toHaveCount(2);
    expect(calls.definitions).toHaveLength(2);
    expect(calls.offerings).toHaveLength(2);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    );
    expect(overflow).toBe(false);
    await page.screenshot({
      path: testInfo.outputPath(
        `catalogue-${locale.code}-${testInfo.project.name}.png`,
      ),
      fullPage: true,
    });
  });
}
