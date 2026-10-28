import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { selectOption } from './select-option';

const api = 'http://127.0.0.1:4174/api';
const owner = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};
const ada = {
  ...owner,
  'x-test-external-subject': 'local-demonstration-user',
  'x-test-display-name': 'Ada Ionescu',
  'x-test-email': 'ada@example.test',
};
const ion = {
  ...owner,
  'x-test-external-subject': 'responsible-colleague',
  'x-test-display-name': 'Ion Popa',
  'x-test-email': 'ion@example.test',
};
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected public response.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected public identity.');
  return value;
}
function records(value: unknown) {
  if (!Array.isArray(value)) throw new Error('Expected public rows.');
  const rows: unknown[] = value;
  return rows.map(record);
}
async function command(
  page: Page,
  path: string,
  body: unknown,
  options: { companyId?: string; identity?: typeof ada } = {},
) {
  const response = await page.request.post(api + path, {
    headers: {
      ...(options.identity ?? owner),
      'idempotency-key': randomUUID(),
      ...(options.companyId
        ? { 'x-company-context-id': options.companyId }
        : {}),
    },
    data: body,
  });
  expect(response.status(), path).toBe(201);
  const value: unknown = await response.json();
  return record(value);
}
async function read(page: Page, path: string, companyId: string) {
  const response = await page.request.get(api + path, {
    headers: { ...ada, 'x-company-context-id': companyId },
  });
  expect(response.status(), path).toBe(200);
  const value: unknown = await response.json();
  return record(value);
}
async function drawer(page: Page, narrow: boolean, open: boolean) {
  if (!narrow) return;
  const toggle = page.locator('.production-menu-button');
  if (((await toggle.getAttribute('aria-expanded')) === 'true') !== open)
    await toggle.click();
}
async function navigate(page: Page, name: string, narrow: boolean) {
  await drawer(page, narrow, true);
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name, exact: true })
    .click();
}
async function fit(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}

