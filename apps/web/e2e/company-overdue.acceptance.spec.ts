import {
  expect,
  type Page,
  type Response,
  type Request,
  type Locator,
} from '@playwright/test';
import { test } from './company-overdue.acceptance.fixture';
import { selectOption } from './select-option';

const locales = [
  {
    code: 'ro',
    name: 'Română',
    summary: 'Sarcini restante',
    pageLabel: 'Sarcinile restante',
    separator: ': ',
    destination: 'Afișați Sarcinile restante',
    panel: 'Sarcini restante în',
    of: 'din',
    next: 'Pagina următoare',
    previous: 'Pagina anterioară',
    refresh: 'Actualizați de la început',
    close: 'Închideți Sarcinile restante',
    date: '1 mai 2026',
  },
  {
    code: 'ru',
    name: 'Русский',
    summary: 'Просроченные Задачи',
    pageLabel: 'Просроченные Задачи',
    separator: ': ',
    destination: 'Показать просроченные Задачи',
    panel: 'Просроченные Задачи в',
    of: 'из',
    next: 'Следующая страница',
    previous: 'Предыдущая страница',
    refresh: 'Обновить с начала',
    close: 'Закрыть просроченные Задачи',
    date: '1 мая 2026 г.',
  },
  {
    code: 'fr',
    name: 'Français',
    summary: 'Tâches en retard',
    pageLabel: 'Tâches en retard',
    separator: ' : ',
    destination: 'Afficher les Tâches en retard',
    panel: 'Tâches en retard dans',
    of: 'sur',
    next: 'Page suivante',
    previous: 'Page précédente',
    refresh: 'Actualiser depuis le début',
    close: 'Fermer les Tâches en retard',
    date: '1 mai 2026',
  },
  {
    code: 'en',
    name: 'English',
    summary: 'Overdue Tasks',
    pageLabel: 'Overdue Tasks',
    separator: ': ',
    destination: 'Show the overdue Tasks',
    panel: 'Overdue Tasks in',
    of: 'of',
    next: 'Next page',
    previous: 'Previous page',
    refresh: 'Refresh from the start',
    close: 'Close the overdue Tasks',
    date: 'May 1, 2026',
  },
];
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a public API object');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected public API text');
  return value;
}
function gate() {
  let release: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    promise,
    release() {
      if (!release) throw new Error('Response gate is not initialized');
      release();
    },
  };
}
async function chooseLanguage(page: Page, name: string) {
  const selector = page.getByRole('combobox', {
    name: /^(?:Interface language|Limba interfeței|Язык интерфейса|Langue de l’interface)$/u,
  });
  await selector.focus();
  await selector.press('Enter');
  await page.getByRole('option', { name, exact: true }).click();
  await expect(selector).toBeFocused();
}
async function fit(page: Page, region: Locator) {
  await expect(region).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await region.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
}
async function readPage(
  response: Response,
  companyId: string,
  offset: number,
  expectedIds: string[],
) {
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  const value = object(body);
  expect(value).toMatchObject({
    companyId,
    today: '2026-09-27',
    total: 107,
    offset,
    pageSize: 25,
  });
  if (!Array.isArray(value.tasks))
    throw new Error('Expected a bounded public Task page');
  const ids = value.tasks.map((row: unknown) => text(object(row).id));
  expect(ids).toEqual(expectedIds);
  expect(ids.length).toBeLessThanOrEqual(25);
  return ids;
}
for (const locale of locales) {
  test(`browses exact107 Company overdue Tasks in Prisme ${locale.code} with live PostgreSQL`, async ({
    page,
    companyOverdue: fixture,
  }, testInfo) => {
    // The measured first run spends 13–18s seeding the real 107-row fixture,
    // then exercises ten page reads, locale continuity and three screenshots.
    test.setTimeout(60_000);
    const calls: string[] = [];
    const pending = new Set<Request>();
    page.on('request', (request) => {
      const url = new URL(request.url());
      if (url.pathname.startsWith('/api/')) {
        calls.push(`${request.method()} ${url.pathname}${url.search}`);
        pending.add(request);
      }
    });
    page.on('requestfinished', (request) => pending.delete(request));
    page.on('requestfailed', (request) => pending.delete(request));
    const offsets = () =>
      calls.filter((call) => call.startsWith('GET /api/overdue-tasks?'));
    const responseAt = (offset: number) =>
      page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === 'GET' &&
          url.pathname === '/api/overdue-tasks' &&
          url.searchParams.get('offset') === String(offset)
        );
      });
    const expectedIds = (offset: number) =>
      fixture.tasks.slice(offset, offset + 25).map((task) => task.id);
    await page.addInitScript(() =>
      localStorage.setItem('prisma-prim.interface-locale', 'en'),
    );
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Hello, Ada Ionescu.' }),
    ).toBeVisible();
    const narrow = testInfo.project.name.endsWith('narrow');
    if (narrow)
      await page
        .getByRole('button', { name: 'Open navigation', exact: true })
        .click();
    const homeResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/operational-home' &&
        response.request().headers()['x-company-context-id'] ===
          fixture.companyId,
    );
    await selectOption(page.getByLabel('Active Company', { exact: true }), {
      label: fixture.companyName,
    });
    await expect(page.getByLabel('Active Company', { exact: true })).toHaveText(
      fixture.companyName,
    );
    if (narrow)
      await page
        .getByRole('button', { name: 'Close navigation', exact: true })
        .click();
    const summary: unknown = await (await homeResponse).json();
    expect(object(summary).summaries).toContainEqual({
      kind: 'overdue_tasks',
      count: 107,
    });
    await expect(
      page.getByRole('button', {
        name: 'Overdue Tasks: 107. Show the overdue Tasks',
        exact: true,
      }),
    ).toBeVisible();
    if (locale.code !== 'en') await chooseLanguage(page, locale.name);
    await expect(page.locator('.prisme-shell')).toBeVisible();
    const trigger = page.getByRole('button', {
      name: `${locale.summary}${locale.separator}107. ${locale.destination}`,
      exact: true,
    });
    const panel = () =>
      page.getByRole('region', {
        name: `${locale.panel} ${fixture.companyName}`,
        exact: true,
      });
    const visiblePage = async (offset: number) => {
      const expected = fixture.tasks.slice(offset, offset + 25);
      await expect(panel().getByRole('listitem')).toHaveCount(expected.length);
      await expect(panel().getByRole('heading', { level: 4 })).toHaveText(
        expected.map((task) => task.title),
      );
      await expect(panel()).toContainText(
        `${locale.pageLabel} ${offset + 1}–${offset + expected.length} ${locale.of} 107.`,
      );
    };
    const open = async () => {
      const response = responseAt(0);
      await trigger.focus();
      await trigger.press('Enter');
      await readPage(await response, fixture.companyId, 0, expectedIds(0));
      await visiblePage(0);
    };
    await open();
    await expect(panel().getByRole('heading', { level: 3 })).toBeFocused();
    await expect(
      panel().getByRole('button', { name: locale.previous, exact: true }),
    ).toBeDisabled();
    await expect(panel().locator('time').first()).toHaveAttribute(
      'datetime',
      '2026-05-01',
    );
    await expect(panel().locator('time').first()).toHaveText(locale.date);
    await panel()
      .getByRole('button', { name: locale.close, exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(panel()).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await open();
    const release = gate();
    let fetched = false;
    let hold = true;
    const pattern = (url: URL) =>
      url.pathname === '/api/overdue-tasks' &&
      url.searchParams.get('offset') === '25';
    await page.route(pattern, async (route) => {
      if (!hold) {
        await route.continue();
        return;
      }
      hold = false;
      const upstream = await route.fetch();
      fetched = true;
      await release.promise;
      await route.fulfill({ response: upstream });
    });
    try {
      const nextResponse = responseAt(25);
      await panel()
        .getByRole('button', { name: locale.next, exact: true })
        .focus();
      await page.keyboard.press('Enter');
      await expect.poll(() => fetched).toBe(true);
      await expect(panel()).toHaveAttribute('aria-busy', 'true');
      const alternate = locales.find(
        (candidate) => candidate.code === (locale.code === 'fr' ? 'en' : 'fr'),
      );
      if (!alternate) throw new Error('Expected alternate interface locale');
      const beforeLocale = calls.length;
      const urlBeforeLocale = page.url();
      await chooseLanguage(page, alternate.name);
      expect(calls).toHaveLength(beforeLocale);
      const translatedPanel = page.getByRole('region', {
        name: `${alternate.panel} ${fixture.companyName}`,
        exact: true,
      });
      await expect(translatedPanel).toHaveAttribute('aria-busy', 'true');
      release.release();
      await readPage(
        await nextResponse,
        fixture.companyId,
        25,
        expectedIds(25),
      );
      await expect(translatedPanel.getByRole('listitem')).toHaveCount(25);
      await expect(translatedPanel).toContainText(
        `${alternate.pageLabel} 26–50 ${alternate.of} 107.`,
      );
      const firstRow = await translatedPanel
        .getByRole('listitem')
        .first()
        .elementHandle();
      if (!firstRow) throw new Error('Expected current second-page row');
      await expect.poll(() => pending.size).toBe(0);
      const beforeLoadedLocale = calls.length;
      await chooseLanguage(page, locale.name);
      expect(calls).toHaveLength(beforeLoadedLocale);
      expect(page.url()).toBe(urlBeforeLocale);
      expect(
        await panel()
          .getByRole('listitem')
          .first()
          .evaluate((node, previous) => node === previous, firstRow),
      ).toBe(true);
      await visiblePage(25);
      // Exercise each navigation intent before an independent complete traversal.
      let response = responseAt(0);
      await panel()
        .getByRole('button', { name: locale.previous, exact: true })
        .click();
      await readPage(await response, fixture.companyId, 0, expectedIds(0));
      await visiblePage(0);
      response = responseAt(25);
      await panel()
        .getByRole('button', { name: locale.next, exact: true })
        .click();
      await readPage(await response, fixture.companyId, 25, expectedIds(25));
      await visiblePage(25);
      response = responseAt(0);
      await panel()
        .getByRole('button', { name: locale.refresh, exact: true })
        .click();
      const seen = await readPage(
        await response,
        fixture.companyId,
        0,
        expectedIds(0),
      );
      await visiblePage(0);
      await fit(page, panel());
      await panel().screenshot({
        path: testInfo.outputPath(`overdue-${locale.code}-first-page.png`),
      });
      for (const offset of [25, 50, 75, 100]) {
        response = responseAt(offset);
        await panel()
          .getByRole('button', { name: locale.next, exact: true })
          .focus();
        await page.keyboard.press('Enter');
        seen.push(
          ...(await readPage(
            await response,
            fixture.companyId,
            offset,
            expectedIds(offset),
          )),
        );
        await visiblePage(offset);
      }
      expect(seen).toEqual(fixture.tasks.map((task) => task.id));
      expect(new Set(seen).size).toBe(107);
      await expect(panel()).toContainText(
        `${locale.pageLabel} 101–107 ${locale.of} 107.`,
      );
      await expect(
        panel().getByRole('button', { name: locale.next, exact: true }),
      ).toBeDisabled();
      await expect(
        panel().getByRole('button', { name: locale.previous, exact: true }),
      ).toBeEnabled();
      await expect(
        panel().getByText(fixture.hiddenTitle, { exact: true }),
      ).toHaveCount(0);
      await expect(panel()).toContainText(fixture.projectTitle);
      await expect(panel()).toContainText(fixture.clientLabel);
      expect(offsets()).toEqual(
        [0, 0, 25, 0, 25, 0, 25, 50, 75, 100].map(
          (offset) => `GET /api/overdue-tasks?offset=${offset}`,
        ),
      );
      await fit(page, panel());
      await panel().screenshot({
        path: testInfo.outputPath(`overdue-${locale.code}-last-page.png`),
      });
      const last = fixture.tasks[106];
      if (!last) throw new Error('Expected the107th fixture Task');
      const row = panel()
        .getByRole('listitem')
        .filter({
          has: page.getByRole('heading', { name: last.title, exact: true }),
        });
      const detail = page.waitForResponse(
        (result) => new URL(result.url()).pathname === `/api/tasks/${last.id}`,
      );
      await row.getByRole('button').click();
      expect((await detail).status()).toBe(200);
      const tasks = page.locator('.project-tasks');
      const openedTask = tasks.getByRole('heading', {
        name: last.title,
        exact: true,
      });
      await expect(openedTask).toBeVisible();
      await expect(openedTask).toBeFocused();
      await expect(openedTask).toBeInViewport();
      await expect(
        tasks.locator(`time[datetime="${last.dueDate}"]`).first(),
      ).toBeVisible();
      expect(page.url()).not.toContain(last.id);
      expect(page.url()).not.toContain(fixture.projectId);
      await fit(page, tasks);
      await page.screenshot({
        path: testInfo.outputPath(`overdue-${locale.code}-exact-task.png`),
      });
    } finally {
      release.release();
      await page.unroute(pattern);
    }
  });
}
