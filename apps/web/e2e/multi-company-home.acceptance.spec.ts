import { randomUUID } from 'node:crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
  type Request,
  type Route,
  type TestInfo,
} from '@playwright/test';
import { expectValue, selectOption } from './select-option';
import { enterClassicCompatibility } from './classic-compatibility';

type Scope = { companyId?: string; owner?: boolean };
type Company = { id: string; name: string };
type Assignment = { companyId: string; path: string };

function headers({ companyId, owner = false }: Scope = {}) {
  return {
    'x-test-external-provider': 'local-demo',
    'x-test-external-subject': owner
      ? 'workspace-owner'
      : 'local-demonstration-user',
    'x-test-display-name': owner ? 'Workspace Owner' : 'Ada Ionescu',
    'x-test-email': owner ? 'owner@example.test' : 'ada@example.test',
    ...(companyId ? { 'x-company-context-id': companyId } : {}),
  };
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a public API object');
  return Object.fromEntries(Object.entries(value));
}

function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('Expected public API text');
  return value;
}

function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Expected public API rows');
  const entries: unknown[] = value;
  return entries.map(object);
}

async function read(
  request: APIRequestContext,
  path: string,
  scope: Scope = {},
) {
  const response = await request.get(`/api${path}`, {
    headers: headers(scope),
  });
  expect(response.status()).toBe(200);
  const value: unknown = await response.json();
  return object(value);
}

async function command(
  request: APIRequestContext,
  path: string,
  value: unknown,
  scope: Scope = {},
) {
  const response = await request.post(`/api${path}`, {
    headers: { ...headers(scope), 'idempotency-key': randomUUID() },
    data: value,
  });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  return object(body);
}

function before(date: string, days: number): string {
  const instant = new Date(`${date}T12:00:00.000Z`);
  if (Number.isNaN(instant.getTime())) throw new Error('Invalid server date');
  instant.setUTCDate(instant.getUTCDate() - days);
  return instant.toISOString().slice(0, 10);
}

const assignments = [
  '/company-context-assignments',
  '/company-director-client-assignments',
  '/company-project-assignments',
  '/company-task-manager-assignments',
];

async function seed(request: APIRequestContext, suffix: string) {
  const memberId = text(
    (await read(request, '/access/current-actor')).workspaceMembershipId,
  );
  const granted: Assignment[] = [];
  async function company(label: string, contextOnly = false): Promise<Company> {
    const name = `${label} — Știință / Наука ${suffix}`;
    const id = text(
      (
        await command(
          request,
          '/companies',
          { displayName: name },
          { owner: true },
        )
      ).id,
    );
    for (const path of contextOnly ? assignments.slice(0, 1) : assignments) {
      await command(
        request,
        path,
        { companyId: id, workspaceMembershipId: memberId },
        { owner: true },
      );
      granted.push({ companyId: id, path });
    }
    return { id, name };
  }
  const a = await company('Summary A');
  const b = await company('Summary B');
  const contextOnly = await company('Summary context only', true);
  const empty = await company('Summary empty');

  const client = async (companyId: string, displayName: string) =>
    text(
      (await command(request, '/clients', { displayName }, { companyId })).id,
    );
  const sharedName = `Shared consolidated Client — Société ${suffix}`;
  const shared = await client(a.id, sharedName);
  const second = await client(a.id, `Primary local enterprise ${suffix}`);
  await client(a.id, `Primary distinct organization ${suffix}`);
  const bOnlyName = `Secondary independent organization ${suffix}`;
  await client(b.id, bOnlyName);
  const relation = await request.put(
    `/api/clients/${shared}/active-company-relationship`,
    {
      headers: {
        ...headers({ companyId: b.id, owner: true }),
        'idempotency-key': randomUUID(),
      },
    },
  );
  expect(relation.status()).toBe(200);
  async function project(
    companyId: string,
    clientAccountId: string,
    title: string,
  ) {
    return text(
      (
        await command(
          request,
          '/projects',
          { clientAccountId, title },
          { companyId },
        )
      ).id,
    );
  }
  const aProjectTitle = `Preparation A — Révision / Проверка ${suffix}`;
  const aProject = await project(a.id, shared, aProjectTitle);
  await project(a.id, second, `Preparation second ${suffix}`);
  const bProjectTitle = `Preparation B — Révision / Проверка ${suffix}`;
  const bProject = await project(b.id, shared, bProjectTitle);
  // Dates come from the owning server read, never from the browser's clock.
  const today = text(
    (await read(request, '/operational-home', { companyId: a.id })).today,
  );
  async function task(
    companyId: string,
    projectId: string,
    title: string,
    index: number,
  ) {
    return text(
      (
        await command(
          request,
          `/projects/${projectId}/tasks`,
          {
            title,
            dueDate: before(today, index + 3),
            assigneeMembershipId: index === 2 ? null : memberId,
          },
          { companyId },
        )
      ).id,
    );
  }
  for (let index = 0; index < 6; index++)
    await task(a.id, aProject, `Primary overdue ${index + 1} ${suffix}`, index);
  const bTaskTitle = `Secondary overdue — Dovadă / Доказательство ${suffix}`;
  const bTask = await task(b.id, bProject, bTaskTitle, 0);
  return {
    a,
    b,
    contextOnly,
    empty,
    bOnlyName,
    sharedName,
    aProject,
    aProjectTitle,
    bProjectTitle,
    bTaskTitle,
    bTask,
    memberId,
    granted,
  };
}

