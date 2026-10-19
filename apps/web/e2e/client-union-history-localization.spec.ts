import {
  expect,
  test,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';
import type { InterfaceLocale } from '../src/localization/interface-locale';
import {
  historyCompanies,
  historyDetail,
  historyFirst,
  historyOriginalReason,
  historyProjection,
  historyReversalReason,
  historySecond,
  unionHistoryLocaleCases,
  type UnionHistoryLocaleCase,
} from '../src/test/client-union-history-localization.fixture';
import { enterClassicCompatibility } from './classic-compatibility';
import { installHistoryLocalizationFixture } from './client-union-history-localization.fixture';
import { selectOption } from './select-option';

// Authorized timestamps keep browser-local semantics, including the prior day.
test.use({ timezoneId: 'America/New_York' });

const shell = {
  ro: {
    navigation: 'Navigare principală',
    openMenu: 'Deschideți navigarea',
    activity: 'Jurnal de activitate',
    clients: 'Clienți',
    optIn: 'Încercați Prisme',
    listError: 'Clienții nu au putut fi încărcați. Încercați din nou.',
    activityError:
      'Jurnalul de activitate nu a putut fi încărcat. Încercați din nou.',
  },
  ru: {
    navigation: 'Основная навигация',
    openMenu: 'Открыть навигацию',
    activity: 'Журнал активности',
    clients: 'Клиенты',
    optIn: 'Попробовать Prisme',
    listError: 'Не удалось загрузить Клиентов. Повторите попытку.',
    activityError: 'Не удалось загрузить журнал действий. Повторите попытку.',
  },
  fr: {
    navigation: 'Navigation principale',
    openMenu: 'Ouvrir la navigation',
    activity: 'Journal d’activité',
    clients: 'Clients',
    optIn: 'Essayer Prisme',
    listError: 'Impossible de charger les Clients. Réessayez.',
    activityError:
      'Le journal d’activité n’a pas pu être chargé. Veuillez réessayer.',
  },
  en: {
    navigation: 'Primary navigation',
    openMenu: 'Open navigation',
    activity: 'Activity Log',
    clients: 'Clients',
    optIn: 'Try Prisme',
    listError: 'We could not load Clients. Please try again.',
    activityError: 'We could not load the Activity Log. Please try again.',
  },
} satisfies Record<InterfaceLocale, Record<string, string>>;

async function chooseLocale({
  page,
  code,
}: {
  page: Page;
  code: InterfaceLocale;
}) {
  const control = page.locator('#interface-locale');
  await control.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Home');
  const index = ['ro', 'ru', 'fr', 'en'].indexOf(code);
  for (let step = 0; step < index; step += 1)
    await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(control).toHaveAttribute('data-value', code);
  await expect(control).toBeFocused();
  await expect(page.locator('html')).toHaveAttribute('lang', code);
}

async function navigate({
  page,
  code,
  section,
}: {
  page: Page;
  code: InterfaceLocale;
  section: 'activity' | 'clients';
}) {
  const menu = page.getByRole('button', {
    name: shell[code].openMenu,
    exact: true,
  });
  if (await menu.isVisible()) await menu.click();
  const link = page
    .getByRole('navigation', { name: shell[code].navigation })
    .getByRole('link', { name: shell[code][section], exact: true });
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator(`#${section}`)).toBeVisible();
}

async function discover({
  page,
  copy,
}: {
  page: Page;
  copy: UnionHistoryLocaleCase;
}) {
  const panel = page.getByRole('region', { name: copy.title });
  const sources = panel.getByRole('button', { name: copy.sources });
  await sources.focus();
  await page.keyboard.press('Enter');
  const source = panel.getByRole('button', {
    name: historySecond.displayName,
    exact: true,
  });
  await expect(source).toBeVisible();
  await source.focus();
  await page.keyboard.press('Enter');
  await expect(
    panel.getByText(copy.confirmedAction, { exact: true }),
  ).toBeVisible();
  return panel;
}

