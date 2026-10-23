import { randomUUID } from 'node:crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { expectValue, selectOption } from './select-option';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected public API object');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected public API text');
  return value;
}
function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('Expected public Task rows');
  return value.map((row: unknown) => object(row));
}
function headers(companyId?: string, owner = false) {
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
async function command(
  request: APIRequestContext,
  path: string,
  value: unknown,
  companyId?: string,
  owner = false,
) {
  const response = await request.post(`/api${path}`, {
    headers: { ...headers(companyId, owner), 'idempotency-key': randomUUID() },
    data: value,
  });
  expect(response.status()).toBe(201);
  const result: unknown = await response.json();
  return object(result);
}
async function fit(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
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
const locales = [
  {
    code: 'ro',
    name: 'Română',
    title: 'Sarcini neatribuite',
    noDate: 'Fără termen',
  },
  {
    code: 'ru',
    name: 'Русский',
    title: 'Неназначенные Задачи',
    noDate: 'Без срока',
  },
  {
    code: 'fr',
    name: 'Français',
    title: 'Tâches non attribuées',
    noDate: 'Sans échéance',
  },
  {
    code: 'en',
    name: 'English',
    title: 'Unassigned Tasks',
    noDate: 'No due date',
  },
];

test('finds an undated PostgreSQL Task beyond page one, assigns the exact Task in its Project, reloads history and returns to a fresh queue', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'narrow' : 'desktop';
  const companyName = `Unassigned acceptance ${suffix}`;
  const clientName = `Literal {Client} — Știință ${suffix}`;
  const targetProjectTitle = `Target preparation ${suffix}`;
  const otherProjectTitle = `Other preparation ${suffix}`;
  const taskTitle = `Questionnaire {literal} — Не назначено ${suffix}`;
  const companyId = text(
    (
      await command(
        request,
        '/companies',
        { displayName: companyName },
        undefined,
        true,
      )
    ).id,
  );
  const actorResponse = await request.get('/api/access/current-actor', {
    headers: headers(),
  });
  expect(actorResponse.status()).toBe(200);
  const actorValue: unknown = await actorResponse.json();
  const memberId = text(object(actorValue).workspaceMembershipId);
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
      undefined,
      true,
    );
  const clientAccountId = text(
    (await command(request, '/clients', { displayName: clientName }, companyId))
      .id,
  );
  const otherProjectId = text(
    (
      await command(
        request,
        '/projects',
        { title: otherProjectTitle, clientAccountId },
        companyId,
      )
    ).id,
  );
  const targetProjectId = text(
    (
      await command(
        request,
        '/projects',
        { title: targetProjectTitle, clientAccountId },
        companyId,
      )
    ).id,
  );
  for (let index = 0; index < 25; index++)
    await command(
      request,
      `/projects/${otherProjectId}/tasks`,
      {
        title: `Future preparation ${String(index).padStart(2, '0')} ${suffix}`,
        dueDate: '2099-01-01',
        assigneeMembershipId: null,
      },
      companyId,
    );
  const targetId = text(
    (
      await command(
        request,
        `/projects/${targetProjectId}/tasks`,
        {
          title: taskTitle,
          dueDate: null,
          assigneeMembershipId: null,
          priority: 'important',
        },
        companyId,
      )
    ).id,
  );
  const otherId = text(
    (
      await command(
        request,
        `/projects/${otherProjectId}/tasks`,
        { title: taskTitle, dueDate: null, assigneeMembershipId: null },
        companyId,
      )
    ).id,
  );
  const browserRequests: Array<{ method: string; path: string }> = [];
  page.on('request', (sent) => {
    const path = new URL(sent.url()).pathname;
    if (path.startsWith('/api/'))
      browserRequests.push({ method: sent.method(), path });
  });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Hello, Ada Ionescu.' }),
  ).toBeVisible();
  await drawer(page, narrow, true);
  const selectedActor = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === '/api/access/current-actor' &&
      response.request().headers()['x-company-context-id'] === companyId,
  );
  const selectedProjects = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === '/api/projects' &&
      response.request().headers()['x-company-context-id'] === companyId,
  );
  await selectOption(page.getByLabel('Active Company', { exact: true }), {
    label: companyName,
  });
  const selectedActorResponse = await selectedActor;
  expect(selectedActorResponse.status()).toBe(200);
  const selectedActorPayload: unknown = await selectedActorResponse.json();
  expect(object(selectedActorPayload)).toMatchObject({
    workspaceMembershipId: memberId,
    activeCompany: { id: companyId },
  });
  const selectedProjectsResponse = await selectedProjects;
  expect(selectedProjectsResponse.status()).toBe(200);
  const selectedProjectsPayload: unknown =
    await selectedProjectsResponse.json();
  expect(rows(selectedProjectsPayload).map((row) => row.id)).toEqual(
    expect.arrayContaining([targetProjectId, otherProjectId]),
  );
  const companyControl = page.getByLabel('Active Company', { exact: true });
  await expect(companyControl).toBeEnabled();
  await expectValue(companyControl, companyId);
  await expect(companyControl).toHaveText(companyName);
  await expect(page.locator('.prisme-breadcrumb strong')).toHaveText(
    companyName,
  );
  await drawer(page, narrow, false);
  const firstRead = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === '/api/unassigned-tasks' &&
      response.request().headers()['x-company-context-id'] === companyId,
  );
  await navigate(page, 'Unassigned Tasks', narrow);
  const firstPayload: unknown = await (await firstRead).json();
  expect(object(firstPayload)).toMatchObject({
    companyId,
    offset: 0,
    pageSize: 25,
    hasNextPage: true,
  });
  const queue = page.locator('.unassigned-tasks');
  await expect(queue.getByRole('listitem')).toHaveCount(25);
  await expect(
    queue.getByRole('button', { name: 'Previous page', exact: true }),
  ).toBeDisabled();
  await fit(page);
  await page.screenshot({
    path: testInfo.outputPath(`unassigned-pg-${suffix}-first-page.png`),
    fullPage: true,
  });
  const nextRead = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/unassigned-tasks' &&
      new URL(response.url()).searchParams.get('offset') === '25',
  );
  await queue.getByRole('button', { name: 'Next page', exact: true }).focus();
  await page.keyboard.press('Enter');
  const nextPayload: unknown = await (await nextRead).json();
  expect(rows(object(nextPayload).tasks).map((row) => row.id)).toEqual([
    targetId,
    otherId,
  ]);
  await expect(queue.getByRole('listitem')).toHaveCount(2);
  await expect(
    queue.getByRole('button', { name: 'Next page', exact: true }),
  ).toBeDisabled();
  expect(
    browserRequests.some((sent) =>
      sent.path.includes('eligible-task-assignees'),
    ),
  ).toBe(false);
  expect(browserRequests.every((sent) => sent.method === 'GET')).toBe(true);
  const queueReadsBeforeLocales = browserRequests.filter(
    (sent) => sent.path === '/api/unassigned-tasks',
  ).length;
  for (const locale of locales) {
    await drawer(page, narrow, true);
    const picker = page
      .locator('.interface-locale-control')
      .getByRole('combobox');
    await selectOption(picker, { label: locale.name });
    await expect(picker).toBeFocused();
    await drawer(page, narrow, false);
    await expect(
      page.getByRole('region', { name: locale.title, exact: true }),
    ).toBeVisible();
    await expect(
      queue.getByRole('heading', { name: taskTitle, exact: true }),
    ).toHaveCount(2);
    await expect(queue.getByText(locale.noDate, { exact: true })).toHaveCount(
      2,
    );
    await expect(queue.getByText(clientName, { exact: true })).toHaveCount(2);
    expect(
      browserRequests.filter((sent) => sent.path === '/api/unassigned-tasks'),
    ).toHaveLength(queueReadsBeforeLocales);
    await fit(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `unassigned-pg-${suffix}-${locale.code}-second-page.png`,
      ),
      fullPage: true,
    });
  }
  const targetRow = queue
    .getByRole('listitem')
    .filter({ has: page.getByText(targetProjectTitle, { exact: true }) });
  await targetRow.getByRole('button').focus();
  const exactProjectRead = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === `/api/projects/${targetProjectId}`,
  );
  const exactTaskRead = page.waitForResponse(
    (response) => new URL(response.url()).pathname === `/api/tasks/${targetId}`,
  );
  await page.keyboard.press('Enter');
  expect((await exactProjectRead).status()).toBe(200);
  expect((await exactTaskRead).status()).toBe(200);
  const tasks = page.locator('.project-tasks');
  await expect(
    tasks.getByRole('heading', { name: taskTitle, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Projects', exact: true }),
  ).toBeFocused();
  expect(page.url()).not.toContain(targetId);
  expect(page.url()).not.toContain(targetProjectId);
  expect(
    await page.evaluate(() => JSON.stringify(window.history.state ?? null)),
  ).not.toContain(targetId);
  await fit(page);
  await page.screenshot({
    path: testInfo.outputPath(`unassigned-pg-${suffix}-exact-task.png`),
    fullPage: true,
  });
  const responsible = tasks
    .locator('form')
    .getByRole('combobox', { name: 'Responsible member', exact: true });
  await selectOption(responsible, { index: 1 });
  await expect(responsible).toContainText('Ada Ionescu');
  const assignment = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      new URL(response.url()).pathname === `/api/tasks/${targetId}`,
  );
  await tasks.getByRole('button', { name: 'Save Task', exact: true }).click();
  const assignmentResponse = await assignment;
  expect(assignmentResponse.status()).toBe(200);
  const assignedPayload: unknown = await assignmentResponse.json();
  expect(object(assignedPayload)).toMatchObject({
    id: targetId,
    version: 2,
    assignee: { workspaceMembershipId: memberId },
  });
  const assignedMemberLabel = text(
    object(object(assignedPayload).assignee).displayLabel,
  );
  expect(assignedMemberLabel).toMatch(/^Ada Ionescu · /u);
  await expect(
    tasks
      .getByRole('region', { name: 'Task history' })
      .getByText('Before: Unassigned', { exact: true }),
  ).toBeVisible();
  await expect(
    tasks
      .getByRole('region', { name: 'Task history' })
      .getByText(`After: ${assignedMemberLabel}`, { exact: true }),
  ).toBeVisible();
  // Reload restores only the Company and #projects section. Opaque target
  // intents live in App memory, so choose the Project and exact Task again.
  const restoredActor = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === '/api/access/current-actor' &&
      response.request().headers()['x-company-context-id'] === companyId,
  );
  const restoredProjects = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === '/api/projects' &&
      response.request().headers()['x-company-context-id'] === companyId,
  );
  await page.reload();
  const restoredActorResponse = await restoredActor;
  expect(restoredActorResponse.status()).toBe(200);
  const restoredActorPayload: unknown = await restoredActorResponse.json();
  expect(object(restoredActorPayload)).toMatchObject({
    workspaceMembershipId: memberId,
    activeCompany: { id: companyId },
  });
  expect((await restoredProjects).status()).toBe(200);
  await drawer(page, narrow, true);
  await expect(
    page.getByRole('navigation', { name: 'Primary navigation' }),
  ).toBeAttached();
  await expectValue(
    page.getByLabel('Active Company', { exact: true }),
    companyId,
  );
  await drawer(page, narrow, false);
  const projects = page.getByRole('region', { name: 'Projects', exact: true });
  await expect(projects).toBeVisible();
  await projects
    .getByRole('button', {
      name: `${targetProjectTitle} Client: ${clientName}`,
      exact: true,
    })
    .click();
  const reloadRead = page.waitForResponse(
    (response) => new URL(response.url()).pathname === `/api/tasks/${targetId}`,
  );
  await tasks.getByRole('button', { name: taskTitle, exact: true }).click();
  const reloadedPayload: unknown = await (await reloadRead).json();
  expect(object(object(reloadedPayload).task)).toMatchObject({
    id: targetId,
    version: 2,
    assignee: { workspaceMembershipId: memberId },
  });
  await expect(
    tasks
      .getByRole('region', { name: 'Task history' })
      .getByText('Before: Unassigned', { exact: true }),
  ).toBeVisible();
  await expect(
    tasks
      .getByRole('region', { name: 'Task history' })
      .getByText(`After: ${assignedMemberLabel}`, { exact: true }),
  ).toBeVisible();
  await fit(page);
  await page.screenshot({
    path: testInfo.outputPath(`unassigned-pg-${suffix}-reloaded-history.png`),
    fullPage: true,
  });
  const freshRead = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/unassigned-tasks' &&
      new URL(response.url()).searchParams.get('offset') === '0',
  );
  await navigate(page, 'Unassigned Tasks', narrow);
  const freshPayload: unknown = await (await freshRead).json();
  expect(object(freshPayload)).toMatchObject({
    companyId,
    offset: 0,
    pageSize: 25,
  });
  await expect(queue.getByRole('listitem')).toHaveCount(25);
  const freshLastRead = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/unassigned-tasks' &&
      new URL(response.url()).searchParams.get('offset') === '25',
  );
  await queue.getByRole('button', { name: 'Next page', exact: true }).click();
  const freshLastPayload: unknown = await (await freshLastRead).json();
  expect(rows(object(freshLastPayload).tasks).map((row) => row.id)).toEqual([
    otherId,
  ]);
  await expect(queue.getByRole('listitem')).toHaveCount(1);
  await expect(
    queue.getByText(otherProjectTitle, { exact: true }),
  ).toBeVisible();
  await expect(
    queue.getByText(targetProjectTitle, { exact: true }),
  ).toHaveCount(0);
  await fit(page);
  await page.screenshot({
    path: testInfo.outputPath(
      `unassigned-pg-${suffix}-fresh-after-assignment.png`,
    ),
    fullPage: true,
  });
});