test('discovers a later-page undated native blockage, resumes the exact Task and reloads history without changing other blockers', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const narrow = info.project.name.endsWith('narrow'),
    suffix = narrow ? 'Narrow' : 'Desktop';
  const companyTitle = `Blocked supervision DEMO ${suffix}`;
  const companyId = text(
    (await command(page, '/companies', { displayName: companyTitle })).id,
  );
  const member = text(process.env.ACCEPTANCE_PRIMARY_MEMBERSHIP_ID);
  const colleagueReply = await page.request.get(api + '/access/current-actor', {
    headers: ion,
  });
  expect(colleagueReply.status()).toBe(200);
  const colleagueValue: unknown = await colleagueReply.json(),
    colleague = text(record(colleagueValue).workspaceMembershipId);
  for (const membershipId of [member, colleague])
    for (const family of [
      'company-context',
      'company-director-client',
      'company-project',
      'company-task-manager',
    ])
      await command(page, `/${family}-assignments`, {
        companyId,
        workspaceMembershipId: membershipId,
      });
  const native = (path: string, body: unknown) =>
    command(page, path, body, { companyId, identity: ada });
  const clientTitle = `Literal {Client} — Blocaje DEMO ${suffix}`;
  const clientId = text(
    (await native('/clients', { displayName: clientTitle })).id,
  );
  const otherTitle = `Other mission DEMO ${suffix}`,
    targetTitle = `Target mission DEMO ${suffix}`;
  const otherProject = text(
    (
      await native('/projects', {
        title: otherTitle,
        clientAccountId: clientId,
      })
    ).id,
  );
  const targetProject = text(
    (
      await native('/projects', {
        title: targetTitle,
        clientAccountId: clientId,
      })
    ).id,
  );
  const block = async (
    projectId: string,
    fields: {
      title: string;
      dueDate: string | null;
      assigneeMembershipId: string | null;
    },
    reason: string,
  ) => {
    const created = await native(`/projects/${projectId}/tasks`, fields);
    return native(`/tasks/${text(created.id)}/status`, {
      expectedVersion: 1,
      status: 'blocked',
      reason,
    });
  };
  for (let index = 0; index < 25; index++)
    await block(
      otherProject,
      {
        title: `Dated blocker ${String(index).padStart(2, '0')} DEMO ${suffix}`,
        dueDate: '2099-11-01',
        assigneeMembershipId:
          index % 3 === 0 ? member : index % 3 === 1 ? colleague : null,
      },
      `Recorded dated blocker ${index} DEMO`,
    );
  const taskTitle = `Literal {Task} — Не хватает ответа DEMO ${suffix}`;
  const reason =
    'Lipsește răspunsul — <script>literal, never HTML</script> ' +
    'Documentul așteptat. '.repeat(12);
  const target = await block(
      targetProject,
      { title: taskTitle, dueDate: null, assigneeMembershipId: colleague },
      reason,
    ),
    targetId = text(target.id);
  const other = await block(
      otherProject,
      { title: taskTitle, dueDate: null, assigneeMembershipId: null },
      'Another preserved reason DEMO',
    ),
    otherId = text(other.id);
  const ordinary = await native(`/projects/${targetProject}/tasks`, {
    title: `Unblocked source DEMO ${suffix}`,
    dueDate: '2000-01-01',
  });
  const otherHistory = await read(page, `/tasks/${otherId}/history`, companyId);
  const expectedAssignee = text(record(target.assignee).displayLabel);
  const browserRequests: Array<{ method: string; path: string }> = [];
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/'))
      browserRequests.push({ method: request.method(), path });
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Hello, Ada Ionescu.' }),
  ).toBeVisible();
  await drawer(page, narrow, true);
  const actorRead = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/access/current-actor' &&
      response.request().headers()['x-company-context-id'] === companyId,
  );
  await selectOption(
    page.getByRole('combobox', { name: 'Active Company', exact: true }),
    companyId,
  );
  expect((await actorRead).status()).toBe(200);
  await expect(
    page.getByRole('combobox', { name: 'Active Company', exact: true }),
  ).toHaveAttribute('data-value', companyId);
  await drawer(page, narrow, false);
  const firstRead = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/blocked-tasks' &&
      response.request().headers()['x-company-context-id'] === companyId,
  );
  await navigate(page, 'Blocked Tasks', narrow);
  const firstValue: unknown = await (await firstRead).json(),
    firstPage = record(firstValue);
  expect(firstPage).toMatchObject({
    companyId,
    offset: 0,
    pageSize: 25,
    hasNextPage: true,
  });
  expect(records(firstPage.tasks)).toHaveLength(25);
  expect(
    records(firstPage.tasks).every((row) => row.status === 'blocked'),
  ).toBe(true);
  expect(
    new Set(
      records(firstPage.tasks).map((row) =>
        row.assignee === null
          ? 'unassigned'
          : text(record(row.assignee).workspaceMembershipId),
      ),
    ).size,
  ).toBe(3);
  const queue = page.getByRole('region', {
    name: 'Blocked Tasks',
    exact: true,
  });
  await expect(queue.getByRole('listitem')).toHaveCount(25);
  await fit(page);
  await queue
    .getByRole('listitem')
    .first()
    .screenshot({ path: info.outputPath('first-blockage.png') });
  await page.screenshot({ path: info.outputPath('company-entry.png') });
  const nextRead = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/blocked-tasks' &&
      new URL(response.url()).searchParams.get('offset') === '25',
  );
  await queue.getByRole('button', { name: 'Next page', exact: true }).focus();
  await page.keyboard.press('Enter');
  const nextValue: unknown = await (await nextRead).json(),
    nextPage = record(nextValue);
  expect(records(nextPage.tasks).map((row) => row.id)).toEqual([
    targetId,
    otherId,
  ]);
  await expect(queue.getByRole('listitem')).toHaveCount(2);
  await expect(queue.getByText(reason, { exact: true })).toBeVisible();
  await expect(
    queue.getByText(expectedAssignee, { exact: true }),
  ).toBeVisible();
  expect(await queue.locator('script').count()).toBe(0);
  expect(browserRequests.every((request) => request.method === 'GET')).toBe(
    true,
  );
  expect(
    browserRequests.some((request) =>
      request.path.includes('eligible-task-assignees'),
    ),
  ).toBe(false);
  const beforeLocales = browserRequests.filter(
    (request) => request.path === '/api/blocked-tasks',
  ).length;
  for (const locale of [
    { name: 'Română', title: 'Sarcini blocate' },
    { name: 'Русский', title: 'Заблокированные Задачи' },
    { name: 'Français', title: 'Tâches bloquées' },
    { name: 'English', title: 'Blocked Tasks' },
  ]) {
    await drawer(page, narrow, true);
    const picker = page
      .locator('.interface-locale-control')
      .getByRole('combobox');
    await selectOption(picker, { label: locale.name });
    await expect(picker).toBeFocused();
    await drawer(page, narrow, false);
    const current = page.getByRole('region', {
      name: locale.title,
      exact: true,
    });
    await expect(current.getByRole('listitem')).toHaveCount(2);
    await expect(current.getByText(reason, { exact: true })).toBeVisible();
    await expect(
      current.getByText(expectedAssignee, { exact: true }),
    ).toBeVisible();
    expect(
      browserRequests.filter(
        (request) => request.path === '/api/blocked-tasks',
      ),
    ).toHaveLength(beforeLocales);
    await fit(page);
  }
  await page.screenshot({
    path: info.outputPath('later-page-blockage.png'),
    fullPage: true,
  });
  const targetRow = queue
    .getByRole('listitem')
    .filter({ has: page.getByText(targetTitle, { exact: true }) });
  const exactProject = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/projects/${targetProject}`,
  );
  const exactTask = page.waitForResponse(
    (response) => new URL(response.url()).pathname === `/api/tasks/${targetId}`,
  );
  await targetRow.getByRole('button').focus();
  await page.keyboard.press('Enter');
  expect((await exactProject).status()).toBe(200);
  expect((await exactTask).status()).toBe(200);
  const tasks = page.locator('.project-tasks');
  await expect(
    tasks.getByRole('heading', { name: taskTitle, exact: true }),
  ).toBeVisible();
  await expect(
    tasks
      .locator('.task-facts--declaration')
      .getByText(reason, { exact: true }),
  ).toBeVisible();
  expect(page.url()).not.toContain(targetId);
  expect(page.url()).not.toContain(targetProject);
  await expect(
    page.getByRole('region', { name: 'Projects', exact: true }),
  ).toBeFocused();
  await tasks
    .locator('.task-panel')
    .screenshot({ path: info.outputPath('exact-native-blockage.png') });
  const resumed = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === `/api/tasks/${targetId}/status`,
  );
  const resume = tasks.getByRole('button', {
    name: 'Mark in progress',
    exact: true,
  });
  await resume.focus();
  await resume.press('Enter');
  const resumedReply = await resumed;
  expect(resumedReply.status()).toBe(201);
  const resumedValue: unknown = await resumedReply.json();
  expect(record(resumedValue)).toMatchObject({
    id: targetId,
    status: 'in_progress',
    version: 3,
    assignee: target.assignee,
  });
  expect(record(resumedValue)).not.toHaveProperty('blockage');
  await expect(tasks.locator('p.task-status')).toHaveText('In progress');
  await expect(
    tasks.getByRole('button', { name: 'Reload Task', exact: true }),
  ).toBeEnabled();
  const reloaded = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === `/api/tasks/${targetId}`,
  );
  await tasks.getByRole('button', { name: 'Reload Task', exact: true }).click();
  expect((await reloaded).status()).toBe(200);
  await expect(
    tasks.getByRole('textbox', { name: 'Task title', exact: true }),
  ).toBeEnabled();
  const history = records(
    (await read(page, `/tasks/${targetId}/history`, companyId)).events,
  );
  expect(history).toHaveLength(3);
  expect(history[2]).toMatchObject({
    action: 'task.status.changed',
    metadata: { version: 3, before: 'blocked', after: 'in_progress' },
  });
  await expect(
    tasks
      .getByRole('region', { name: 'Task history' })
      .getByText('After: In progress', { exact: true }),
  ).toBeVisible();
  await tasks
    .locator('.task-panel')
    .screenshot({ path: info.outputPath('reloaded-native-history.png') });
  const freshRead = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/blocked-tasks' &&
      new URL(response.url()).searchParams.get('offset') === '0',
  );
  await navigate(page, 'Blocked Tasks', narrow);
  const freshValue: unknown = await (await freshRead).json();
  expect(record(freshValue).tasks).toEqual(firstPage.tasks);
  await expect(queue.getByRole('listitem')).toHaveCount(25);
  const lastRead = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/blocked-tasks' &&
      new URL(response.url()).searchParams.get('offset') === '25',
  );
  await queue.getByRole('button', { name: 'Next page', exact: true }).click();
  const lastValue: unknown = await (await lastRead).json();
  expect(record(lastValue).tasks).toEqual([records(nextPage.tasks)[1]]);
  await expect(queue.getByRole('listitem')).toHaveCount(1);
  await expect(queue.getByText(targetTitle, { exact: true })).toHaveCount(0);
  expect((await read(page, `/tasks/${otherId}`, companyId)).task).toEqual(
    other,
  );
  expect(await read(page, `/tasks/${otherId}/history`, companyId)).toEqual(
    otherHistory,
  );
  expect(
    (await read(page, `/tasks/${text(ordinary.id)}`, companyId)).task,
  ).toEqual(ordinary);
  expect(browserRequests.filter((request) => request.method !== 'GET')).toEqual(
    [{ method: 'POST', path: `/api/tasks/${targetId}/status` }],
  );
  await fit(page);
  await page.screenshot({
    path: info.outputPath('fresh-after-resumption.png'),
    fullPage: true,
  });
});
