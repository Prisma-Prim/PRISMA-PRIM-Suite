import { expect, test, type Locator, type Page } from '@playwright/test';

// Public App composition with HTTP boundary doubles; not live Clerk/PG evidence.
test.use({ timezoneId: 'America/New_York' });
const locales = [
  {
    code: 'ro',
    name: 'Română',
    title: 'Modificări recente',
    refresh: 'Actualizați modificările recente',
    retry: 'Reîncercați încărcarea modificărilor recente',
    error:
      'Modificările recente nu sunt disponibile. Nu se afișează evenimente.',
    open: 'Deschideți întregul Jurnal de activitate',
    activity: 'Jurnal de activitate',
    time: '19 oct. 2026, 06:06',
  },
  {
    code: 'ru',
    name: 'Русский',
    title: 'Последние изменения',
    refresh: 'Обновить последние изменения',
    retry: 'Повторить загрузку последних изменений',
    error: 'Последние изменения недоступны. События не показаны.',
    open: 'Открыть полный Журнал действий',
    activity: 'Журнал действий',
    time: '19 окт. 2026 г., 06:06',
  },
  {
    code: 'fr',
    name: 'Français',
    title: 'Changements récents',
    refresh: 'Actualiser les changements récents',
    retry: 'Réessayer le chargement des changements récents',
    error:
      'Les changements récents sont indisponibles. Aucun événement n’est affiché.',
    open: 'Ouvrir le journal d’activité complet',
    activity: 'Journal d’activité',
    time: '19 oct. 2026, 06:06',
  },
  {
    code: 'en',
    name: 'English',
    title: 'Recent changes',
    refresh: 'Refresh recent changes',
    retry: 'Retry loading recent changes',
    error: 'Recent changes are unavailable. No events are shown.',
    open: 'Open full Activity Log',
    activity: 'Activity Log',
    time: 'Oct 19, 2026, 6:06 AM',
  },
];
const company = {
  id: 'company-recent',
  displayName: 'PRISMA-PRIM — Société / Компания / Știință',
};
const datedEvents = [
  ['first', '2026-10-19T10:06:00.000Z'],
  ['second', '2026-10-19T10:05:00.000Z'],
  ['third', '2026-10-19T10:04:00.000Z'],
  ['fourth', '2026-10-19T10:03:00.000Z'],
  ['fifth', '2026-10-19T10:02:00.000Z'],
  ['sixth', '2026-10-19T10:01:00.000Z'],
].map(([label, occurredAt]) => ({
  id: `event-${label}`,
  action: 'company.registered',
  occurredAt,
  actor: {
    internalUserId: 'ada',
    displayName: 'Ada {literal} — Știință / Имя',
  },
  target: {
    type: 'company',
    companyId: `company-${label}`,
    displayName: `Company ${label} — Société / Компания / Știință — {original}`,
  },
}));
const undatedEvent = {
  action: 'client.union_confirmed',
  projectionReference: 'union-undated-recent',
  companyId: company.id,
  actor: { kind: 'authorized_resolver' },
  target: {
    type: 'client_union_operation',
    projectionReference: 'union-undated-recent',
    companyId: company.id,
  },
};

async function chooseLanguage(page: Page, name: string) {
  const selector = page.getByRole('combobox', {
    name: /^(?:Interface language|Limba interfeței|Язык интерфейса|Langue de l’interface)$/u,
  });
  await selector.focus();
  await selector.press('Enter');
  const option = page.getByRole('option', { name, exact: true });
  await option.focus();
  await option.press('Enter');
  await expect(selector).toBeFocused();
}
async function expectFit(page: Page, recent: Locator) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('Expected a named viewport.');
  for (const button of await recent.getByRole('button').all()) {
    const bounds = await button.boundingBox();
    if (bounds === null) throw new Error('Expected a visible action.');
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  }
}

