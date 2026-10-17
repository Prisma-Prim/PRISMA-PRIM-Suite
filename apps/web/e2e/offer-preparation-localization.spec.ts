import { createHash } from 'node:crypto';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  actorContextFixture,
  operationalHomeFixture,
} from './actor-context.fixture';
import { selectOption } from './select-option';
import {
  buildClientRequest,
  requestListItemFor,
} from '../src/test/commercial-intake-responses';
import type { OfferView } from '../src/offer/offer-response';

const locales = [
  {
    code: 'ro',
    name: 'Română',
    language: 'Limba interfeței',
    title: 'Ofertă ilustrativă',
    snapshot: 'Instantaneu de preț',
    recipient: 'Destinatar juridic',
    validity: 'Valabilitate în zile',
    scope: 'Notă privind domeniul',
    conditions: 'Condiții comerciale',
    prepare: 'Pregătește versiunea 1',
    pending: 'Se pregătește…',
    retry: 'Reîncearcă aceeași pregătire',
    uncertain:
      'Rezultatul este incert. Reîncercarea trimite exact aceleași valori și aceeași cheie.',
    newVersion: 'Pregătește o versiune nouă',
    create: 'Creează o versiune nouă',
    openOne: 'Deschide versiunea 1',
    openTwo: 'Deschide versiunea 2',
    historical: 'Versiune istorică · doar citire',
    current: 'Versiunea curentă',
    differences: 'Diferențe față de versiunea precedentă',
    frame: 'Reprezentarea Ofertei ilustrative',
  },
  {
    code: 'ru',
    name: 'Русский',
    language: 'Язык интерфейса',
    title: 'Иллюстративная Оферта',
    snapshot: 'Снимок цены',
    recipient: 'Юридический получатель',
    validity: 'Срок действия в днях',
    scope: 'Примечание об области работ',
    conditions: 'Коммерческие условия',
    prepare: 'Подготовить версию 1',
    pending: 'Подготовка…',
    retry: 'Повторить ту же подготовку',
    uncertain:
      'Результат неизвестен. Повторная попытка отправит те же значения и тот же ключ.',
    newVersion: 'Подготовить новую версию',
    create: 'Создать новую версию',
    openOne: 'Открыть версию 1',
    openTwo: 'Открыть версию 2',
    historical: 'Историческая версия · только чтение',
    current: 'Текущая версия',
    differences: 'Отличия от предыдущей версии',
    frame: 'Представление иллюстративной Оферты',
  },
  {
    code: 'fr',
    name: 'Français',
    language: 'Langue de l’interface',
    title: 'Offre illustrative',
    snapshot: 'Instantané de tarification',
    recipient: 'Destinataire légal',
    validity: 'Validité en jours',
    scope: 'Note de périmètre',
    conditions: 'Conditions commerciales',
    prepare: 'Préparer la version 1',
    pending: 'Préparation…',
    retry: 'Réessayer la même préparation',
    uncertain:
      'Le résultat est incertain. Réessayer envoie exactement les mêmes valeurs et la même clé.',
    newVersion: 'Préparer une nouvelle version',
    create: 'Créer une nouvelle version',
    openOne: 'Ouvrir la version 1',
    openTwo: 'Ouvrir la version 2',
    historical: 'Version historique · lecture seule',
    current: 'Version actuelle',
    differences: 'Différences par rapport à la version précédente',
    frame: 'Représentation de l’Offre illustrative',
  },
  {
    code: 'en',
    name: 'English',
    language: 'Interface language',
    title: 'Illustrative Offer',
    snapshot: 'Pricing Snapshot',
    recipient: 'Legal recipient',
    validity: 'Validity in days',
    scope: 'Scope note',
    conditions: 'Commercial conditions',
    prepare: 'Prepare version 1',
    pending: 'Preparing…',
    retry: 'Retry the same preparation',
    uncertain:
      'The outcome is uncertain. Retry sends the exact same values and key.',
    newVersion: 'Prepare a new version',
    create: 'Create new version',
    openOne: 'Open version 1',
    openTwo: 'Open version 2',
    historical: 'Historical version · read only',
    current: 'Current version',
    differences: 'Differences from previous version',
    frame: 'Illustrative Offer representation',
  },
] as const;
type Locale = (typeof locales)[number];
const company = {
  id: '00000000-0000-4000-8000-000000000654',
  displayName: 'Company {original} / Компания',
};
const clientId = 'client-654';
const scope = '  Périmètre {literal} / Область  ';
const conditions = '  Conditions {exactes} / Условия\nDeuxième ligne  ';
const successorConditions = '  Conditions {successor} / Новые условия  ';
const recipient = 'Entité {originale} / Юрлицо';
const snapshots = [
  {
    id: 'snapshot-one',
    total: '345.00',
    currency: 'EUR',
    committedAt: '2026-09-27T09:00:00.000Z',
  },
  {
    id: 'snapshot-two',
    total: '900719925474099312345.6700',
    currency: 'EUR',
    committedAt: '2026-09-28T09:00:00.000Z',
  },
];
const html =
  '<!doctype html><html lang="en"><body>Frozen {Offer} / Документ</body></html>';
