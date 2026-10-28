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

test('applies bounded team criteria, reaches row26, edits the exact native Task and returns to the retained fresh page', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const narrow = info.project.name.endsWith('narrow'),
    suffix = narrow ? 'Narrow' : 'Desktop';
  const companyTitle = `Team workboard DEMO ${suffix}`;
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
  const clientTitle = `Original Client {literal} ȘЖ DEMO ${suffix}`;
  const clientId = text(
    (await native('/clients', { displayName: clientTitle })).id,
  );
  const firstTitle = `First team mission DEMO ${suffix}`,
    targetProjectTitle = `Exact team mission DEMO ${suffix}`;
  const firstProject = text(
    (
      await native('/projects', {
        title: firstTitle,
        clientAccountId: clientId,
      })
    ).id,
  );
  const targetProject = text(
    (
      await native('/projects', {
        title: targetProjectTitle,
        clientAccountId: clientId,
      })
    ).id,
  );
  const expected: Record<string, unknown>[] = [];
  for (let index = 0; index < 26; index++) {
    const title =
      index === 25
        ? `Exact <script>literal</script> — Ștefan Ж and complete wrapped team work DEMO ${suffix}`
        : `Team work ${String(index).padStart(2, '0')} DEMO ${suffix}`;
    const projectId = index === 25 ? targetProject : firstProject;
    const created = await native(`/projects/${projectId}/tasks`, {
      title,
      assigneeMembershipId: colleague,
      dueDate: index === 25 ? '2099-11-26' : '2099-11-01',
    });
    expected.push({
      ...created,
      project: {
        id: projectId,
        title: index === 25 ? targetProjectTitle : firstTitle,
        clientDisplayName: clientTitle,
      },
    });
    const excluded = await native(`/projects/${firstProject}/tasks`, {
      title: `Interleaved nonmatch ${index} DEMO`,
      dueDate: '2000-01-01',
    });
    if (index % 2 === 0)
      await native(`/tasks/${text(excluded.id)}/complete`, {
        expectedVersion: 1,
      });
  }
  const target = expected[25];
  if (!target) throw new Error('Expected row26');
  const targetId = text(target.id),
    targetTitle = text(target.title);
  const requests: { method: string; path: string }[] = [];
  page.on('request', (r) => {
    const path = new URL(r.url()).pathname;
    if (path.startsWith('/api/')) requests.push({ method: r.method(), path });
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Hello, Ada Ionescu.' }),
  ).toBeVisible();
  await drawer(page, narrow, true);
  const selected = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === '/api/access/current-actor' &&
      r.request().headers()['x-company-context-id'] === companyId,
  );
  await selectOption(
    page.getByRole('combobox', { name: 'Active Company', exact: true }),
    companyId,
  );
  expect((await selected).status()).toBe(200);
  await drawer(page, narrow, false);
  const entry = page.waitForResponse(
    (r) => new URL(r.url()).pathname === '/api/team-tasks',
  );
  await navigate(page, 'Team Tasks', narrow);
  expect((await entry).status()).toBe(200);
  const queue = page.getByRole('region', { name: 'Team Tasks', exact: true });
  await expect(queue.getByRole('listitem')).toHaveCount(25);
  const before = requests.length;
  await selectOption(
    queue.getByRole('combobox', { name: 'Task state', exact: true }),
    'open',
  );
  await selectOption(
    queue.getByRole('combobox', { name: 'Responsibility', exact: true }),
    'name',
  );
  await queue.getByLabel('Responsible name contains').fill('  ION  ');
  await queue.getByLabel('Due from', { exact: true }).fill('2099-11-01');
  await queue.getByLabel('Due through', { exact: true }).fill('2099-11-30');
  expect(requests).toHaveLength(before);
  const applied = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === '/api/team-tasks' &&
      new URL(r.url()).searchParams.get('responsibility') === 'name',
  );
  await queue
    .getByRole('button', { name: 'Apply criteria', exact: true })
    .focus();
  await page.keyboard.press('Enter');
  const appliedValue: unknown = await (await applied).json();
  const filters = {
    state: 'open',
    responsibility: 'name',
    assigneeName: 'ION',
    dueFrom: '2099-11-01',
    dueThrough: '2099-11-30',
  };
  expect(record(appliedValue)).toEqual({
    companyId,
    offset: 0,
    pageSize: 25,
    hasNextPage: true,
    appliedFilters: filters,
    tasks: expected.slice(0, 25),
  });
  await fit(page);
  await page.screenshot({ path: info.outputPath('team-applied-entry.png') });
  const later = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === '/api/team-tasks' &&
      new URL(r.url()).searchParams.get('offset') === '25',
  );
  await queue.getByRole('button', { name: 'Next page', exact: true }).focus();
  await page.keyboard.press('Enter');
  const laterValue: unknown = await (await later).json();
  expect(record(laterValue)).toEqual({
    companyId,
    offset: 25,
    pageSize: 25,
    hasNextPage: false,
    appliedFilters: filters,
    tasks: [target],
  });
  await expect(queue.getByRole('listitem')).toHaveCount(1);
  await queue
    .getByLabel('Responsible name contains')
    .fill('  Unsaved name draft ȘЖ  ');
  const count = requests.length;
  for (const locale of [
    { name: 'Română', title: 'Sarcinile echipei' },
    { name: 'Русский', title: 'Задачи команды' },
    { name: 'Français', title: 'Tâches de l’équipe' },
    { name: 'English', title: 'Team Tasks' },
  ]) {
    await drawer(page, narrow, true);
    const picker = page
      .locator('.interface-locale-control')
      .getByRole('combobox');
    await selectOption(picker, { label: locale.name });
    await expect(picker).toBeFocused();
    await drawer(page, narrow, false);
    const region = page.getByRole('region', {
      name: locale.title,
      exact: true,
    });
    await expect(
      region.getByRole('heading', { name: targetTitle, exact: true }),
    ).toBeVisible();
    await expect(region.locator('input[type="text"]')).toHaveValue(
      '  Unsaved name draft ȘЖ  ',
    );
    expect(requests).toHaveLength(count);
    await fit(page);
  }
  await queue.getByRole('button', { name: /^Open / }).focus();
  await page.screenshot({ path: info.outputPath('team-row26.png') });
  const exact = page.waitForResponse(
      (r) => new URL(r.url()).pathname === `/api/tasks/${targetId}`,
    ),
    historyRead = page.waitForResponse(
      (r) => new URL(r.url()).pathname === `/api/tasks/${targetId}/history`,
    );
  await page.keyboard.press('Enter');
  expect((await exact).status()).toBe(200);
  expect((await historyRead).status()).toBe(200);
  const tasks = page.locator('.project-tasks');
  await expect(
    tasks.getByRole('heading', { name: targetTitle, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Projects', exact: true }),
  ).toBeFocused();
  const revised = targetTitle + ' edited';
  await tasks
    .getByRole('textbox', { name: 'Task title', exact: true })
    .fill(revised);
  await tasks.getByLabel('Due date', { exact: true }).fill('2100-01-01');
  const saved = page.waitForResponse(
    (r) =>
      r.request().method() === 'PATCH' &&
      new URL(r.url()).pathname === `/api/tasks/${targetId}`,
  );
  await tasks.getByRole('button', { name: 'Save Task', exact: true }).focus();
  await page.keyboard.press('Enter');
  expect((await saved).status()).toBe(200);
  await expect(
    tasks.getByText('Task change recorded.', { exact: true }),
  ).toBeVisible();
  await tasks.getByRole('button', { name: 'Reload Task', exact: true }).click();
  await expect(
    tasks.getByRole('textbox', { name: 'Task title', exact: true }),
  ).toHaveValue(revised);
  await expect(
    tasks
      .getByRole('region', { name: 'Task history' })
      .getByText('Task edited', { exact: true }),
  ).toBeVisible();
  await fit(page);
  await tasks
    .locator('.task-panel')
    .screenshot({ path: info.outputPath('team-native-history.png') });
  const returned = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === '/api/team-tasks' &&
      new URL(r.url()).searchParams.get('offset') === '25',
  );
  await navigate(page, 'Team Tasks', narrow);
  const returnedValue: unknown = await (await returned).json();
  expect(record(returnedValue)).toEqual({
    companyId,
    offset: 25,
    pageSize: 25,
    hasNextPage: false,
    appliedFilters: filters,
    tasks: [],
  });
  await expect(
    queue.getByText(
      'This page no longer contains Tasks. Go back or refresh the list.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(queue.getByLabel('Responsible name contains')).toHaveValue(
    '  Unsaved name draft ȘЖ  ',
  );
  await expect(
    queue.getByRole('button', { name: 'Previous page', exact: true }),
  ).toBeEnabled();
  await fit(page);
  await page.screenshot({ path: info.outputPath('team-fresh-return.png') });
  expect(await read(page, `/tasks/${targetId}`, companyId)).toMatchObject({
    task: { id: targetId, title: revised, dueDate: '2100-01-01', version: 2 },
  });
  expect(
    records((await read(page, `/tasks/${targetId}/history`, companyId)).events),
  ).toHaveLength(2);
  expect(
    requests.filter((r) => r.path.includes('/tasks/') && r.method !== 'GET'),
  ).toEqual([{ method: 'PATCH', path: `/api/tasks/${targetId}` }]);
});