for (const locale of locales) {
  test(`reads, changes locale, retries and opens full recent Activity with keyboard in ${locale.code}`, async ({
    page,
  }, testInfo) => {
    let activityStatus = 200;
    const requests: Array<{ path: string; method: string }> = [];
    await page.addInitScript(
      ({ code }) => localStorage.setItem('prisma-prim.interface-locale', code),
      { code: locale.code },
    );
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      requests.push({ path, method: request.method() });
      if (path === '/api/activity-log') {
        await route.fulfill(
          activityStatus === 200
            ? { json: { events: [...datedEvents, undatedEvent] } }
            : { status: activityStatus, body: '' },
        );
        return;
      }
      const body: unknown =
        path === '/api/access/current-actor'
          ? {
              internalUserId: 'ada',
              workspaceMembershipId: 'membership-ada',
              workspaceId: 'workspace-recent',
              workspaceName: 'Workspace',
              displayName: 'Ada',
              email: 'ada@example.test',
              active: true,
              workspacePermissions: ['company.manage'],
              activeCompany: { ...company, clientPermissions: ['client.read'] },
            }
          : path === '/api/companies'
            ? [company]
            : path === '/api/operational-home'
              ? {
                  companyId: company.id,
                  today: '2026-10-19',
                  summaries: [{ kind: 'active_clients', count: 0 }],
                }
              : path === '/api/client-duplicate-reviews'
                ? { items: [], next_cursor: null }
                : path === '/api/clients' || path === '/api/clients/search'
                  ? []
                  : undefined;
      if (body === undefined) await route.fulfill({ status: 404, body: '' });
      else await route.fulfill({ json: body });
    });
    await page.goto('/');
    const recent = page.getByRole('region', {
      name: locale.title,
      exact: true,
    });
    await expect(recent.getByRole('listitem')).toHaveCount(5);
    await expect(recent.locator('time').first()).toHaveAttribute(
      'datetime',
      '2026-10-19T10:06:00.000Z',
    );
    expect(
      await recent
        .locator('time')
        .evaluateAll((times) =>
          times.map((time) => time.getAttribute('datetime')),
        ),
    ).toEqual([
      '2026-10-19T10:06:00.000Z',
      '2026-10-19T10:05:00.000Z',
      '2026-10-19T10:04:00.000Z',
      '2026-10-19T10:03:00.000Z',
      '2026-10-19T10:02:00.000Z',
    ]);
    await expect(recent.locator('time').first()).toHaveText(locale.time);
    await expect(recent).not.toContainText('Company sixth');
    await expect(recent).not.toContainText('union-undated-recent');
    await expect(recent).not.toContainText('authorized_resolver');
    await expectFit(page, recent);
    const firstRow = await recent.getByRole('listitem').first().elementHandle();
    if (firstRow === null) throw new Error('Expected the first recent event.');
    const readCount = requests.length;
    const url = page.url();
    const alternate = locale.code === 'fr' ? 'English' : 'Français';
    await chooseLanguage(page, alternate);
    await chooseLanguage(page, locale.name);
    expect(await firstRow.evaluate((row) => row.isConnected)).toBe(true);
    expect(
      await recent
        .getByRole('listitem')
        .first()
        .evaluate((row, original) => row === original, firstRow),
    ).toBe(true);
    expect(requests).toHaveLength(readCount);
    expect(page.url()).toBe(url);
    await recent.screenshot({
      path: testInfo.outputPath(`recent-changes-${locale.code}-ready.png`),
    });

    activityStatus = 503;
    await recent
      .getByRole('button', { name: locale.refresh, exact: true })
      .click();
    await expect(recent.getByRole('alert')).toHaveText(locale.error);
    await expect(recent.getByRole('listitem')).toHaveCount(0);
    await expectFit(page, recent);
    await recent.screenshot({
      path: testInfo.outputPath(`recent-changes-${locale.code}-error.png`),
    });
    activityStatus = 200;
    await recent
      .getByRole('button', { name: locale.retry, exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(recent.getByRole('listitem')).toHaveCount(5);
    expect(
      requests.filter(({ path }) => path === '/api/activity-log'),
    ).toHaveLength(3);
    expect(requests.every(({ method }) => method === 'GET')).toBe(true);
    const full = recent.getByRole('button', { name: locale.open, exact: true });
    await full.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#activity$/u);
    const ledger = page.getByRole('region', {
      name: locale.activity,
      exact: true,
    });
    await expect(ledger).toBeVisible();
    await expect(ledger.getByRole('listitem')).toHaveCount(7);
    await expect(page.locator('#activity')).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}