const checksum = createHash('sha256').update(html).digest('hex');

function savedVersion(number: 1 | 2): OfferView {
  const snapshot = snapshots[1];
  if (!snapshot) throw new Error('Expected the exact synthetic Snapshot.');
  return {
    id: 'offer-654',
    illustrativeReference: 7,
    revision: number,
    version: {
      id: `version-${number}`,
      versionNumber: number,
      predecessorVersionId: number === 1 ? null : 'version-1',
      supersededByVersionId: null,
      supersededAt: null,
      qualityRuleSet: 'OFFER_QUALITY_ILLUSTRATIVE',
      qualityRuleSetVersion: 1,
      latestQualityRun: null,
      pricingSnapshotId: snapshot.id,
      pricingSnapshot: snapshot,
      recipient: {
        kind: 'ADDITIONAL',
        additionalLegalEntityId: 'entity-654',
        legalName: recipient,
        taxId: '000654',
        legalAddress: 'Adresse {originale} / Адрес',
      },
      issuingCompanyLabel: company.displayName,
      validityDays: 45,
      validityElapsed: false,
      validUntil: '2026-11-12T09:00:00.000Z',
      scopeNote: scope,
      commercialConditions: number === 1 ? conditions : successorConditions,
      decisionState: 'PENDING',
      decision: null,
      transmissionState: 'NOT_TRANSMITTED',
      transmission: null,
      clientResponseState: 'NONE',
      clientResponse: null,
      provenance: 'ILLUSTRATIVE',
      provisional: true,
      representation: {
        templateCode: 'OFFER_ILLUSTRATIVE',
        templateVersion: 1,
        html,
        sha256: checksum,
      },
      differences:
        number === 1
          ? []
          : [
              {
                field: 'commercialConditions',
                previous: conditions,
                current: successorConditions,
                changed: true,
              },
            ],
    },
  };
}