async function openDetail({
  page,
  copy,
}: {
  page: Page;
  copy: UnionHistoryLocaleCase;
}) {
  const panel = await discover({ page, copy });
  const details = panel.getByRole('button', { name: copy.details });
  await details.focus();
  await page.keyboard.press('Enter');
  await expect(
    panel.getByRole('heading', { name: copy.heading }),
  ).toBeVisible();
  return panel;
}

async function capture({
  page,
  info,
  name,
  focus,
  fullPage = false,
}: {
  page: Page;
  info: TestInfo;
  name: string;
  focus: Locator;
  fullPage?: boolean;
}) {
  await focus.scrollIntoViewIfNeeded();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(() =>
      Array.from(
        document.querySelectorAll(
          '.client-union button, .client-union input, .client-union textarea',
        ),
      )
        .filter(
          (node) =>
            node.getClientRects().length > 0 && !node.closest('[hidden]'),
        )
        .map((node) => node.getBoundingClientRect())
        .every((rect) => rect.left >= 0 && rect.right <= window.innerWidth),
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath(`${name}-viewport.png`) });
  if (fullPage) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath(`${name}-full.png`),
      fullPage: true,
    });
  }
}

for (const copy of unionHistoryLocaleCases) {
  test(`keeps the real App history, local timestamps and exact reversal through locale/frame changes in ${copy.code}`, async ({
    page,
  }, info) => {
    const state = await installHistoryLocalizationFixture({ page });
    await page.addInitScript((code) => {
      localStorage.setItem('prisma-prim.interface-locale', code);
    }, copy.code);
    await page.goto('/?frame=prisme#clients');
    const panel = page.getByRole('region', { name: copy.title });
    await expect(panel).toBeVisible();
    await expect(page.locator('#client-dossier-title')).toHaveCount(0);
    expect(state.dossierReads).toEqual([]);
    await discover({ page, copy });
    await expect(panel.getByRole('listitem')).toHaveCount(2);
    await expect(panel.getByRole('button', { name: copy.details })).toHaveCount(
      1,
    );
    expect(
      await panel.getByRole('listitem').locator('span').allTextContents(),
    ).toEqual([copy.reversedAction, copy.confirmedAction]);
    await expect(panel.locator('time')).toHaveCount(0);
    await expect(panel).not.toContainText('PRIVATE');
    await expect(panel).not.toContainText('redacted-projection-712');
    await expect(panel).not.toContainText('scope=B');
    await capture({ page, info, name: `${copy.code}-redacted`, focus: panel });
    await panel.getByRole('button', { name: copy.details }).click();
    await expect(
      panel.getByRole('heading', { name: copy.heading }),
    ).toBeVisible();
    expect(
      await panel
        .locator('.client-union-history-detail > p')
        .nth(1)
        .textContent(),
    ).toBe('  Motiv original / исходная причина\nA → B.  ');
    const articles = panel.getByRole('article');
    await expect(articles).toHaveCount(2);
    await expect(
      articles.nth(0).getByRole('heading', {
        name: `${copy.source} 1 · ${historyFirst.displayName}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      articles.nth(1).getByRole('heading', {
        name: `${copy.source} 2 · ${historySecond.displayName}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(articles.nth(0)).toContainText(copy.version);
    await expect(articles.nth(1)).toContainText(copy.absent);
    expect(await articles.nth(0).locator('dd').allTextContents()).toEqual([
      historyFirst.displayName,
      '  MD-0712 / ИД  ',
      'Strada Luminii 7\nChișinău — Кишинёв',
      '+373 (22) 071-200',
      'literal+712@example.test',
      'Certificare / консалтинг',
    ]);
    expect(
      await articles.nth(0).locator('li strong').allTextContents(),
    ).toEqual(['Ana / Анна', 'Ana / Анна']);
    expect(
      await articles.nth(1).locator('li strong').allTextContents(),
    ).toEqual(['Boris / Борис']);
    await expect(articles.nth(0)).toContainText('ana.second+712@example.test');
    expect(await articles.nth(0).locator('li').first().textContent()).toContain(
      '  Director / директор  ',
    );
    expect(await articles.nth(0).locator('li').first().textContent()).toContain(
      '  Email întâi / сначала email\nDupă 14:00.  ',
    );
    expect(
      await panel
        .getByRole('region', { name: copy.companySet })
        .locator('li')
        .allTextContents(),
    ).toEqual(['BIC — Companie / Компания B', 'PRISMA-PRIM — Companie A']);
    const originalTime = panel.locator('time').first();
    await expect(originalTime).toHaveAttribute(
      'datetime',
      '2026-01-27T00:15:00.000Z',
    );
    await expect(originalTime).toHaveText(copy.localTime);
    await expect(panel).not.toContainText('PRIVATE');
    const form = panel.getByRole('form', { name: copy.reverse });
    await expect(form).toBeVisible();
    await form.getByRole('button', { name: copy.reverse, exact: true }).click();
    const reason = form.getByRole('textbox', { name: copy.reason });
    await expect(reason).toHaveAttribute('aria-invalid', 'true');
    await expect(reason).toHaveAccessibleDescription(copy.incomplete);
    expect(state.commands).toHaveLength(0);
    await capture({
      page,
      info,
      name: `${copy.code}-detail-validation`,
      focus: reason,
      fullPage: true,
    });
    await reason.fill(historyReversalReason);
    await form.getByRole('checkbox').check();
    const formNode = await form.elementHandle();
    const reasonNode = await reason.elementHandle();
    if (!formNode || !reasonNode)
      throw new Error('Expected mounted reversal controls.');
    const requests = state.apiReads.slice();
    await chooseLocale({ page, code: copy.code === 'ro' ? 'fr' : 'ro' });
    await chooseLocale({ page, code: copy.code });
    expect(state.apiReads).toEqual(requests);
    expect(
      await form.evaluate((node, original) => node === original, formNode),
    ).toBe(true);
    expect(
      await reason.evaluate((node, original) => node === original, reasonNode),
    ).toBe(true);
    await expect(reason).toHaveValue(historyReversalReason);
    await expect(form.getByRole('checkbox')).toBeChecked();
    await expect(originalTime).toHaveAttribute(
      'datetime',
      historyDetail.occurredAt,
    );
    await expect(originalTime).toHaveText(copy.localTime);

    let releaseUncertain: (() => Promise<void>) | undefined;
    state.reverseReply = (route) => {
      releaseUncertain = () => route.fulfill({ status: 503 });
    };
    await form.getByRole('button', { name: copy.reverse, exact: true }).click();
    await expect.poll(() => state.commands.length).toBe(1);
    await expect(
      form.getByRole('button', { name: copy.pending }),
    ).toBeDisabled();
    const pendingRequests = state.apiReads.slice();
    await chooseLocale({ page, code: copy.code === 'ro' ? 'fr' : 'ro' });
    await chooseLocale({ page, code: copy.code });
    expect(state.apiReads).toEqual(pendingRequests);
    if (!releaseUncertain)
      throw new Error('Expected a received pending reversal.');
    await releaseUncertain();
    await expect(form.getByRole('alert')).toHaveText(copy.uncertain);
    const uncertainRequests = state.apiReads.slice();
    await navigate({ page, code: copy.code, section: 'activity' });
    await expect(panel).toBeHidden();
    await navigate({ page, code: copy.code, section: 'clients' });
    await enterClassicCompatibility(page, shell[copy.code].optIn);
    const framedRequests = [...uncertainRequests, 'GET /api/operational-home'];
    await expect.poll(() => state.apiReads).toEqual(framedRequests);
    await page
      .getByRole('button', { name: shell[copy.code].optIn, exact: true })
      .click();
    await expect(page.locator('.prisme-shell')).toBeVisible();
    expect(state.apiReads).toEqual(framedRequests);
    expect(
      await form.evaluate((node, original) => node === original, formNode),
    ).toBe(true);
    await expect(reason).toHaveValue(historyReversalReason);
    await expect(form.getByRole('checkbox')).toBeChecked();
    await capture({
      page,
      info,
      name: `${copy.code}-uncertain`,
      focus: form.getByRole('button', { name: copy.retry }),
    });
    state.reverseReply = undefined;
    state.refreshFails = true;
    const clientReads = state.clientReads;
    const activityReads = state.activityReads;
    await form.getByRole('button', { name: copy.retry }).click();
    await expect(
      panel.getByText(copy.confirmed, { exact: true }),
    ).toBeVisible();
    expect(state.commands).toHaveLength(2);
    expect(state.commands[1]).toEqual(state.commands[0]);
    expect(state.commands[0]?.path).toBe(
      `/api/client-union-operations/${encodeURIComponent(historyProjection)}/reversal`,
    );
    expect(state.commands[0]?.method).toBe('POST');
    expect(state.commands[0]?.company).toBe('company-b-712');
    expect(state.commands[0]?.key).toBeTruthy();
    expect(JSON.parse(state.commands[0]?.body ?? '{}')).toEqual({
      reason: '  Restabilește / восстановить\nA și B separat.  ',
      companyIds: ['company-b-712', 'company-a-712'],
    });
    await expect.poll(() => state.clientReads).toBe(clientReads + 1);
    await expect.poll(() => state.activityReads).toBe(activityReads + 1);
    await expect(
      page.getByText(shell[copy.code].listError, { exact: true }),
    ).toBeVisible();
    await expect(panel.getByRole('form')).toHaveCount(0);
    await expect(panel.getByText(copy.uncertain, { exact: true })).toHaveCount(
      0,
    );
    await capture({
      page,
      info,
      name: `${copy.code}-confirmed-list-failure`,
      focus: panel,
    });
    await navigate({ page, code: copy.code, section: 'activity' });
    await expect(
      page.getByText(shell[copy.code].activityError, { exact: true }),
    ).toBeVisible();
    await capture({
      page,
      info,
      name: `${copy.code}-confirmed-activity-failure`,
      focus: page.locator('#activity'),
    });
    await navigate({ page, code: copy.code, section: 'clients' });
    await expect(
      panel.getByText(copy.confirmed, { exact: true }),
    ).toBeVisible();
  });

  test(`keeps blocked, reversed, stale, denied and truly retired history safe in ${copy.code}`, async ({
    page,
  }, info) => {
    const state = await installHistoryLocalizationFixture({ page });
    state.detail = { ...historyDetail, canReverse: false };
    await page.addInitScript(
      (code) => localStorage.setItem('prisma-prim.interface-locale', code),
      copy.code,
    );
    await page.goto('/?frame=prisme#clients');
    let panel = await openDetail({ page, copy });
    await expect(panel.getByText(copy.blocked, { exact: true })).toBeVisible();
    await expect(panel.getByRole('form')).toHaveCount(0);
    await capture({
      page,
      info,
      name: `${copy.code}-blocked`,
      focus: panel.getByText(copy.blocked, { exact: true }),
    });
    await panel.getByRole('button', { name: copy.openCanonical }).click();
    await expect.poll(() => state.dossierReads).toEqual([historyFirst.id]);
    await expect(page.locator('#client-dossier-title')).toHaveText(
      historyFirst.displayName,
    );
    state.detail = {
      ...historyDetail,
      state: 'reversed',
      canReverse: false,
      reversal: {
        reason: '  Separat / раздельно\n{literal}  ',
        actor: { displayName: 'Reversing actor / Я' },
        occurredAt: '2026-01-28T01:15:00.000Z',
      },
    };
    panel = await openDetail({ page, copy });
    await expect(panel.getByRole('form')).toHaveCount(0);
    await expect(
      panel.getByRole('button', { name: copy.openCanonical }),
    ).toHaveCount(0);
    await expect(
      panel.getByText('Reversing actor / Я', { exact: false }),
    ).toBeVisible();
    await expect(panel.locator('time').nth(1)).toHaveAttribute(
      'datetime',
      '2026-01-28T01:15:00.000Z',
    );
    await expect(panel).toContainText('Separat / раздельно');
    expect(
      await panel
        .locator('.client-union-history-reversal > p')
        .nth(2)
        .textContent(),
    ).toBe('  Separat / раздельно\n{literal}  ');
    await capture({
      page,
      info,
      name: `${copy.code}-already-reversed`,
      focus: panel.locator('.client-union-history-reversal'),
    });
    await panel.getByRole('button', { name: copy.close }).click();
    state.detail = historyDetail;
    panel = await openDetail({ page, copy });
    let form = panel.getByRole('form', { name: copy.reverse });
    await form
      .getByRole('textbox', { name: copy.reason })
      .fill(historyReversalReason);
    await form.getByRole('checkbox').check();
    state.reverseReply = (route) => route.fulfill({ status: 409, json: {} });
    await form.getByRole('button', { name: copy.reverse, exact: true }).click();
    await expect(panel.getByRole('alert')).toHaveText(copy.stale);
    await expect(panel.getByRole('form')).toHaveCount(0);
    await expect(panel).not.toContainText(historyOriginalReason);
    await capture({
      page,
      info,
      name: `${copy.code}-stale`,
      focus: panel.getByRole('alert'),
    });
    state.detail = { ...historyDetail, canReverse: false };
    panel = await openDetail({ page, copy });
    await expect(panel.getByText(copy.blocked, { exact: true })).toBeVisible();
    await expect(panel.getByRole('form')).toHaveCount(0);
    await panel.getByRole('button', { name: copy.close }).click();
    state.detail = historyDetail;
    panel = await openDetail({ page, copy });
    form = panel.getByRole('form', { name: copy.reverse });
    await form
      .getByRole('textbox', { name: copy.reason })
      .fill(historyReversalReason);
    await form.getByRole('checkbox').check();
    state.reverseReply = (route) => route.fulfill({ status: 403, json: {} });
    await form.getByRole('button', { name: copy.reverse, exact: true }).click();
    await expect(panel.getByRole('alert')).toHaveText(copy.unavailable);
    await expect(panel.getByRole('form')).toHaveCount(0);
    await expect(panel).not.toContainText(historyOriginalReason);
    await expect(panel).not.toContainText('PRIVATE');
    await capture({
      page,
      info,
      name: `${copy.code}-denied`,
      focus: panel.getByRole('alert'),
    });

    let releaseDetail: (() => Promise<void>) | undefined;
    state.detailReply = (route) => {
      releaseDetail = () => route.fulfill({ json: historyDetail });
    };
    await discover({ page, copy });
    const previousDetailReads = state.detailReads;
    await panel.getByRole('button', { name: copy.details }).click();
    await expect.poll(() => state.detailReads).toBe(previousDetailReads + 1);
    const menu = page.getByRole('button', {
      name: shell[copy.code].openMenu,
      exact: true,
    });
    const needsNavigation = await menu.isVisible();
    if (needsNavigation) await menu.click();
    await selectOption(
      page.locator('#active-company-context'),
      historyCompanies[1].id,
    );
    await expect(page.locator('#active-company-context')).toHaveAttribute(
      'data-value',
      historyCompanies[1].id,
    );
    if (needsNavigation) {
      await page.locator('#active-company-context').focus();
      await page.keyboard.press('Escape');
      await expect(page.locator('#primary-navigation')).toHaveAttribute(
        'data-open',
        'false',
      );
    }
    if (!releaseDetail)
      throw new Error('Expected a pending old-Company detail.');
    await releaseDetail();
    panel = page.getByRole('region', { name: copy.title });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('form')).toHaveCount(0);
    await expect(panel.locator('.client-union-history-detail')).toHaveCount(0);
    await expect(panel).not.toContainText(historyOriginalReason);
    await capture({
      page,
      info,
      name: `${copy.code}-real-retirement`,
      focus: panel,
    });
    expect(state.commands).toHaveLength(2);
    expect(
      state.commands.every((command) => command.company === 'company-b-712'),
    ).toBe(true);
  });
}
