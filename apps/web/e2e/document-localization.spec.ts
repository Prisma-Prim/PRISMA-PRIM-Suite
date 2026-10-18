import {
  expect,
  test,
  type Page,
  type Request,
  type TestInfo,
} from '@playwright/test';
import type { ActorContext } from '../src/access-types';
import { documentsMessages } from '../src/documents/documents.copy';
import { documentVersionsMessages } from '../src/documents/document-versions.copy';
import { documentCorrectionHistoryMessages } from '../src/documents/document-correction-history.copy';
import { documentPdfMessages } from '../src/documents/document-pdf.copy';
import {
  interfaceLocales,
  interfaceLocaleStorageKey,
  type InterfaceLocale,
} from '../src/localization/interface-locale';
import { interfaceLocaleMessages } from '../src/localization/interface-locale.copy';
import { resolveMessage } from '../src/localization/messages';
import { preferenceKey } from '../src/production-shell/company-context-preference';
import {
  actorContextFixture,
  operationalHomeFixture,
} from './actor-context.fixture';
import { selectOption } from './select-option';

const company = {
  id: 'company-document-locale',
  displayName: 'Companie {company} Ș Я é',
  clientPermissions: ['client.read'],
  documentPermissions: [
    'document.read',
    'document.register',
    'document.reference.read',
    'document.correct',
    'document.version.manage',
    'document.version.designate_official',
  ],
  documentPermissionSetVersion: 'v3',
  documentApproverAssignmentId: 'approver-document-locale',
} satisfies NonNullable<ActorContext['activeCompany']>;
const client = {
  id: 'client-document-locale',
  displayName: 'Client {client} Ș Я é',
};
const literal = {
  title: 'Questionnaire {title} Ș Я é',
  purpose: 'Purpose {purpose} fr ≠ Document language',
  url: 'https://example.test/questionnaire?language=en',
  draftTitle: 'Literal draft {title} Ș Я é',
  draftPurpose: 'Literal draft {purpose} Ш à',
  draftUrl: 'https://example.test/draft?language=ru',
  correctedTitle: 'Corrected {title} Ș Я é',
  correctedPurpose: 'Corrected {purpose} Ш à',
  correctedUrl: 'https://example.test/corrected?language=fr',
  beforeTitle: 'Historical {title} Я à',
  olderPurpose: 'Older historical {purpose} Ș Я é',
  priorUrl: 'https://example.test/prior?language=en',
  actor: 'Actor {actor} Ș Я é',
};
const at = '2026-09-23T08:00:00.000Z';
const doc = (
  locale: InterfaceLocale,
  key: (typeof documentsMessages.keys)[number],
) => resolveMessage(documentsMessages, locale, key);
const version = (
  locale: InterfaceLocale,
  key: (typeof documentVersionsMessages.keys)[number],
) => resolveMessage(documentVersionsMessages, locale, key);
const history = (
  locale: InterfaceLocale,
  key: (typeof documentCorrectionHistoryMessages.keys)[number],
) => resolveMessage(documentCorrectionHistoryMessages, locale, key);
const languageLabel = (locale: InterfaceLocale) =>
  resolveMessage(interfaceLocaleMessages, locale, 'label');

async function chooseLanguage({
  page,
  current,
  next,
}: {
  page: Page;
  current: InterfaceLocale;
  next: InterfaceLocale;
}) {
  const control = page.getByRole('combobox', {
    name: languageLabel(current),
    exact: true,
  });
  await control.focus();
  await control.press('Enter');
  await expect(page.getByRole('listbox')).toBeVisible();
  await control.press('Home');
  for (let index = 0; index < interfaceLocales.indexOf(next); index += 1)
    await control.press('ArrowDown');
  await control.press('Enter');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(
    page.getByRole('combobox', { name: languageLabel(next), exact: true }),
  ).toBeFocused();
}

async function capture(page: Page, testInfo: TestInfo, name: string) {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error('A registered viewport is required');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(viewport.width);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath(name), fullPage: true });
}