type Command = {
  path: string;
  body: string | null;
  key: string | undefined;
  companyId: string | undefined;
};
async function installRoutes(page: Page) {
  const savedRequest = buildClientRequest({
    companyId: company.id,
    subject: 'Offer {source} / Источник',
    originalText: 'Original {request} / Заявка',
    clientAssociationStatus: 'visible',
    clientReference: {
      originalClientId: clientId,
      currentClientId: clientId,
      displayName: 'Client {original} / Клиент',
    },
  });
  const commands: Command[] = [];
  const reads: string[] = [];
  let head: OfferView | null = null;
  let predecessor: OfferView | undefined;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET') reads.push(request.url());
    if (path === '/api/access/current-actor')
      return route.fulfill({
        json: {
          ...actorContextFixture,
          workspacePermissions: [],
          ...(request.headers()['x-company-context-id'] === company.id
            ? {
                activeCompany: {
                  ...company,
                  clientPermissionAssignmentId: 'client-reader-654',
                  clientPermissionSetVersion: 'v1',
                  clientPermissions: [
                    'client.read',
                    'client.create',
                    'client.update',
                  ],
                  commercialIntakePermissionAssignmentId: 'intake-reader-654',
                  commercialIntakePermissionSetVersion: 'v1',
                  commercialIntakePermissions: [
                    'commercial.request.read',
                    'commercial.request.create',
                    'commercial.opportunity.read',
                    'commercial.opportunity.create',
                  ],
                  offerPermissionAssignmentId: 'offer-preparer-654',
                  offerPermissionSetVersion: 'v1',
                  offerPermissions: [
                    'commercial.offer.read',
                    'commercial.offer.prepare',
                    'commercial.offer.transmission.record',
                    'commercial.pricing.snapshot.read',
                  ],
                },
              }
            : {}),
        },
      });
    if (path === '/api/companies') return route.fulfill({ json: [company] });
    if (path === '/api/operational-home')
      return route.fulfill({
        json: operationalHomeFixture(company.id, { active_clients: 1 }),
      });
    if (path === '/api/activity-log')
      return route.fulfill({ json: { events: [] } });
    if (path === '/api/clients')
      return route.fulfill({ json: { clients: [], nextCursor: null } });
    if (path === '/api/commercial-intake/requests')
      return route.fulfill({
        json: { items: [requestListItemFor(savedRequest)] },
      });
    if (path === '/api/commercial-intake/requests/request-1')
      return route.fulfill({ json: savedRequest });
    if (path === `/api/clients/${clientId}/legal-entities`)
      return route.fulfill({
        json: {
          clientVersion: 1,
          legalEntities: [
            {
              id: 'entity-654',
              legalName: recipient,
              taxId: '000654',
              legalAddress: 'Adresse {originale} / Адрес',
              createdAt: '2026-09-27T09:00:00.000Z',
            },
          ],
        },
      });
    if (path === '/api/pricing/opportunities/opportunity-1/snapshots')
      return route.fulfill({ json: { items: snapshots } });
    const base = '/api/offers/opportunities/opportunity-1';
    if (
      (path === base || path === `${base}/versions`) &&
      request.method() === 'POST'
    ) {
      commands.push({
        path,
        body: request.postData(),
        key: request.headers()['idempotency-key'],
        companyId: request.headers()['x-company-context-id'],
      });
      if (commands.length === 1) {
        await gate;
        return route.fulfill({ status: 503 });
      }
      if (path === base) head = savedVersion(1);
      else {
        const old = savedVersion(1);
        predecessor = {
          ...old,
          revision: 2,
          version: {
            ...old.version,
            supersededByVersionId: 'version-2',
            supersededAt: '2026-09-29T09:00:00.000Z',
          },
        };
        head = savedVersion(2);
      }
      return route.fulfill({ status: 201, json: head });
    }
    if (path === base) return route.fulfill({ json: { offer: head } });
    if (path === `${base}/versions`)
      return route.fulfill({
        json: {
          versions: head
            ? [head, ...(predecessor ? [predecessor] : [])].map((offer) => ({
                id: offer.version.id,
                versionNumber: offer.version.versionNumber,
                createdAt:
                  offer.version.versionNumber === 1
                    ? '2026-09-28T09:00:00.000Z'
                    : '2026-09-29T09:00:00.000Z',
                supersededByVersionId: offer.version.supersededByVersionId,
              }))
            : [],
          nextCursor: null,
        },
      });
    if (path === `${base}/versions/version-1`)
      return route.fulfill({ json: { offer: predecessor } });
    if (path === `${base}/versions/version-2`)
      return route.fulfill({ json: { offer: head } });
    return route.fulfill({ status: 404 });
  });
  return {
    commands,
    reads,
    release: () => {
      if (!release) throw new Error('Expected held preparation.');
      release();
    },
  };
}

async function chooseLanguage(page: Page, current: Locale, next: Locale) {
  const control = page.getByRole('combobox', {
    name: current.language,
    exact: true,
  });
  await control.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Home');
  const index = locales.findIndex((locale) => locale.code === next.code);
  for (let position = 0; position < index; position += 1)
    await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('combobox', { name: next.language, exact: true }),
  ).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('lang', next.code);
}

async function evidence(
  page: Page,
  info: TestInfo,
  name: string,
  representationTitle?: string,
) {
  if (representationTitle !== undefined) {
    const representation = page.getByTitle(representationTitle, {
      exact: true,
    });
    await representation.scrollIntoViewIfNeeded();
    await expect(
      representation
        .contentFrame()
        .getByText('Frozen {Offer} / Документ', { exact: true }),
    ).toBeVisible();
  }
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(dimensions.document, JSON.stringify(dimensions)).toBeLessThanOrEqual(
    dimensions.viewport,
  );
  await page.screenshot({
    path: info.outputPath(`offer-${name}-${info.project.name}.png`),
    fullPage: true,
  });
}