const locales = [
  {
    code: 'ro',
    name: 'Română',
    entry: 'Rezumatele tuturor Companiilor',
    clients: 'Clienți activi',
    projects: 'Proiecte deschise',
    tasks: 'Sarcini restante',
    cancel: 'Anulați',
    continue: 'Continuați',
  },
  {
    code: 'ru',
    name: 'Русский',
    entry: 'Сводки всех Компаний',
    clients: 'Активные Клиенты',
    projects: 'Открытые Проекты',
    tasks: 'Просроченные Задачи',
    cancel: 'Отмена',
    continue: 'Продолжить',
  },
  {
    code: 'fr',
    name: 'Français',
    entry: 'Résumés de toutes les Entreprises',
    clients: 'Clients actifs',
    projects: 'Projets ouverts',
    tasks: 'Tâches en retard',
    cancel: 'Annuler',
    continue: 'Continuer',
  },
  {
    code: 'en',
    name: 'English',
    entry: 'All Companies summaries',
    clients: 'Active Clients',
    projects: 'Open Projects',
    tasks: 'Overdue Tasks',
    cancel: 'Cancel',
    continue: 'Continue',
  },
];

function summary(region: Locator, label: string) {
  return region.getByRole('button').filter({ hasText: label });
}

function gate() {
  let complete: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => {
    complete = resolve;
  });
  return {
    promise,
    release() {
      if (!complete) throw new Error('Response gate was not initialized');
      complete();
    },
  };
}

async function chooseLanguage(page: Page, name: string) {
  const control = page.getByRole('combobox', {
    name: /^(?:Interface language|Limba interfeței|Язык интерфейса|Langue de l’interface)$/u,
  });
  await control.focus();
  await control.press('Enter');
  await page.getByRole('option', { name, exact: true }).click();
  await expect(control).toBeFocused();
}

async function selectWorkingCompany(
  page: Page,
  company: Company,
  narrow: boolean,
) {
  if (narrow)
    await page
      .getByRole('button', { name: 'Open navigation', exact: true })
      .click();
  const selector = page.getByLabel('Active Company', { exact: true });
  await selectOption(selector, { value: company.id });
  await expect(selector).toBeEnabled();
  await expectValue(selector, company.id);
  if (narrow)
    await page
      .getByRole('button', { name: 'Close navigation', exact: true })
      .click();
}

async function openView(page: Page, company: Company) {
  // Fence the initial discovery and qualification/read before any later locale
  // or Cancel no-I/O snapshot. A mounted row or temporarily empty pending set
  // alone cannot prove that the first request has started.
  const discovered = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === '/api/companies',
  );
  const qualified = page.waitForRequest(
    (request) =>
      request.method() === 'GET' &&
      new URL(request.url()).pathname === '/api/access/current-actor' &&
      request.headers()['x-company-context-id'] === company.id,
  );
  const loaded = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === '/api/operational-home' &&
      response.request().headers()['x-company-context-id'] === company.id,
  );
  const entry = page.getByRole('button', {
    name: 'All Companies summaries',
    exact: true,
  });
  await entry.focus();
  await entry.press('Enter');
  expect((await discovered).status()).toBe(200);
  await qualified;
  expect((await loaded).status()).toBe(200);
  const region = page.getByRole('region', {
    name: 'All Companies summaries',
    exact: true,
  });
  await expect(
    region.getByRole('region', { name: company.name, exact: true }),
  ).toBeVisible();
  // Every discovered candidate is shown as qualifying/loading until its own
  // finite pipeline settles, including a Company that will then be omitted.
  await expect(region.getByRole('status')).toHaveCount(0);
  return region;
}

