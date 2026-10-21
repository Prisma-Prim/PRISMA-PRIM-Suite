import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type Locator,
} from '@playwright/test';
import { selectOption } from './select-option';

type Identity = 'workspace-owner' | 'local-demonstration-user';
function headers({
  companyId,
  subject = 'local-demonstration-user',
}: { companyId?: string; subject?: Identity } = {}) {
  return {
    'x-test-external-provider': 'local-demo',
    'x-test-external-subject': subject,
    'x-test-display-name':
      subject === 'workspace-owner' ? 'Workspace Owner' : 'Ada Ionescu',
    'x-test-email':
      subject === 'workspace-owner' ? 'owner@example.test' : 'ada@example.test',
    ...(companyId ? { 'x-company-context-id': companyId } : {}),
  };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an API object');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected API text');
  return value;
}
async function read(
  request: APIRequestContext,
  path: string,
  scope: Parameters<typeof headers>[0] = {},
) {
  const response = await request.get(`/api${path}`, {
    headers: headers(scope),
  });
  expect(response.status()).toBe(200);
  const body: unknown = await response.json();
  return object(body);
}
async function command(
  request: APIRequestContext,
  path: string,
  value: unknown,
  scope: Parameters<typeof headers>[0] = {},
) {
  const response = await request.post(`/api${path}`, {
    headers: { ...headers(scope), 'idempotency-key': randomUUID() },
    data: value,
  });
  expect(response.status()).toBe(201);
  const body: unknown = await response.json();
  return object(body);
}
async function fit(page: Page, region?: Locator) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  if (region)
    expect(
      await region.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
}

async function frameEvidence({
  page,
  subject,
}: {
  page: Page;
  subject: Locator;
}) {
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await subject.evaluate((element) =>
    element.scrollIntoView({ block: 'start', inline: 'nearest' }),
  );
  await expect(subject).toBeInViewport();
}

const locales = [
  {
    code: 'ro',
    title: 'Toate Sarcinile care necesită atenția mea',
    previous: 'Pagina anterioară',
    next: 'Pagina următoare',
    close: 'Închideți toate Sarcinile care necesită atenție',
  },
  {
    code: 'ru',
    title: 'Все Задачи, требующие моего внимания',
    previous: 'Предыдущая страница',
    next: 'Следующая страница',
    close: 'Закрыть все Задачи, требующие внимания',
  },
  {
    code: 'fr',
    title: 'Toutes les Tâches nécessitant mon attention',
    previous: 'Page précédente',
    next: 'Page suivante',
    close: 'Fermer toutes les Tâches nécessitant mon attention',
  },
  {
    code: 'en',
    title: 'All Tasks needing my attention',
    previous: 'Previous page',
    next: 'Next page',
    close: 'Close all attention Tasks',
  },
];