async function installRoutes(page: Page) {
  let phase: 'draft' | 'corrected' | 'designated' = 'draft';
  let patchCount = 0;
  let finishUncertain: (() => void) | undefined;
  let announceCorrection: (() => void) | undefined;
  const uncertainGate = new Promise<void>((resolve) => {
    finishUncertain = resolve;
  });
  const firstCorrection = new Promise<void>((resolve) => {
    announceCorrection = resolve;
  });
  const calls: Array<{
    method: string;
    path: string;
    body: string | null;
    key: string | undefined;
    company: string | undefined;
  }> = [];
  const inFlight = new Set<Request>();
  page.on('request', (request) => {
    if (request.url().includes('/api/')) inFlight.add(request);
  });
  page.on('requestfinished', (request) => inFlight.delete(request));
  page.on('requestfailed', (request) => inFlight.delete(request));
  const reference = (number: number) => ({
    id: `reference-${number}`,
    kind: 'external-reference',
    verification: 'unverified',
    position: 1,
    form: 'other',
    primary: true,
    appendedAfterDesignation: false,
    addedAt: at,
    addedBy: { displayName: literal.actor },
    access: 'granted',
    url:
      number === 3
        ? phase === 'draft'
          ? literal.url
          : literal.correctedUrl
        : `https://example.test/version-${number}?language=en`,
  });
  const currentDocument = () => ({
    id: 'document-locale',
    companyId: company.id,
    clientId: client.id,
    clientDisplayName: client.displayName,
    title: phase === 'draft' ? literal.title : literal.correctedTitle,
    purpose: phase === 'draft' ? literal.purpose : literal.correctedPurpose,
    type: 'questionnaire',
    confidentiality: 'company-confidential',
    createdAt: at,
    workingRevision: phase === 'draft' ? 8 : phase === 'corrected' ? 9 : 10,
    correction: phase === 'designated' ? 'read-only' : 'allowed',
    version: {
      id: 'version-3',
      status: phase === 'designated' ? 'official' : 'draft',
      representation: reference(3),
    },
  });
  const versionRow = (number: number) => ({
    id: `version-${number}`,
    number,
    createdAt: at,
    createdBy: { displayName: literal.actor },
    representations: [reference(number)],
    pdfContent:
      number === 2
        ? { state: 'stored', access: 'denied' }
        : { state: 'absent' },
    ...(number === 3 && phase !== 'designated'
      ? { status: 'draft' }
      : {
          status:
            number === 1 || (number === 2 && phase === 'designated')
              ? 'superseded'
              : 'official',
          designatedAt: at,
          designatedBy: { displayName: 'Approver {literal} Я' },
          frozen: {
            title:
              number === 3
                ? literal.correctedTitle
                : `Frozen title ${number} {literal} Я`,
            purpose:
              number === 3
                ? literal.correctedPurpose
                : `Frozen purpose ${number} {literal} Ș`,
          },
          ...(number === 1 || (number === 2 && phase === 'designated')
            ? { supersededAt: at, supersededByVersionNumber: number + 1 }
            : {}),
        }),
  });
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    calls.push({
      method: request.method(),
      path: path + url.search,
      body: request.postData(),
      key: request.headers()['idempotency-key'],
      company: request.headers()['x-company-context-id'],
    });
    if (path.endsWith('/access/current-actor'))
      return route.fulfill({
        json: {
          ...actorContextFixture,
          workspacePermissions: [],
          ...(request.headers()['x-company-context-id'] === company.id
            ? { activeCompany: company }
            : {}),
        },
      });
    if (path.endsWith('/companies'))
      return route.fulfill({
        json: [{ id: company.id, displayName: company.displayName }],
      });
    if (path.endsWith('/operational-home'))
      return route.fulfill({
        json: operationalHomeFixture(company.id, { active_clients: 1 }),
      });
    if (path.endsWith('/activity-log'))
      return route.fulfill({ json: { events: [] } });
    if (path.endsWith('/clients')) return route.fulfill({ json: [client] });
    if (path.endsWith('/correction-history'))
      return route.fulfill({
        json: url.searchParams.has('beforeRevision')
          ? {
              corrections: [
                {
                  revision: 7,
                  occurredAt: at,
                  actor: { displayName: literal.actor },
                  changes: {
                    purpose: {
                      before: literal.olderPurpose,
                      after: literal.purpose,
                    },
                  },
                },
              ],
              nextBeforeRevision: null,
            }
          : {
              corrections: [
                ...(phase === 'draft'
                  ? []
                  : [
                      {
                        revision: 9,
                        occurredAt: at,
                        actor: { displayName: literal.actor },
                        changes: {
                          title: {
                            before: literal.title,
                            after: literal.correctedTitle,
                          },
                          url: {
                            before: literal.url,
                            after: literal.correctedUrl,
                          },
                        },
                      },
                    ]),
                {
                  revision: 8,
                  occurredAt: at,
                  actor: { displayName: literal.actor },
                  changes: {
                    title: {
                      before: literal.beforeTitle,
                      after: literal.title,
                    },
                    url: { before: literal.priorUrl, after: literal.url },
                  },
                },
              ],
              nextBeforeRevision: 8,
            },
      });
    if (path.endsWith('/official-designation') && request.method() === 'POST') {
      expect(request.postData()).toBe('{"expectedRevision":9}');
      phase = 'designated';
      return route.fulfill({
        json: {
          documentId: 'document-locale',
          workingRevision: 10,
          action: 'designated_official',
          versionId: 'version-3',
          versionNumber: 3,
          supersededVersionNumber: 2,
        },
      });
    }
    if (path.endsWith('/versions'))
      return route.fulfill({
        json: {
          workingRevision: currentDocument().workingRevision,
          mutable: true,
          versions: [versionRow(3), versionRow(2), versionRow(1)],
        },
      });
    if (
      path.endsWith('/documents/document-locale') &&
      request.method() === 'PATCH'
    ) {
      patchCount += 1;
      if (patchCount === 1) {
        if (!announceCorrection)
          throw new Error('Correction announcement was not initialized');
        announceCorrection();
        await uncertainGate;
        return route.fulfill({ status: 502 });
      }
      phase = 'corrected';
      return route.fulfill({
        json: {
          documentId: 'document-locale',
          revision: 9,
          outcome: 'corrected',
        },
      });
    }
    if (path.endsWith('/documents/document-locale'))
      return route.fulfill({ json: currentDocument() });
    if (path.endsWith('/documents'))
      return route.fulfill({ json: [currentDocument()] });
    return route.fulfill({ status: 404 });
  });
  return {
    calls,
    firstCorrection,
    releaseUncertain: () => {
      if (!finishUncertain)
        throw new Error('Uncertainty gate was not initialized');
      finishUncertain();
    },
    idle: () => inFlight.size === 0,
  };
}

