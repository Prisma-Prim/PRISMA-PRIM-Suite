import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
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
async function fit(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

test('browses more than one PostgreSQL deadline page, opens the exact Task and observes completion after reload', async ({
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
  const companyName = `Upcoming acceptance ${suffix}`;
  const projectTitle = `Deadline preparation ${suffix}`;
  const lastTitle = `Inclusive last-day Task ${suffix}`;
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
      (
        await command(
          request,
          '/clients',
          { displayName: `Deadline Client ${suffix}` },
          scope,
        )
      ).id,
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
    const createTask = ({
      title,
      dueDate,
      assigneeMembershipId = memberId,
      priority = 'normal',
    }: {
      title: string;
      dueDate: string | null;
      assigneeMembershipId?: string | null;
      priority?: string;
    }) =>
      command(
        request,
        `/projects/${projectId}/tasks`,
        { title, dueDate, assigneeMembershipId, priority },
        scope,
      );
    const eligibleIds: string[] = [];
    for (let index = 0; index < 25; index++)
      eligibleIds.push(
        text(
          (
            await createTask({
              title: `Due today ${String(index).padStart(2, '0')} ${suffix}`,
              dueDate: '2026-09-27',
            })
          ).id,
        ),
      );
    const lastId = text(
      (
        await createTask({
          title: lastTitle,
          dueDate: '2026-10-04',
          assigneeMembershipId: memberId,
          priority: 'important',
        })
      ).id,
    );
    eligibleIds.push(lastId);
    await createTask({
      title: `Outside window ${suffix}`,
      dueDate: '2026-10-05',
      assigneeMembershipId: memberId,
      priority: 'critical',
    });
    await createTask({
      title: `Undated critical ${suffix}`,
      dueDate: null,
      assigneeMembershipId: memberId,
      priority: 'critical',
    });
    await createTask({
      title: `Overdue critical ${suffix}`,
      dueDate: '2026-09-26',
      assigneeMembershipId: memberId,
      priority: 'critical',
    });
    await createTask({
      title: `Unassigned ${suffix}`,
      dueDate: '2026-09-27',
      assigneeMembershipId: null,
    });
    const done = text(
      (
        await createTask({
          title: `Already done ${suffix}`,
          dueDate: '2026-09-27',
        })
      ).id,
    );
    await command(
      request,
      `/tasks/${done}/complete`,
      { expectedVersion: 1 },
      scope,
    );

    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Hello, Ada Ionescu.' }),
    ).toBeVisible();
    const narrow = suffix === 'narrow';
    if (narrow)
      await page
        .getByRole('button', { name: 'Open navigation', exact: true })
        .click();
    await selectOption(page.getByLabel('Active Company', { exact: true }), {
      label: companyName,
    });
    await expect(page.getByLabel('Active Company', { exact: true })).toHaveText(
      companyName,
    );
    if (narrow)
      await page
        .getByRole('button', { name: 'Close navigation', exact: true })
        .click();
    await expect(page.locator('.prisme-shell')).toBeVisible();
    await fit(page);
    await page.screenshot({
      path: testInfo.outputPath(`upcoming-pg-${suffix}-home-entry.png`),
      fullPage: true,
    });
    const trigger = page.getByRole('button', {
      name: 'Show my upcoming deadlines',
      exact: true,
    });
    const firstResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        new URL(response.url()).pathname === '/api/due-soon-tasks',
    );
    await trigger.focus();
    await trigger.press('Enter');
    const firstBody: unknown = await (await firstResponse).json();
    const first = object(firstBody);
    expect(first).toMatchObject({
      today: '2026-09-27',
      throughDate: '2026-10-04',
      total: 26,
      offset: 0,
      pageSize: 25,
    });
    if (!Array.isArray(first.tasks)) throw new Error('Expected Task page');
    const firstIds = first.tasks.map((row: unknown) => text(object(row).id));
    expect(firstIds).toHaveLength(25);
    const panel = page.getByRole('region', {
      name: `My upcoming deadlines — ${companyName}`,
      exact: true,
    });
    await expect(panel.getByRole('listitem')).toHaveCount(25);
    await expect(panel.getByRole('heading', { level: 4 })).toBeFocused();
    await expect(
      panel.getByRole('button', { name: 'Previous page', exact: true }),
    ).toBeDisabled();
    await fit(page);
    await panel.screenshot({
      path: testInfo.outputPath(`upcoming-pg-${suffix}-full-page.png`),
    });
    const lastResponse = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        new URL(response.url()).pathname === '/api/due-soon-tasks' &&
        new URL(response.url()).searchParams.get('offset') === '25',
    );
    await panel.getByRole('button', { name: 'Next page', exact: true }).focus();
    await page.keyboard.press('Enter');
    const lastBody: unknown = await (await lastResponse).json();
    const last = object(lastBody);
    expect(last).toMatchObject({
      total: 26,
      offset: 25,
      pageSize: 25,
      tasks: [{ id: lastId, dueDate: '2026-10-04' }],
    });
    expect(new Set([...firstIds, lastId])).toEqual(new Set(eligibleIds));
    await expect(panel.getByRole('listitem')).toHaveCount(1);
    await expect(
      panel.getByRole('heading', { name: lastTitle, exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole('button', { name: 'Next page', exact: true }),
    ).toBeDisabled();
    await fit(page);
    await panel.screenshot({
      path: testInfo.outputPath(`upcoming-pg-${suffix}-last-page.png`),
    });
    await panel.getByRole('listitem').getByRole('button').click();
    const tasks = page.locator('.project-tasks');
    await expect(
      tasks.getByRole('heading', { name: lastTitle, exact: true }),
    ).toBeVisible();
    await expect(
      tasks.locator('time[datetime="2026-10-04"]').first(),
    ).toBeVisible();
    expect(page.url()).not.toContain(lastId);
    expect(page.url()).not.toContain(projectId);
    await fit(page);
    await page.screenshot({
      path: testInfo.outputPath(`upcoming-pg-${suffix}-exact-task.png`),
      fullPage: true,
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
      .getByRole('button', { name: 'Show my upcoming deadlines', exact: true })
      .click();
    const refreshed = page.getByRole('region', {
      name: `My upcoming deadlines — ${companyName}`,
      exact: true,
    });
    await expect(refreshed.getByRole('listitem')).toHaveCount(25);
    await expect(refreshed).toContainText('Total: 25');
    await expect(
      refreshed.getByRole('button', { name: 'Next page', exact: true }),
    ).toBeDisabled();
    await expect(refreshed.getByText(lastTitle, { exact: true })).toHaveCount(
      0,
    );
    await fit(page);
    await refreshed.screenshot({
      path: testInfo.outputPath(`upcoming-pg-${suffix}-after-completion.png`),
    });
  } finally {
    await writeFile(clockFile, previousOffset);
  }
});
