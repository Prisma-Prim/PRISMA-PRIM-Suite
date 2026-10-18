import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { enterClassicCompatibility } from './classic-compatibility';
import {
  activityLocaleIds,
  activityLiteral,
  activityInstant,
  heterogeneousActivityEvents,
  activityDetailPath,
  activityOfferPath,
  activityContractPath,
  activityNextActionPath,
  activityDraft,
  activitySavedRequest,
  readActivityJourneyFixture,
} from '../src/test/activity-localization-fixture';

// The original instant is10:05Z; New York is06:05 on this date. These independent
// expected strings deliberately detect an accidental UTC formatter.
test.use({ timezoneId: 'America/New_York' });
const locales = [
  {
    code: 'ro',
    name: 'Română',
    language: 'Limba interfeței',
    title: 'Jurnal de activitate',
    loading: 'Se încarcă activitatea…',
    open: 'Deschideți cererea',
    offer: 'Deschideți versiunea ofertei',
    contract: 'Deschideți versiunea acordului',
    requestTarget: `Țintă: Cerere a clientului: ${activityLocaleIds.request}`,
    created: 'a înregistrat o cerere a clientului',
    union:
      'Responsabil autorizat pentru unificare a confirmat unificarea Clienților',
    time: '21 sept. 2026, 06:05',
    navigation: 'Navigare principală',
    openNav: 'Deschideți navigarea',
    optIn: 'Încercați Prisme',
    edit: 'Editează acțiunea următoare',
    next: 'Acțiunea următoare',
    save: 'Salvează acțiunea următoare',
    retry: 'Reîncearcă actualizarea',
    uncertain:
      'Actualizarea acțiunii următoare nu s-a finalizat. Reîncercați pentru a confirma rezultatul.',
    held: 'Solicitarea cerută se va deschide după salvarea sau anularea editării acțiunii următoare.',
    error: 'Jurnalul de activitate nu a putut fi încărcat. Încercați din nou.',
    empty:
      'În acest spațiu de lucru nu este încă înregistrată nicio activitate.',
  },
  {
    code: 'ru',
    name: 'Русский',
    language: 'Язык интерфейса',
    title: 'Журнал действий',
    loading: 'Загрузка действий…',
    open: 'Открыть запрос',
    offer: 'Открыть версию Оферты',
    contract: 'Открыть версию соглашения',
    requestTarget: `Объект: Запрос Клиента: ${activityLocaleIds.request}`,
    created: '— регистрация запроса Клиента',
    union:
      'Уполномоченная сторона объединения — подтверждение объединения Клиентов',
    time: '21 сент. 2026 г., 06:05',
    navigation: 'Основная навигация',
    openNav: 'Открыть навигацию',
    optIn: 'Попробовать Prisme',
    edit: 'Изменить следующее действие',
    next: 'Следующее действие',
    save: 'Сохранить следующее действие',
    retry: 'Повторить обновление',
    uncertain:
      'Обновление следующего действия не завершено. Повторите попытку, чтобы подтвердить результат.',
    held: 'Запрошенный Запрос откроется после сохранения или отмены редактирования следующего действия.',
    error: 'Не удалось загрузить журнал действий. Повторите попытку.',
    empty: 'В этом рабочем пространстве пока нет записанных действий.',
  },
  {
    code: 'fr',
    name: 'Français',
    language: 'Langue de l’interface',
    title: 'Journal d’activité',
    loading: 'Chargement de l’activité…',
    open: 'Ouvrir la demande',
    offer: 'Ouvrir la Version de l’Offre',
    contract: 'Ouvrir la version de l’accord',
    requestTarget: `Cible : Demande Client: ${activityLocaleIds.request}`,
    created: 'a enregistré une Demande Client',
    union: 'Responsable autorisé de la fusion a confirmé une fusion de Clients',
    time: '21 sept. 2026, 06:05',
    navigation: 'Navigation principale',
    openNav: 'Ouvrir la navigation',
    optIn: 'Essayer Prisme',
    edit: 'Modifier la prochaine action',
    next: 'Prochaine action',
    save: 'Enregistrer la prochaine action',
    retry: 'Réessayer la mise à jour',
    uncertain:
      'La mise à jour de la prochaine action n’a pas abouti. Réessayez pour confirmer le résultat.',
    held: 'La Demande demandée s’ouvrira après l’enregistrement ou l’annulation de la prochaine action.',
    error: 'Le journal d’activité n’a pas pu être chargé. Veuillez réessayer.',
    empty:
      'Aucune activité n’est encore enregistrée dans cet espace de travail.',
  },
  {
    code: 'en',
    name: 'English',
    language: 'Interface language',
    title: 'Activity Log',
    loading: 'Loading activity…',
    open: 'Open Request',
    offer: 'Open Offer Version',
    contract: 'Open agreement version',
    requestTarget: `Target: Client Request: ${activityLocaleIds.request}`,
    created: 'captured a Client Request',
    union: 'Authorized resolver confirmed a Client union',
    time: 'Sep 21, 2026, 6:05 AM',
    navigation: 'Primary navigation',
    openNav: 'Open navigation',
    optIn: 'Try Prisme',
    edit: 'Edit next action',
    next: 'Next action',
    save: 'Save next action',
    retry: 'Retry update',
    uncertain:
      'The next action update did not complete. Retry to confirm the result.',
    held: 'The requested Client Request opens after the next-action edit is saved or cancelled.',
    error: 'We could not load the Activity Log. Please try again.',
    empty: 'No activity has been recorded in this workspace yet.',
  },
] as const;
type Locale = (typeof locales)[number];
function gate() {
  let release: () => void = () => {
    throw new Error('Boundary gate not initialized');
  };
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}
async function chooseLocale(page: Page, locale: Locale) {
  const select = page.getByRole('combobox', {
    name: /^(?:Interface language|Limba interfeței|Язык интерфейса|Langue de l’interface)$/u,
  });
  await select.focus();
  await select.press('Enter');
  const option = page.getByRole('option', { name: locale.name, exact: true });
  await option.focus();
  await option.press('Enter');
  await expect(select).toHaveAttribute('data-value', locale.code);
  await expect(select).toBeFocused();
}
async function go(
  page: Page,
  section: 'activity' | 'requests',
  locale: Locale,
) {
  const link = page
    .getByRole('navigation', { name: locale.navigation })
    .locator(`a[href="#${section}"]`);
  if (!(await link.isVisible()))
    await page
      .getByRole('button', { name: locale.openNav, exact: true })
      .click();
  await link.click();
  await expect(page).toHaveURL(new RegExp(`#${section}$`, 'u'));
}
async function fit(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
async function capture(page: Page, testInfo: TestInfo, name: string) {
  await fit(page);
  await page.screenshot({
    path: testInfo.outputPath(`${name}-${testInfo.project.name}.png`),
    fullPage: true,
  });
}
async function install(page: Page) {
  const state: {
    firstActivityGate?: Promise<void>;
    activityReads: number;
    activityStatus: number;
    events: unknown[];
    gets: Array<{ path: string; companyId: string }>;
    commands: Array<{
      path: string;
      body: string | null;
      key: string | undefined;
      companyId: string;
    }>;
    retryGate?: Promise<void>;
    saved: boolean;
  } = {
    activityReads: 0,
    activityStatus: 200,
    events: heterogeneousActivityEvents,
    gets: [],
    commands: [],
    saved: false,
  };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const companyId =
      request.headers()['x-company-context-id'] ?? activityLocaleIds.company;
    if (request.method() !== 'GET') {
      expect(request.method()).toBe('POST');
      expect(path).toBe(activityNextActionPath);
      state.commands.push({
        path,
        body: request.postData(),
        key: request.headers()['idempotency-key'],
        companyId,
      });
      if (state.commands.length === 1)
        return route.fulfill({ status: 503, json: {} });
      if (state.retryGate) await state.retryGate;
      state.saved = true;
      return route.fulfill({
        json: {
          receipt: {
            opportunityId: activityLocaleIds.opportunity,
            nextAction: activityDraft,
            version: 3,
            outcome: 'updated',
          },
          request: activitySavedRequest(),
        },
      });
    }
    state.gets.push({ path, companyId });
    if (path === '/api/activity-log') {
      state.activityReads += 1;
      if (state.activityReads === 1 && state.firstActivityGate)
        await state.firstActivityGate;
      return route.fulfill({
        status: state.activityStatus,
        json: {
          events: companyId === activityLocaleIds.company ? state.events : [],
        },
      });
    }
    return route.fulfill({
      json: readActivityJourneyFixture({ path, companyId, saved: state.saved }),
    });
  });
  return state;
}
for (const locale of locales) {
  test(`reads localized Activity and opens exact historical versions with keyboard in ${locale.code}`, async ({
    page,
  }, testInfo) => {
    const state = await install(page);
    const delayed = gate();
    state.firstActivityGate = delayed.promise;
    await page.goto('/?frame=prisme#activity');
    await expect(
      page.getByText('Loading activity…', { exact: true }),
    ).toBeVisible();
    await expect
      .poll(
        () =>
          state.gets.filter(
            ({ path }) => path === '/api/commercial-intake/requests',
          ).length,
      )
      .toBe(1);
    const beforeLocale = state.gets.length;
    await chooseLocale(page, locale);
    await expect(
      page.getByRole('status').filter({ hasText: locale.loading }),
    ).toBeVisible();
    expect(state.gets).toHaveLength(beforeLocale);
    await capture(page, testInfo, `activity-loading-${locale.code}`);
    delayed.release();
    const ledger = page.getByRole('region', {
      name: locale.title,
      exact: true,
    });
    const rows = ledger.getByRole('listitem');
    await expect(rows).toHaveCount(11);
    const requestRow = rows.filter({
      has: page.getByText(locale.requestTarget, { exact: true }),
    });
    await expect(requestRow).toHaveCount(1);
    await expect(requestRow).toContainText(
      `Alex {literal} — Știință / Имя ${locale.created}`,
    );
    await expect(requestRow.getByRole('time')).toHaveAttribute(
      'datetime',
      activityInstant,
    );
    await expect(requestRow.getByRole('time')).toHaveText(locale.time);
    expect(
      await page.evaluate(
        () => Intl.DateTimeFormat().resolvedOptions().timeZone,
      ),
    ).toBe('America/New_York');
    const redacted = rows.filter({
      has: page.getByText(locale.union, { exact: true }),
    });
    await expect(redacted).toHaveCount(1);
    await expect(redacted.getByRole('time')).toHaveCount(0);
    await expect(redacted.getByRole('button')).toHaveCount(0);
    await expect(redacted).not.toContainText('Alex');
    await expect(redacted).not.toContainText('2026');
    await expect(redacted).not.toContainText(
      'projection-client.union_confirmed',
    );
    await expect(ledger).toContainText(activityLiteral);
    const originalRows = await rows.elementHandles();
    const reads = state.gets.length;
    const alternate = locale.code === 'fr' ? locales[0] : locales[2];
    await chooseLocale(page, alternate);
    const currentRows = page
      .getByRole('region', { name: alternate.title, exact: true })
      .getByRole('listitem');
    await expect(currentRows).toHaveCount(11);
    for (const [index, original] of originalRows.entries()) {
      expect(
        await original.evaluate(
          (element, position) =>
            element.isConnected &&
            element.parentElement?.children.item(position) === element,
          index,
        ),
      ).toBe(true);
    }
    expect(state.gets).toHaveLength(reads);
    await chooseLocale(page, locale);
    expect(state.gets).toHaveLength(reads);
    await capture(page, testInfo, `activity-populated-${locale.code}`);
    const openRequest = requestRow.getByRole('button', {
      name: locale.open,
      exact: true,
    });
    await openRequest.focus();
    await expect(openRequest).toBeFocused();
    await openRequest.press('Enter');
    await expect(
      page.getByText('Original Request evidence {literal} — Источник', {
        exact: true,
      }),
    ).toBeVisible();
    await go(page, 'activity', locale);
    const openOffer = ledger.getByRole('button', {
      name: locale.offer,
      exact: true,
    });
    await openOffer.focus();
    await openOffer.press('Enter');
    await expect(
      page.getByText('Historical Offer conditions {original} — Оферта', {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      state.gets.filter(
        ({ path }) =>
          path ===
          `${activityOfferPath}/versions/${activityLocaleIds.offerVersion}`,
      ),
    ).toHaveLength(1);
    await capture(page, testInfo, `activity-exact-offer-${locale.code}`);
    await go(page, 'activity', locale);
    const openContract = ledger.getByRole('button', {
      name: locale.contract,
      exact: true,
    });
    await openContract.focus();
    await openContract.press('Enter');
    await expect(
      page.getByText('Historical Contract conditions {original} — Договор', {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      state.gets.filter(
        ({ path }) =>
          path ===
          `${activityContractPath}/versions/${activityLocaleIds.contractVersion}`,
      ),
    ).toHaveLength(1);
    expect(
      state.gets.filter(({ path }) => path === activityDetailPath),
    ).toHaveLength(3);
    expect(state.commands).toEqual([]);
    expect(state.activityReads).toBe(1);
    await capture(page, testInfo, `activity-exact-contract-${locale.code}`);
    await go(page, 'activity', locale);
    const beforeFrame = state.gets.length;
    await enterClassicCompatibility(page, locale.optIn);
    await expect(ledger).toBeVisible();
    await expect(rows).toHaveCount(11);
    for (const original of originalRows)
      expect(await original.evaluate((element) => element.isConnected)).toBe(
        true,
      );
    await page.getByRole('button', { name: locale.optIn, exact: true }).click();
    await expect(page).toHaveURL(/\/#activity$/u);
    expect(state.gets).toHaveLength(beforeFrame);
    expect(state.commands).toEqual([]);
  });

  test(`preserves held draft and exact uncertain retry with current-language states in ${locale.code}`, async ({
    page,
  }, testInfo) => {
    const state = await install(page);
    const retry = gate();
    state.retryGate = retry.promise;
    await page.goto('/?frame=prisme#activity');
    await expect(
      page
        .getByRole('region', { name: 'Activity Log', exact: true })
        .getByRole('listitem'),
    ).toHaveCount(11);
    await chooseLocale(page, locale);
    const ledger = page.getByRole('region', {
      name: locale.title,
      exact: true,
    });
    const requestRow = ledger
      .getByRole('listitem')
      .filter({ has: page.getByText(locale.requestTarget, { exact: true }) });
    await requestRow
      .getByRole('button', { name: locale.open, exact: true })
      .press('Enter');
    await page.getByRole('button', { name: locale.edit, exact: true }).click();
    const draft = page.getByLabel(locale.next, { exact: true });
    await draft.fill(activityDraft);
    const originalDraft = await draft.elementHandle();
    if (!originalDraft)
      throw new Error('The protected literal draft must be mounted.');
    await go(page, 'activity', locale);
    await ledger
      .getByRole('button', { name: locale.offer, exact: true })
      .press('Enter');
    await expect(
      page.getByRole('status').filter({ hasText: locale.held }),
    ).toBeVisible();
    const protectedReads = state.gets.length;
    const alternate = locale.code === 'fr' ? locales[0] : locales[2];
    await chooseLocale(page, alternate);
    await expect(page.getByLabel(alternate.next, { exact: true })).toHaveValue(
      activityDraft,
    );
    expect(await originalDraft.evaluate((element) => element.isConnected)).toBe(
      true,
    );
    expect(state.gets).toHaveLength(protectedReads);
    expect(state.commands).toEqual([]);
    await chooseLocale(page, locale);
    await page.getByRole('button', { name: locale.save, exact: true }).click();
    await expect(
      page.getByRole('alert').filter({ hasText: locale.uncertain }),
    ).toBeVisible();
    await expect(draft).toHaveValue(activityDraft);
    await expect(draft).toBeDisabled();
    expect(state.commands).toHaveLength(1);
    await capture(page, testInfo, `activity-held-uncertain-${locale.code}`);
    const uncertainReads = state.gets.length;
    await chooseLocale(page, alternate);
    await expect(
      page.getByRole('alert').filter({ hasText: alternate.uncertain }),
    ).toBeVisible();
    expect(state.gets).toHaveLength(uncertainReads);
    expect(state.commands).toHaveLength(1);
    await chooseLocale(page, locale);
    await go(page, 'activity', locale);
    await ledger
      .getByRole('button', { name: locale.contract, exact: true })
      .press('Enter');
    await expect(
      page.getByRole('status').filter({ hasText: locale.held }),
    ).toBeVisible();
    expect(
      state.gets.some(
        ({ path }) =>
          path ===
            `${activityOfferPath}/versions/${activityLocaleIds.offerVersion}` ||
          path ===
            `${activityContractPath}/versions/${activityLocaleIds.contractVersion}`,
      ),
    ).toBe(false);
    await page.getByRole('button', { name: locale.retry, exact: true }).click();
    await expect.poll(() => state.commands.length).toBe(2);
    const pendingReads = state.gets.length;
    await chooseLocale(page, alternate);
    await expect(page.getByLabel(alternate.next, { exact: true })).toHaveValue(
      activityDraft,
    );
    await expect(
      page.getByLabel(alternate.next, { exact: true }),
    ).toBeDisabled();
    expect(state.gets).toHaveLength(pendingReads);
    expect(state.commands[0]).toEqual(state.commands[1]);
    expect(state.commands[0]?.path).toBe(activityNextActionPath);
    expect(state.commands[0]?.body).toBe(
      JSON.stringify({ expectedVersion: 2, nextAction: activityDraft }),
    );
    expect(state.commands[0]?.companyId).toBe(activityLocaleIds.company);
    expect(state.commands[0]?.key).toBeTruthy();
    retry.release();
    await expect(
      page.getByText('Historical Contract conditions {original} — Договор', {
        exact: true,
      }),
    ).toBeVisible();
    expect(
      state.gets.filter(
        ({ path }) =>
          path ===
          `${activityContractPath}/versions/${activityLocaleIds.contractVersion}`,
      ),
    ).toHaveLength(1);
    expect(
      state.gets.filter(
        ({ path }) =>
          path ===
          `${activityOfferPath}/versions/${activityLocaleIds.offerVersion}`,
      ),
    ).toEqual([]);
    await chooseLocale(page, locale);
    await go(page, 'activity', locale);
    state.activityStatus = 503;
    await page.reload();
    await expect(
      page
        .getByRole('region', { name: locale.title, exact: true })
        .getByRole('alert'),
    ).toHaveText(locale.error);
    await capture(page, testInfo, `activity-error-${locale.code}`);
    const errorReads = state.gets.length;
    await chooseLocale(page, alternate);
    await expect(
      page
        .getByRole('region', { name: alternate.title, exact: true })
        .getByRole('alert'),
    ).toHaveText(alternate.error);
    expect(state.gets).toHaveLength(errorReads);
    state.activityStatus = 200;
    state.events = [];
    await chooseLocale(page, locale);
    await page.reload();
    const empty = page.getByRole('region', { name: locale.title, exact: true });
    await expect(empty.getByText(locale.empty, { exact: true })).toBeVisible();
    await expect(empty.getByRole('button')).toHaveCount(0);
    await capture(page, testInfo, `activity-empty-${locale.code}`);
    expect(state.commands).toHaveLength(2);
  });
}