for (const locale of locales) {
  test(`prepares, recovers and reopens exact Offer Versions in ${locale.code}`, async ({
    page,
  }, info) => {
    test.setTimeout(90_000);
    const observed = await installRoutes(page);
    await page.goto('/');
    if (info.project.name === 'narrow')
      await page
        .getByRole('button', { name: 'Open navigation', exact: true })
        .click();
    await selectOption(
      page.getByRole('combobox', { name: 'Active Company', exact: true }),
      { value: company.id },
    );
    await page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name: 'Client Requests', exact: true })
      .click();
    await page
      .locator('.commercial-intake-workspace')
      .getByRole('button')
      .filter({
        has: page.getByText('Offer {source} / Источник', { exact: true }),
      })
      .click();
    const offer = page.locator('.offer-panel');
    await expect(
      offer.getByRole('button', { name: 'Prepare version 1', exact: true }),
    ).toBeVisible();
    await selectOption(
      offer.getByRole('combobox', { name: 'Pricing Snapshot', exact: true }),
      { value: 'snapshot-two' },
    );
    await selectOption(
      offer.getByRole('combobox', { name: 'Legal recipient', exact: true }),
      { value: 'entity-654' },
    );
    await offer.getByLabel('Validity in days', { exact: true }).fill('45');
    await offer
      .getByRole('textbox', { name: 'Scope note', exact: true })
      .fill(scope);
    await offer
      .getByRole('textbox', { name: 'Commercial conditions', exact: true })
      .fill(conditions);
    const draftReadCount = observed.reads.length;
    await chooseLanguage(page, locales[3], locale);
    await expect(
      offer.getByRole('heading', { name: locale.title, exact: true }),
    ).toBeVisible();
    await expect(
      offer.getByRole('textbox', { name: locale.scope, exact: true }),
    ).toHaveValue(scope);
    await expect(
      offer.getByRole('textbox', { name: locale.conditions, exact: true }),
    ).toHaveValue(conditions);
    await expect(
      offer.getByRole('combobox', { name: locale.snapshot, exact: true }),
    ).toHaveAttribute('data-value', 'snapshot-two');
    await expect(
      offer.getByRole('combobox', { name: locale.recipient, exact: true }),
    ).toHaveAttribute('data-value', 'entity-654');
    expect(observed.reads).toHaveLength(draftReadCount);
    expect(observed.commands).toHaveLength(0);
    await evidence(page, info, `${locale.code}-draft`);
    await offer
      .getByRole('button', { name: locale.prepare, exact: true })
      .click();
    await expect.poll(() => observed.commands.length).toBe(1);
    const expectedInitial = JSON.stringify({
      pricingSnapshotId: 'snapshot-two',
      recipient: { kind: 'ADDITIONAL', legalEntityId: 'entity-654' },
      validityDays: 45,
      scopeNote: scope,
      commercialConditions: conditions,
    });
    expect(observed.commands[0]).toMatchObject({
      body: expectedInitial,
      companyId: company.id,
      path: '/api/offers/opportunities/opportunity-1',
    });
    expect(observed.commands[0]?.key).toBeTruthy();
    const alternate = locale.code === 'en' ? locales[0] : locales[3];
    await chooseLanguage(page, locale, alternate);
    await expect(
      offer.getByRole('button', { name: alternate.pending, exact: true }),
    ).toBeDisabled();
    await expect(
      offer.getByRole('textbox', { name: alternate.conditions, exact: true }),
    ).toHaveValue(conditions);
    expect(observed.commands).toHaveLength(1);
    expect(observed.reads).toHaveLength(draftReadCount);
    observed.release();
    await expect(offer.getByRole('alert')).toHaveText(alternate.uncertain);
    await chooseLanguage(page, alternate, locale);
    await expect(offer.getByRole('alert')).toHaveText(locale.uncertain);
    await expect(
      offer.getByRole('textbox', { name: locale.conditions, exact: true }),
    ).toBeDisabled();
    expect(observed.reads).toHaveLength(draftReadCount);
    await evidence(page, info, `${locale.code}-uncertain`);
    await offer
      .getByRole('button', { name: locale.retry, exact: true })
      .click();
    await expect(
      offer.getByRole('button', { name: locale.openOne, exact: true }),
    ).toBeDisabled();
    await expect(
      offer.getByText(locale.current, { exact: true }),
    ).toBeVisible();
    expect(observed.commands).toHaveLength(2);
    expect(observed.commands[1]).toEqual(observed.commands[0]);
    await expect(offer.getByTitle(locale.frame)).toHaveAttribute(
      'srcdoc',
      html,
    );
    await expect(
      offer
        .locator('.offer-representation')
        .getByText(checksum, { exact: true }),
    ).toBeVisible();
    await offer
      .getByRole('button', { name: locale.newVersion, exact: true })
      .click();
    await expect(
      offer.getByRole('textbox', { name: locale.conditions, exact: true }),
    ).toHaveValue(conditions);
    await expect(
      offer.getByRole('textbox', { name: locale.scope, exact: true }),
    ).toHaveValue(scope);
    await expect(
      offer.getByLabel(locale.validity, { exact: true }),
    ).toHaveValue('45');
    await offer
      .getByRole('textbox', { name: locale.conditions, exact: true })
      .fill(successorConditions);
    await offer
      .getByRole('button', { name: locale.create, exact: true })
      .click();
    await expect(
      offer.getByRole('button', { name: locale.openOne, exact: true }),
    ).toBeEnabled();
    await expect(
      offer.getByRole('button', { name: locale.openTwo, exact: true }),
    ).toBeDisabled();
    await expect(
      offer.getByText(locale.current, { exact: true }),
    ).toBeVisible();
    expect(observed.commands).toHaveLength(3);
    expect(observed.commands[2]).toMatchObject({
      body: JSON.stringify({
        expectedOfferRevision: 1,
        pricingSnapshotId: 'snapshot-two',
        recipient: { kind: 'ADDITIONAL', legalEntityId: 'entity-654' },
        validityDays: 45,
        scopeNote: scope,
        commercialConditions: successorConditions,
      }),
      companyId: company.id,
      path: '/api/offers/opportunities/opportunity-1/versions',
    });
    expect(observed.commands[2]?.key).toBeTruthy();
    expect(observed.commands[2]?.key).not.toBe(observed.commands[0]?.key);
    await expect(
      offer.getByRole('heading', { name: locale.differences, exact: true }),
    ).toBeVisible();
    await expect(offer.locator('.offer-version-history')).toContainText(
      successorConditions.trim(),
    );
    await evidence(page, info, `${locale.code}-successor`, locale.frame);
    await offer
      .getByRole('button', { name: locale.openOne, exact: true })
      .click();
    await expect(
      offer.getByText(locale.historical, { exact: true }),
    ).toBeVisible();
    await expect(
      offer.getByRole('button', { name: locale.openTwo, exact: true }),
    ).toBeEnabled();
    await expect(
      offer.getByRole('button', { name: locale.openOne, exact: true }),
    ).toBeDisabled();
    await expect(
      offer.getByRole('button', { name: locale.newVersion, exact: true }),
    ).toHaveCount(0);
    await expect(offer.getByTitle(locale.frame)).toHaveAttribute(
      'srcdoc',
      html,
    );
    await expect(offer.locator('.offer-summary')).toContainText(
      conditions.trim(),
    );
    const historicalReadCount = observed.reads.length;
    await chooseLanguage(page, locale, alternate);
    await expect(
      offer.getByText(alternate.historical, { exact: true }),
    ).toBeVisible();
    await expect(
      offer.getByRole('button', { name: alternate.openOne, exact: true }),
    ).toBeDisabled();
    await expect(offer.getByTitle(alternate.frame)).toHaveAttribute(
      'srcdoc',
      html,
    );
    await chooseLanguage(page, alternate, locale);
    expect(observed.reads).toHaveLength(historicalReadCount);
    expect(observed.commands).toHaveLength(3);
    await evidence(page, info, `${locale.code}-historical`, locale.frame);
  });
}