test('browses the complete PostgreSQL attention set in four locales, opens the exact Task and observes completion after reload', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const clockFile = process.env.ACCEPTANCE_CLOCK_OFFSET_FILE;
  if (!clockFile) throw new Error('Acceptance clock fixture is required');
  const previousOffset = await readFile(clockFile, 'utf8');
  const decoded: unknown = JSON.parse(previousOffset);
  if (typeof decoded !== 'number' || !Number.isSafeInteger(decoded))
    throw new Error('Invalid acceptance clock fixture');
  const suffix = testInfo.project.name.endsWith('narrow')
    ? 'narrow'
    : 'desktop';
  const companyName = `Attention acceptance ${suffix}`;
  const projectTitle = `Attention preparation — Știință / Имя ${suffix}`;
  const clientName = `Attention {Client} — Société ${suffix}`;
  const lastTitle = `Inclusive last-day attention Task ${suffix}`;
  try {
    await writeFile(
      clockFile,
      String(Date.parse('2026-09-26T21:30:00.000Z') - Date.now()),
    );
    const companyId = text(
      (
        await command(
          request,
          '/companies',
          { displayName: companyName },
          { subject: 'workspace-owner' },
        )
      ).id,
    );
    const memberId = text(
      (await read(request, '/access/current-actor')).workspaceMembershipId,
    );
    for (const path of [
      '/company-context-assignments',
      '/company-director-client-assignments',
      '/company-project-assignments',
      '/company-task-manager-assignments',
    ])
      await command(
        request,
        path,
        { workspaceMembershipId: memberId, companyId },
        { subject: 'workspace-owner' },
      );
    const scope = { companyId };
    const clientAccountId = text(
      (await command(request, '/clients', { displayName: clientName }, scope))
        .id,
    );
    const projectId = text(
      (
        await command(
          request,
          '/projects',
          { title: projectTitle, clientAccountId },
          scope,
        )
      ).id,
    );
    const createTask = (value: {
      title: string;
      dueDate: string | null;
      priority?: 'normal' | 'important' | 'critical';
      assigneeMembershipId?: string | null;
    }) =>
      command(
        request,
        `/projects/${projectId}/tasks`,
        { assigneeMembershipId: memberId, ...value },
        scope,
      );
    const overdueIds: string[] = [];
    for (let index = 0; index < 25; index++) {
      const id = text(
        (
          await createTask({
            title: `Overdue ${String(index).padStart(2, '0')} ${suffix}`,
            dueDate: '2026-09-20',
            priority: index === 0 ? 'critical' : 'normal',
          })
        ).id,
      );
      overdueIds.push(id);
      if (index === 0)
        await command(
          request,
          `/tasks/${id}/status`,
          {
            expectedVersion: 1,
            status: 'blocked',
            reason: 'Literal acceptance blocker',
          },
          scope,
        );
    }
    const farCritical = text(
      (
        await createTask({
          title: `Critical beyond seven days ${suffix}`,
          dueDate: '2026-11-01',
          priority: 'critical',
        })
      ).id,
    );
    const undatedCritical = text(
      (
        await createTask({
          title: `Undated critical ${suffix}`,
          dueDate: null,
          priority: 'critical',
        })
      ).id,
    );
    const undatedBlocked = text(
      (await createTask({ title: `Undated blocked ${suffix}`, dueDate: null }))
        .id,
    );
    await command(
      request,
      `/tasks/${undatedBlocked}/status`,
      { expectedVersion: 1, status: 'blocked', reason: 'No declared date' },
      scope,
    );
    const lastId = text(
      (
        await createTask({
          title: lastTitle,
          dueDate: '2026-10-04',
          priority: 'important',
        })
      ).id,
    );
    const expectedIds = [
      ...overdueIds,
      farCritical,
      undatedCritical,
      undatedBlocked,
      lastId,
    ];
    await createTask({
      title: `Outside all rules ${suffix}`,
      dueDate: '2026-10-05',
    });
    await createTask({
      title: `Unassigned ${suffix}`,
      dueDate: '2026-09-20',
      assigneeMembershipId: null,
    });
    const alreadyDone = text(
      (
        await createTask({
          title: `Already completed ${suffix}`,
          dueDate: '2026-09-20',
        })
      ).id,
    );
    await command(
      request,
      `/tasks/${alreadyDone}/complete`,
      { expectedVersion: 1 },
      scope,
    );

    const browserRequests: string[] = [];
    page.on('request', (entry) => {
      const url = new URL(entry.url());
      if (url.pathname.startsWith('/api/'))
        browserRequests.push(`${entry.method()} ${url.pathname}${url.search}`);
    });
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Hello, Ada Ionescu.' }),
    ).toBeVisible();
    const narrow = suffix === 'narrow';
    if (narrow)
      await page
        .getByRole('button', { name: 'Open navigation', exact: true })
        .click();
    const homeResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/operational-home' &&
        response.request().headers()['x-company-context-id'] === companyId,
    );
    await selectOption(page.getByLabel('Active Company', { exact: true }), {
      label: companyName,
    });
    const homeBody: unknown = await (await homeResponse).json();
    const homeAttention = object(object(homeBody).attention);
    expect(homeAttention.matchingCount).toBe(29);
    if (!Array.isArray(homeAttention.tasks))
      throw new Error('Expected Home preview');
    const previewIds = homeAttention.tasks.map((row: unknown) =>
      text(object(row).id),
    );
    expect(previewIds).toEqual(expectedIds.slice(0, 10));
    await expect(page.getByLabel('Active Company', { exact: true })).toHaveText(
      companyName,
    );
    if (narrow)
      await page
        .getByRole('button', { name: 'Close navigation', exact: true })
        .click();
    const preview = page.getByRole('region', {
      name: 'My attention',
      exact: true,
    });
    await expect(preview.getByRole('listitem')).toHaveCount(10);
    await expect(preview).toContainText('Showing 10 of 29');
    await frameEvidence({
      page,
      subject: preview.getByRole('heading', {
        name: 'My attention',
        exact: true,
      }),
    });
    await fit(page, preview);
    await page.screenshot({
      path: testInfo.outputPath(`attention-pg-${suffix}-home-entry.png`),
    });
    const trigger = page.getByRole('button', {
      name: 'See all attention Tasks',
      exact: true,
    });
    await page.keyboard.press('Tab');
    await trigger.focus();
    await expect(trigger).toBeFocused();
    expect(
      await trigger.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    ).toBe('rgb(100, 81, 232)');
    const firstResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        new URL(response.url()).pathname === '/api/attention-tasks',
    );
    await trigger.press('Enter');
    const firstBody: unknown = await (await firstResponse).json();
    const first = object(firstBody);
    expect(first).toMatchObject({
      companyId,
      today: '2026-09-27',
      total: 29,
      offset: 0,
      pageSize: 25,
    });
    if (!Array.isArray(first.tasks))
      throw new Error('Expected complete first page');
    const firstIds = first.tasks.map((row: unknown) => text(object(row).id));
    expect(firstIds).toEqual(overdueIds);
    expect(firstIds.slice(0, 10)).toEqual(previewIds);
    expect(object(first.tasks[0])).toMatchObject({
      rules: ['overdue', 'critical', 'blocked'],
      dueInDays: -7,
    });
    const panel = page.locator('.operational-home-attention-panel');
    await expect(panel).toHaveAccessibleName(
      `All Tasks needing my attention — ${companyName}`,
    );
    await expect(panel.getByRole('listitem')).toHaveCount(25);
    await expect(panel.getByRole('heading', { level: 4 })).toBeFocused();
    await expect(
      panel.getByRole('button', { name: 'Previous page', exact: true }),
    ).toBeDisabled();
    expect(
      await panel
        .locator('.operational-home-attention-rules span')
        .first()
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    ).toBe('rgb(255, 244, 217)');
    await frameEvidence({
      page,
      subject: panel.getByRole('heading', { level: 4 }),
    });
    await fit(page, panel);
    await page.screenshot({
      path: testInfo.outputPath(`attention-pg-${suffix}-first-page.png`),
    });
    const lastResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/attention-tasks' &&
        new URL(response.url()).searchParams.get('offset') === '25',
    );
    await panel.getByRole('button', { name: 'Next page', exact: true }).focus();
    await page.keyboard.press('Enter');
    const lastBody: unknown = await (await lastResponse).json();
    const last = object(lastBody);
    expect(last).toMatchObject({
      total: 29,
      offset: 25,
      pageSize: 25,
      tasks: [
        { id: farCritical, rules: ['critical'], dueInDays: 35 },
        { id: undatedCritical, rules: ['critical'], dueInDays: null },
        { id: undatedBlocked, rules: ['blocked'], dueInDays: null },
        { id: lastId, rules: ['due_soon'], dueInDays: 7 },
      ],
    });
    if (!Array.isArray(last.tasks)) throw new Error('Expected last page');
    expect([
      ...firstIds,
      ...last.tasks.map((row: unknown) => text(object(row).id)),
    ]).toEqual(expectedIds);
    await expect(panel.getByRole('listitem')).toHaveCount(4);
    const originalLastRow = await panel
      .getByRole('listitem')
      .filter({ hasText: lastTitle })
      .elementHandle();
    if (!originalLastRow) throw new Error('Expected literal last Task');
    const beforeLocales = [...browserRequests];
    const previousUrl = page.url();
    for (const locale of locales) {
      const selector = page.getByRole('combobox', {
        name: /Interface language|Limba interfeței|Язык интерфейса|Langue de l’interface/u,
      });
      await selectOption(selector, { value: locale.code });
      await expect(selector).toBeFocused();
      await expect(panel).toHaveAccessibleName(
        `${locale.title} — ${companyName}`,
      );
      await expect(
        panel.getByRole('button', { name: locale.previous, exact: true }),
      ).toBeEnabled();
      await expect(
        panel.getByRole('button', { name: locale.next, exact: true }),
      ).toBeDisabled();
      await expect(
        panel.getByRole('button', { name: locale.close, exact: true }),
      ).toBeVisible();
      await expect(panel).toContainText(lastTitle);
      await expect(panel).toContainText(projectTitle);
      await expect(panel).toContainText(clientName);
      expect(
        await panel
          .getByRole('listitem')
          .filter({ hasText: lastTitle })
          .evaluate(
            (element, original) => element === original,
            originalLastRow,
          ),
      ).toBe(true);
      expect(browserRequests).toEqual(beforeLocales);
      expect(page.url()).toBe(previousUrl);
      await frameEvidence({
        page,
        subject: panel.getByRole('heading', { level: 4 }),
      });
      await fit(page, panel);
      await page.screenshot({
        path: testInfo.outputPath(
          `attention-pg-${suffix}-${locale.code}-last-page-top.png`,
        ),
      });
      await frameEvidence({
        page,
        subject: panel.getByRole('listitem').last(),
      });
      await expect(
        panel.getByRole('button', { name: locale.previous, exact: true }),
      ).toBeInViewport();
      await expect(
        panel.getByRole('button', { name: locale.next, exact: true }),
      ).toBeInViewport();
      await expect(panel.locator('footer')).toBeInViewport();
      await fit(page, panel);
      await page.screenshot({
        path: testInfo.outputPath(
          `attention-pg-${suffix}-${locale.code}-last-page-controls.png`,
        ),
      });
    }
    await panel
      .getByRole('button', { name: 'Close all attention Tasks', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(panel).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.press('Enter');
    await expect(panel.getByRole('listitem')).toHaveCount(25);
    await panel.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(panel.getByRole('listitem')).toHaveCount(4);
    await panel
      .getByRole('listitem')
      .filter({ hasText: lastTitle })
      .getByRole('button')
      .click();
    const tasks = page.locator('.project-tasks');
    await expect(
      tasks.getByRole('heading', { name: lastTitle, exact: true }),
    ).toBeVisible();
    expect(page.url()).not.toContain(lastId);
    expect(page.url()).not.toContain(projectId);
    await frameEvidence({
      page,
      subject: tasks.getByRole('heading', { name: lastTitle, exact: true }),
    });
    await fit(page, tasks);
    await page.screenshot({
      path: testInfo.outputPath(`attention-pg-${suffix}-exact-task.png`),
    });
    const markDone = tasks.getByRole('button', {
      name: 'Mark done',
      exact: true,
    });
    await frameEvidence({ page, subject: markDone });
    await expect(markDone).toBeEnabled();
    await fit(page, tasks);
    await page.screenshot({
      path: testInfo.outputPath(
        `attention-pg-${suffix}-exact-task-actions.png`,
      ),
    });
    const completion = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === `/api/tasks/${lastId}/complete`,
    );
    await tasks.getByRole('button', { name: 'Mark done', exact: true }).click();
    expect((await completion).status()).toBe(201);
    await expect(
      tasks.getByText('Completion declared by Ada Ionescu', { exact: false }),
    ).toBeVisible();
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Hello, Ada Ionescu.' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'See all attention Tasks', exact: true })
      .click();
    await expect(panel.getByRole('listitem')).toHaveCount(25);
    await expect(panel).toContainText('Total: 28');
    await panel.getByRole('button', { name: 'Next page', exact: true }).click();
    await expect(panel.getByRole('listitem')).toHaveCount(3);
    await expect(panel.getByText(lastTitle, { exact: true })).toHaveCount(0);
    await expect(
      panel.getByRole('button', { name: 'Next page', exact: true }),
    ).toBeDisabled();
    await frameEvidence({
      page,
      subject: panel.getByRole('heading', { level: 4 }),
    });
    await fit(page, panel);
    await page.screenshot({
      path: testInfo.outputPath(`attention-pg-${suffix}-after-completion.png`),
    });
  } finally {
    await writeFile(clockFile, previousOffset);
  }
});