// Real App + HTTP/provider seams, four locales × both registered viewports.
for (const locale of interfaceLocales) {
  test(`preserves literal Document work, uncertain retry, history and official snapshots in ${locale}`, async ({
    page,
  }, testInfo) => {
    const observed = await installRoutes(page);
    await page.addInitScript(
      ({ localeKey, companyKey, companyId, workspaceId }) => {
        localStorage.setItem(localeKey, 'en');
        localStorage.setItem(companyKey, companyId);
        sessionStorage.setItem('prisma-workspace-context', workspaceId);
      },
      {
        localeKey: interfaceLocaleStorageKey,
        companyKey: preferenceKey(actorContextFixture),
        companyId: company.id,
        workspaceId: actorContextFixture.workspaceId,
      },
    );
    await page.goto('/?frame=prisme#documents');
    let workspace = page.getByRole('region', {
      name: doc('en', 'title'),
      exact: true,
    });
    await expect(
      workspace.getByRole('button', { name: literal.title, exact: true }),
    ).toBeVisible();
    await selectOption(
      workspace.getByRole('combobox', {
        name: doc('en', 'client'),
        exact: true,
      }),
      client.id,
    );
    const title = workspace.getByRole('textbox', {
      name: doc('en', 'titleLabel'),
      exact: true,
    });
    await title.fill(literal.draftTitle);
    await workspace
      .getByRole('textbox', { name: doc('en', 'purpose'), exact: true })
      .fill(literal.draftPurpose);
    await workspace
      .getByRole('textbox', { name: doc('en', 'url'), exact: true })
      .fill(literal.draftUrl);
    await workspace.getByRole('searchbox').fill('Questionnaire');
    const originalTitle = await title.elementHandle();
    if (!originalTitle)
      throw new Error('The literal registration field is missing');
    await expect.poll(observed.idle).toBe(true);
    const beforeDraftLocale = observed.calls.length;
    await chooseLanguage({ page, current: 'en', next: locale });
    workspace = page.getByRole('region', {
      name: doc(locale, 'title'),
      exact: true,
    });
    const localizedTitle = workspace.getByRole('textbox', {
      name: doc(locale, 'titleLabel'),
      exact: true,
    });
    expect(
      await localizedTitle.evaluate(
        (element, original) => element === original,
        originalTitle,
      ),
    ).toBe(true);
    await expect(localizedTitle).toHaveValue(literal.draftTitle);
    await expect(
      workspace.getByRole('textbox', {
        name: doc(locale, 'purpose'),
        exact: true,
      }),
    ).toHaveValue(literal.draftPurpose);
    await expect(
      workspace.getByRole('textbox', { name: doc(locale, 'url'), exact: true }),
    ).toHaveValue(literal.draftUrl);
    await expect(
      workspace.getByRole('combobox', {
        name: doc(locale, 'client'),
        exact: true,
      }),
    ).toHaveAttribute('data-value', client.id);
    await expect(workspace.getByRole('searchbox')).toHaveValue('Questionnaire');
    expect(observed.calls).toHaveLength(beforeDraftLocale);
    await capture(page, testInfo, `document-${locale}-literal-draft.png`);

    await workspace
      .getByRole('button', { name: literal.title, exact: true })
      .click();
    const versions = page.locator('.working-document-versions');
    await expect(
      versions
        .getByRole('listitem')
        .filter({
          has: page.getByRole('heading', {
            name: version(locale, 'version').replace('{number}', '3'),
            exact: true,
          }),
        })
        .first(),
    ).toBeVisible();
    await expect(
      versions.getByText('Frozen title 2 {literal} Я', { exact: true }),
    ).toBeVisible();
    await expect(
      versions.getByText(version(locale, 'statusOfficial'), { exact: true }),
    ).toHaveCount(1);
    await expect(
      versions.getByText(version(locale, 'statusSuperseded'), { exact: true }),
    ).toHaveCount(1);
    await expect(
      versions.getByText(
        resolveMessage(documentPdfMessages, locale, 'downloadDenied'),
        { exact: true },
      ),
    ).toBeVisible();
    await expect(versions.locator('.working-document-pdf button')).toHaveCount(
      0,
    );
    await page
      .getByRole('button', { name: history(locale, 'show'), exact: true })
      .click();
    const historyPanel = page.locator('.working-document-correction-history');
    await expect(
      historyPanel.getByText(literal.beforeTitle, { exact: true }),
    ).toBeVisible();
    await historyPanel
      .getByRole('button', { name: history(locale, 'showOlder'), exact: true })
      .click();
    await expect(
      historyPanel.getByText(literal.olderPurpose, { exact: true }),
    ).toBeVisible();
    await expect(historyPanel.getByRole('link')).toHaveCount(0);
    await expect(
      historyPanel.getByText(literal.priorUrl, { exact: true }),
    ).toBeVisible();
    await workspace
      .getByRole('button', { name: doc(locale, 'edit'), exact: true })
      .click();
    const correctionTitle = workspace.getByRole('textbox', {
      name: doc(locale, 'titleLabel'),
      exact: true,
    });
    await correctionTitle.fill(literal.correctedTitle);
    await workspace
      .getByRole('textbox', { name: doc(locale, 'purpose'), exact: true })
      .fill(literal.correctedPurpose);
    await workspace
      .getByRole('textbox', { name: doc(locale, 'url'), exact: true })
      .fill(literal.correctedUrl);
    const originalCorrection = await correctionTitle.elementHandle();
    if (!originalCorrection) throw new Error('The correction field is missing');
    await workspace
      .getByRole('button', { name: doc(locale, 'save'), exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await observed.firstCorrection;
    await expect(
      workspace.getByText(doc(locale, 'saving'), { exact: true }),
    ).toBeVisible();
    const alternate: InterfaceLocale = locale === 'fr' ? 'ru' : 'fr';
    const beforePendingLocale = observed.calls.length;
    await chooseLanguage({ page, current: locale, next: alternate });
    workspace = page.getByRole('region', {
      name: doc(alternate, 'title'),
      exact: true,
    });
    await expect(
      workspace.getByText(doc(alternate, 'saving'), { exact: true }),
    ).toBeVisible();
    const alternateTitle = workspace.getByRole('textbox', {
      name: doc(alternate, 'titleLabel'),
      exact: true,
    });
    expect(
      await alternateTitle.evaluate(
        (element, original) => element === original,
        originalCorrection,
      ),
    ).toBe(true);
    await expect(alternateTitle).toHaveValue(literal.correctedTitle);
    await expect(alternateTitle).toBeDisabled();
    await expect(
      historyPanel.getByText(literal.olderPurpose, { exact: true }),
    ).toBeVisible();
    await expect(
      historyPanel.getByRole('button', {
        name: history(alternate, 'hide'),
        exact: true,
      }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(observed.calls).toHaveLength(beforePendingLocale);
    await chooseLanguage({ page, current: alternate, next: locale });
    expect(observed.calls).toHaveLength(beforePendingLocale);
    observed.releaseUncertain();
    workspace = page.getByRole('region', {
      name: doc(locale, 'title'),
      exact: true,
    });
    await expect(workspace.getByRole('alert')).toHaveText(
      doc(locale, 'uncertain'),
    );
    await capture(page, testInfo, `document-${locale}-uncertain-history.png`);
    await workspace
      .getByRole('button', {
        name: doc(locale, 'retryCorrection'),
        exact: true,
      })
      .click();
    await expect(
      workspace.getByText(doc(locale, 'saved'), { exact: true }),
    ).toBeVisible();
    await expect(
      workspace.getByRole('heading', {
        name: literal.correctedTitle,
        exact: true,
      }),
    ).toBeVisible();
    const corrections = observed.calls.filter(
      (call) => call.method === 'PATCH',
    );
    expect(corrections).toHaveLength(2);
    expect(corrections[0]?.body).toBe(
      JSON.stringify({
        expectedRevision: 8,
        title: literal.correctedTitle,
        purpose: literal.correctedPurpose,
        url: literal.correctedUrl,
      }),
    );
    expect(corrections[1]).toEqual(corrections[0]);
    expect(corrections[0]?.key).toBeTruthy();
    expect(corrections[0]?.company).toBe(company.id);

    await versions
      .getByRole('button', { name: version(locale, 'designate'), exact: true })
      .click();
    const confirmation = versions.getByRole('button', {
      name: version(locale, 'confirm'),
      exact: true,
    });
    await expect(confirmation).toBeFocused();
    await chooseLanguage({ page, current: locale, next: alternate });
    await expect(
      versions.getByRole('button', {
        name: version(alternate, 'confirm'),
        exact: true,
      }),
    ).toBeVisible();
    await chooseLanguage({ page, current: alternate, next: locale });
    await versions
      .getByRole('button', { name: version(locale, 'confirm'), exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(
      versions.getByText(
        version(locale, 'designated').replace('{number}', '3'),
        { exact: true },
      ),
    ).toBeVisible();
    await expect(
      versions.getByText(literal.correctedTitle, { exact: true }),
    ).toBeVisible();
    await expect(
      versions.getByText('Frozen title 2 {literal} Я', { exact: true }),
    ).toBeVisible();
    await expect(
      versions.getByText('Frozen title 1 {literal} Я', { exact: true }),
    ).toBeVisible();
    await expect(
      versions.getByText(version(locale, 'statusSuperseded'), { exact: true }),
    ).toHaveCount(2);
    await expect(
      versions.getByText(
        resolveMessage(documentPdfMessages, locale, 'downloadDenied'),
        { exact: true },
      ),
    ).toBeVisible();
    await expect.poll(observed.idle).toBe(true);
    const beforeConfirmedLocale = observed.calls.length;
    await chooseLanguage({ page, current: locale, next: alternate });
    await expect(
      versions.getByText(
        version(alternate, 'designated').replace('{number}', '3'),
        { exact: true },
      ),
    ).toBeVisible();
    expect(observed.calls).toHaveLength(beforeConfirmedLocale);
    await chooseLanguage({ page, current: alternate, next: locale });
    expect(observed.calls).toHaveLength(beforeConfirmedLocale);
    await capture(page, testInfo, `document-${locale}-official-superseded.png`);
    expect(
      observed.calls.filter((call) => call.method === 'POST'),
    ).toHaveLength(1);
    expect(observed.calls.some((call) => call.path.includes('/content'))).toBe(
      false,
    );
    await workspace
      .getByRole('button', { name: doc(locale, 'back'), exact: true })
      .click();
    await expect(workspace.getByRole('searchbox')).toHaveValue('Questionnaire');
    await workspace.getByRole('searchbox').fill('');
    await workspace
      .getByRole('button', { name: literal.correctedTitle, exact: true })
      .click();
    await expect(
      versions.getByText('Frozen title 2 {literal} Я', { exact: true }),
    ).toBeVisible();
    await expect(
      versions.getByText(version(locale, 'statusSuperseded'), { exact: true }),
    ).toHaveCount(2);
  });
}