async function screenshot(
  page: Page,
  region: Locator,
  testInfo: TestInfo,
  name: string,
) {
  await region.scrollIntoViewIfNeeded();
  await page.evaluate(async () => document.fonts.ready);
  await expect(region).toBeInViewport();
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
  await page.screenshot({ path: testInfo.outputPath(name) });
}

test('uses independently authorized PostgreSQL Company summaries, four locales and exact existing destinations', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? '390' : '1440';
  const fixture = await seed(request, suffix);
  const pending = new Set<Request>();
  const calls: string[] = [];
  page.on('request', (entry) => {
    const url = new URL(entry.url());
    if (!url.pathname.startsWith('/api/')) return;
    pending.add(entry);
    calls.push(
      `${entry.method()} ${url.pathname}${url.search} @${entry.headers()['x-company-context-id'] ?? ''}`,
    );
  });
  page.on('requestfinished', (entry) => pending.delete(entry));
  page.on('requestfailed', (entry) => pending.delete(entry));
  async function revoke(assignment: Assignment) {
    const response = await request.delete(
      `/api${assignment.path}/${fixture.memberId}/${assignment.companyId}`,
      {
        headers: {
          ...headers({ owner: true }),
          'idempotency-key': randomUUID(),
        },
      },
    );
    expect(response.status()).toBe(200);
    const index = fixture.granted.indexOf(assignment);
    if (index !== -1) fixture.granted.splice(index, 1);
  }
  try {
    for (const [company, expected] of [
      [fixture.a, [3, 2, 6]],
      [fixture.b, [2, 1, 1]],
      [fixture.empty, [0, 0, 0]],
    ] satisfies [Company, number[]][]) {
      const result = await read(request, '/operational-home', {
        companyId: company.id,
      });
      expect(result.companyId).toBe(company.id);
      expect(rows(result.summaries)).toEqual([
        { kind: 'active_clients', count: expected[0] },
        { kind: 'open_projects', count: expected[1] },
        { kind: 'overdue_tasks', count: expected[2] },
      ]);
    }
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Hello, Ada Ionescu.' }),
    ).toBeVisible();
    await selectWorkingCompany(page, fixture.a, narrow);
    const beforeEvents = rows(
      (await read(request, '/activity-log', { companyId: fixture.a.id }))
        .events,
    );
    const consolidated = await openView(page, fixture.b);
    const aRow = consolidated.getByRole('region', {
      name: fixture.a.name,
      exact: true,
    });
    const bRow = consolidated.getByRole('region', {
      name: fixture.b.name,
      exact: true,
    });
    const emptyRow = consolidated.getByRole('region', {
      name: fixture.empty.name,
      exact: true,
    });
    await expect(
      summary(aRow, 'Active Clients').getByText('3', { exact: true }),
    ).toBeVisible();
    await expect(
      summary(aRow, 'Open Projects').getByText('2', { exact: true }),
    ).toBeVisible();
    await expect(
      summary(aRow, 'Overdue Tasks').getByText('6', { exact: true }),
    ).toBeVisible();
    await expect(
      summary(bRow, 'Active Clients').getByText('2', { exact: true }),
    ).toBeVisible();
    await expect(
      summary(bRow, 'Open Projects').getByText('1', { exact: true }),
    ).toBeVisible();
    await expect(
      summary(bRow, 'Overdue Tasks').getByText('1', { exact: true }),
    ).toBeVisible();
    await expect(emptyRow.getByText('0', { exact: true })).toHaveCount(3);
    await expect(
      consolidated.getByRole('region', {
        name: fixture.contextOnly.name,
        exact: true,
      }),
    ).toHaveCount(0);
    const selector = page.getByLabel('Active Company', { exact: true });
    await expectValue(selector, fixture.a.id);
    await expect.poll(() => pending.size).toBe(0);
    const originalB = await bRow.elementHandle();
    if (!originalB) throw new Error('Expected the mounted literal Company row');
    const beforeLocales = [...calls];
    const initialUrl = page.url();
    for (const locale of locales) {
      await chooseLanguage(page, locale.name);
      const region = page.getByRole('region', {
        name: locale.entry,
        exact: true,
      });
      const row = region.getByRole('region', {
        name: fixture.b.name,
        exact: true,
      });
      expect(await originalB.evaluate((element) => element.isConnected)).toBe(
        true,
      );
      await expect(
        summary(row, locale.clients).getByText('2', { exact: true }),
      ).toBeVisible();
      await expect(
        summary(row, locale.projects).getByText('1', { exact: true }),
      ).toBeVisible();
      await expect(
        summary(row, locale.tasks).getByText('1', { exact: true }),
      ).toBeVisible();
      expect(calls).toEqual(beforeLocales);
      expect(page.url()).toBe(initialUrl);
      await screenshot(
        page,
        row,
        testInfo,
        `multi-company-${suffix}-${locale.code}-row.png`,
      );
      const action = summary(row, locale.clients);
      await action.focus();
      await action.press('Enter');
      const confirmation = page.getByRole('dialog');
      await expect(confirmation).toContainText(fixture.b.name);
      await expect(
        confirmation.getByRole('button', {
          name: locale.continue,
          exact: true,
        }),
      ).toBeVisible();
      await screenshot(
        page,
        confirmation,
        testInfo,
        `multi-company-${suffix}-${locale.code}-confirmation.png`,
      );
      await confirmation
        .getByRole('button', { name: locale.cancel, exact: true })
        .click();
      await expect(confirmation).toHaveCount(0);
      await expect(action).toBeFocused();
      expect(calls).toEqual(beforeLocales);
      expect(page.url()).toBe(initialUrl);
    }
    expect(
      rows(
        (await read(request, '/activity-log', { companyId: fixture.a.id }))
          .events,
      ),
    ).toEqual(beforeEvents);

    // Classic keeps the ordinary native owners alongside Home. Hold the real
    // Task creation response after PostgreSQL commits while a separate Client
    // registration draft stays open. Opening/staging/Cancel must reset neither.
    await enterClassicCompatibility(page);
    const clients = page.locator('.client-workspace');
    const clientDraft = `Independent registration — Brouillon ${suffix}`;
    await clients
      .getByLabel('Client display name', { exact: true })
      .fill(clientDraft);
    const projects = page.locator('.project-workspace');
    await projects
      .getByRole('list', { name: 'Projects', exact: true })
      .getByRole('button')
      .filter({ hasText: fixture.aProjectTitle })
      .click();
    const tasks = projects.locator('.project-tasks');
    const pendingTaskTitle = `Independent undated command — Черновик ${suffix}`;
    await tasks
      .getByLabel('Task title', { exact: true })
      .fill(pendingTaskTitle);
    await expect.poll(() => pending.size).toBe(0);
    const committed = gate();
    const release = gate();
    const writes: { body: string | null; key: string | undefined }[] = [];
    const taskPath = `**/api/projects/${fixture.aProject}/tasks`;
    const hold = async (route: Route) => {
      if (route.request().method() !== 'POST') return route.continue();
      writes.push({
        body: route.request().postData(),
        key: route.request().headers()['idempotency-key'],
      });
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      committed.release();
      await release.promise;
      await route.fulfill({ response });
    };
    await page.route(taskPath, hold);
    try {
      await tasks
        .getByRole('button', { name: 'Create Task', exact: true })
        .click();
      await committed.promise;
      await expect(
        tasks.getByRole('button', { name: 'Create Task', exact: true }),
      ).toBeDisabled();
      const independentView = await openView(page, fixture.b);
      await expect.poll(() => pending.size).toBe(1);
      const beforeCancel = [...calls];
      const originalWrite = [...writes];
      await summary(
        independentView.getByRole('region', {
          name: fixture.b.name,
          exact: true,
        }),
        'Open Projects',
      ).click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Cancel', exact: true })
        .click();
      expect(calls).toEqual(beforeCancel);
      expect(writes).toEqual(originalWrite);
      expect(writes).toHaveLength(1);
      expect(writes[0]?.key).toBeTruthy();
      await expect(
        clients.getByLabel('Client display name', { exact: true }),
      ).toHaveValue(clientDraft);
      await expect(tasks.getByLabel('Task title', { exact: true })).toHaveValue(
        pendingTaskTitle,
      );
      await expect(
        tasks.getByRole('button', { name: 'Create Task', exact: true }),
      ).toBeDisabled();
      await expectValue(
        page.getByLabel('Active Company', { exact: true }),
        fixture.a.id,
      );
      release.release();
      await expect(
        tasks.getByRole('heading', { name: pendingTaskTitle, exact: true }),
      ).toBeVisible();
      await expect(
        clients.getByLabel('Client display name', { exact: true }),
      ).toHaveValue(clientDraft);
      expect(writes).toHaveLength(1);
    } finally {
      release.release();
      await page.unroute(taskPath, hold);
    }

    // Each Continue uses the real selection owner and then the existing native
    // destination's read. The shared Client appears in both independent sets.
    for (const destination of [
      { label: 'Active Clients', path: '/api/clients', hash: '#clients' },
      { label: 'Open Projects', path: '/api/projects', hash: '#projects' },
      { label: 'Overdue Tasks', path: '/api/overdue-tasks', hash: '#overview' },
    ]) {
      await page.goto('/');
      await selectWorkingCompany(page, fixture.a, narrow);
      const region = await openView(page, fixture.b);
      await summary(
        region.getByRole('region', { name: fixture.b.name, exact: true }),
        destination.label,
      ).click();
      const response = page.waitForResponse(
        (entry) =>
          entry.request().method() === 'GET' &&
          new URL(entry.url()).pathname === destination.path &&
          entry.request().headers()['x-company-context-id'] === fixture.b.id,
      );
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Continue', exact: true })
        .click();
      expect((await response).status()).toBe(200);
      await expectValue(
        page.getByLabel('Active Company', { exact: true }),
        fixture.b.id,
      );
      await expect.poll(() => new URL(page.url()).hash).toBe(destination.hash);
      if (destination.hash === '#clients') {
        await expect(page.locator('.client-workspace')).toContainText(
          fixture.sharedName,
        );
        await expect(page.locator('.client-workspace')).toContainText(
          fixture.bOnlyName,
        );
      } else if (destination.hash === '#projects')
        await expect(page.locator('.project-workspace')).toContainText(
          fixture.bProjectTitle,
        );
      else {
        const overdue = page.getByRole('region', {
          name: `Overdue Tasks in ${fixture.b.name}`,
          exact: true,
        });
        await expect(overdue).toContainText(fixture.bTaskTitle);
        await expect(
          overdue.getByRole('button', { name: 'Next page', exact: true }),
        ).toBeDisabled();
      }
    }

    // A genuine current server denial must retire Company context according to
    // its existing owner; Cancel's preservation is not a promise to restore A.
    await page.goto('/');
    await selectWorkingCompany(page, fixture.a, narrow);
    const lastView = await openView(page, fixture.b);
    await summary(
      lastView.getByRole('region', { name: fixture.b.name, exact: true }),
      'Open Projects',
    ).click();
    // Company access is additive: the Client and Project bundles can still
    // authorize context after its dedicated context bundle is revoked. Remove
    // every independently seeded B grant to create the actual denied state.
    const bGrants = fixture.granted.filter(
      (entry) => entry.companyId === fixture.b.id,
    );
    expect(bGrants).toHaveLength(4);
    for (const grant of bGrants) await revoke(grant);
    expect(
      (
        await request.get('/api/access/current-actor', {
          headers: headers({ companyId: fixture.b.id }),
        })
      ).status(),
    ).toBe(403);
    const refused = page.waitForResponse(
      (entry) =>
        new URL(entry.url()).pathname === '/api/access/current-actor' &&
        entry.request().headers()['x-company-context-id'] === fixture.b.id,
    );
    const beforeDenialUrl = page.url();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Continue', exact: true })
      .click();
    expect((await refused).status()).toBe(403);
    await expectValue(page.getByLabel('Active Company', { exact: true }), '');
    expect(page.url()).toBe(beforeDenialUrl);
    await expect(
      page.getByRole('region', {
        name: 'All Companies summaries',
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(page.locator('.project-workspace')).toHaveCount(0);
  } finally {
    for (const grant of [...fixture.granted].reverse()) await revoke(grant);
  }
});
