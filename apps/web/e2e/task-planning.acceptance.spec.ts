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
async function navigate(page: Page, name: string, narrow: boolean) {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name, exact: true })
    .click();
}

test('plans selected mission Tasks by keyboard, recovers a lost committed response and retains native work and the thirteen-activity source', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const narrow = info.project.name.endsWith('narrow'),
    suffix = narrow ? 'Narrow' : 'Desktop';
  const companyId = text(
    (
      await command(page, '/companies', {
        displayName: `Grouped planning DEMO ${suffix}`,
      })
    ).id,
  );
  const member = text(process.env.ACCEPTANCE_PRIMARY_MEMBERSHIP_ID);
  const ionResponse = await page.request.get(api + '/access/current-actor', {
    headers: ion,
  });
  expect(ionResponse.status()).toBe(200);
  const ionValue: unknown = await ionResponse.json(),
    ionMember = text(record(ionValue).workspaceMembershipId);
  // Explicit synthetic grants affect only this dedicated Company.
  for (const membershipId of [member, ionMember])
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
  await command(page, '/company-project-template-user-assignments', {
    companyId,
    workspaceMembershipId: member,
  });
  const clientTitle = `Planning Client DEMO ${suffix}`;
  const clientId = text(
    (
      await command(
        page,
        '/clients',
        { displayName: clientTitle },
        { companyId, identity: ada },
      )
    ).id,
  );
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Hello, Ada Ionescu.' }),
  ).toBeVisible();
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(
    page.getByRole('combobox', { name: 'Active Company', exact: true }),
    companyId,
  );
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
  await navigate(page, 'Projects', narrow);
  const projects = page.locator('.project-workspace'),
    title = `Mission planning DEMO ${suffix}`;
  await projects
    .getByRole('textbox', { name: 'Project title', exact: true })
    .fill(title);
  await selectOption(
    projects.getByRole('combobox', { name: 'Client', exact: true }),
    clientId,
  );
  await selectOption(
    projects.getByRole('combobox', { name: 'Project template', exact: true }),
    'CONSULTING_MISSION_PILOT_ILLUSTRATIVE:1',
  );
  const creation = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' &&
      new URL(r.url()).pathname === '/api/projects/from-template',
  );
  await projects
    .getByRole('button', { name: 'Create Project from template', exact: true })
    .click();
  const created = await creation;
  expect(created.status()).toBe(201);
  const createdValue: unknown = await created.json(),
    projectId = text(record(createdValue).id);
  await expect(
    projects.getByRole('heading', { name: title, exact: true }),
  ).toBeVisible();
  const source = await read(page, `/projects/${projectId}/template`, companyId),
    activities = records(record(source.template).activities);
  expect(activities).toHaveLength(13);
  const first = activities[0],
    second = activities[1],
    untouched = activities[2];
  if (!first || !second || !untouched)
    throw new Error('Thirteen public activities required.');
  const firstId = text(first.taskId),
    secondId = text(second.taskId),
    firstTitle = text(first.title),
    secondTitle = text(second.title);
  const eligible = records(
    (
      await read(
        page,
        `/projects/${projectId}/eligible-task-assignees`,
        companyId,
      )
    ).members,
  );
  function labelFor(membershipId: string) {
    const member = eligible.find(
      (member) => member.workspaceMembershipId === membershipId,
    );
    if (!member) throw new Error('Expected eligible named member.');
    return text(member.displayLabel);
  }
  const tasks = projects.locator('.project-tasks');
  await expect(
    tasks
      .getByRole('navigation', { name: 'Tasks', exact: true })
      .getByRole('listitem'),
  ).toHaveCount(13);
  const nativeDraft = tasks.getByRole('textbox', {
    name: 'Task title',
    exact: true,
  });
  await expect(nativeDraft).toBeEnabled();
  await nativeDraft.fill('Independent manual draft DEMO');
  const open = tasks.getByRole('button', {
    name: 'Plan selected Tasks',
    exact: true,
  });
  await open.focus();
  await open.press('Enter');
  const group = tasks.getByRole('region', { name: 'Grouped Task planning' });
  for (const title of [firstTitle, secondTitle]) {
    const checkbox = group.getByRole('checkbox', { name: title, exact: true });
    await checkbox.focus();
    await checkbox.press('Space');
    await expect(checkbox).toBeChecked();
    const box = await checkbox.boundingBox();
    if (!box) throw new Error('Visible checkbox required.');
    expect(box.width).toBeLessThanOrEqual(24);
  }
  const adaSelect = group.getByRole('combobox', {
    name: `Responsible member — ${firstTitle}`,
    exact: true,
  });
  await adaSelect.focus();
  await adaSelect.press('Home');
  await adaSelect.press('ArrowDown');
  await adaSelect.press('Enter');
  await expect(adaSelect).toHaveAttribute('data-value', member);
  const ionSelect = group.getByRole('combobox', {
    name: `Responsible member — ${secondTitle}`,
    exact: true,
  });
  await ionSelect.focus();
  await ionSelect.press('End');
  await ionSelect.press('Enter');
  await expect(ionSelect).toHaveAttribute('data-value', ionMember);
  await group
    .getByLabel(`Due date — ${firstTitle}`, { exact: true })
    .fill('2026-11-02');
  await group
    .getByLabel(`Due date — ${secondTitle}`, { exact: true })
    .fill('2026-11-09');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await group.screenshot({ path: info.outputPath('selected-planning.png') });
  const writes: {
    path: string;
    body: string | null;
    key: string | undefined;
  }[] = [];
  await page.route(
    `**/api/projects/${projectId}/tasks/planning`,
    async (route) => {
      writes.push({
        path: new URL(route.request().url()).pathname,
        body: route.request().postData(),
        key: route.request().headers()['idempotency-key'],
      });
      if (writes.length === 1) {
        const committed = await route.fetch();
        expect(committed.status()).toBe(201);
        await route.fulfill({
          status: 503,
          body: 'Synthetic lost confirmation',
        });
      } else await route.continue();
    },
  );
  const save = group.getByRole('button', { name: 'Save selected planning' });
  await save.focus();
  await save.press('Enter');
  const retry = group.getByRole('button', { name: 'Retry the same planning' });
  await expect(retry).toBeVisible();
  await expect(nativeDraft).toBeDisabled();
  await expect(
    group.getByLabel(`Due date — ${firstTitle}`, { exact: true }),
  ).toBeDisabled();
  await retry.focus();
  await retry.press('Enter');
  await expect(
    group.getByText('Selected planning saved.', { exact: true }),
  ).toBeVisible();
  await expect(nativeDraft).toBeEnabled();
  await expect(nativeDraft).toHaveValue('Independent manual draft DEMO');
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(writes[0]);
  const expected: unknown = JSON.parse(writes[0]?.body ?? '{}');
  expect(expected).toEqual({
    tasks: [
      {
        taskId: firstId,
        expectedVersion: 1,
        assigneeMembershipId: member,
        dueDate: '2026-11-02',
      },
      {
        taskId: secondId,
        expectedVersion: 1,
        assigneeMembershipId: ionMember,
        dueDate: '2026-11-09',
      },
    ],
  });
  await tasks.getByRole('button', { name: 'Close grouped planning' }).click();
  const plan = projects.getByRole('region', {
    name: 'Plan copied from template',
    exact: true,
  });
  for (const entry of [
    { activity: first, name: labelFor(member), dueDate: '2026-11-02' },
    { activity: second, name: labelFor(ionMember), dueDate: '2026-11-09' },
  ]) {
    const taskId = text(entry.activity.taskId);
    const ready = page.waitForResponse(
      (r) =>
        r.request().method() === 'GET' &&
        new URL(r.url()).pathname === `/api/tasks/${taskId}`,
    );
    await plan
      .getByRole('button', {
        name: `Open linked Task — ${text(entry.activity.key)}`,
        exact: true,
      })
      .click();
    expect((await ready).status()).toBe(200);
    await expect(
      tasks
        .locator('.task-facts > div')
        .filter({
          has: page.getByText('Responsible member', {
            exact: true,
          }),
        })
        .locator('dd'),
    ).toHaveText(entry.name);
    await expect(tasks.getByLabel('Due date', { exact: true })).toHaveValue(
      entry.dueDate,
    );
    const history = records(
      (await read(page, `/tasks/${taskId}/history`, companyId)).events,
    );
    expect(history).toHaveLength(2);
    expect(history[1]).toMatchObject({
      action: 'task.updated',
      actor: { workspaceMembershipId: member },
      metadata: { version: 2 },
    });
    await expect(tasks.locator('.task-history')).toBeVisible();
    await tasks.locator('.task-panel').screenshot({
      path: info.outputPath(
        `${taskId === firstId ? 'first' : 'second'}-native-task.png`,
      ),
    });
  }
  expect(
    record(
      (await read(page, `/tasks/${text(untouched.taskId)}`, companyId)).task,
    ),
  ).toMatchObject({ version: 1, assignee: null, dueDate: null });
  expect(
    await read(page, `/projects/${projectId}/template`, companyId),
  ).toEqual(source);
  await navigate(page, 'My Tasks', narrow);
  const assignedRead = page.waitForResponse(
    (r) =>
      r.request().method() === 'GET' &&
      new URL(r.url()).pathname === '/api/assigned-tasks' &&
      r.request().headers()['x-company-context-id'] === companyId,
  );
  await page
    .locator('.my-tasks')
    .getByRole('button', { name: 'Refresh My Tasks', exact: true })
    .click();
  expect((await assignedRead).status()).toBe(200);
  await expect(
    page.locator('.my-tasks').getByText(firstTitle, { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.my-tasks').getByText(secondTitle, { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath('assigned-my-tasks.png'),
    fullPage: true,
  });
  await page.reload();
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(
    page.getByRole('combobox', { name: 'Active Company', exact: true }),
    companyId,
  );
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
  await navigate(page, 'Projects', narrow);
  await projects
    .getByRole('list', { name: 'Projects', exact: true })
    .getByRole('button')
    .filter({ hasText: title })
    .click();
  await expect(plan.getByRole('listitem')).toHaveCount(13);
  expect(
    await read(page, `/projects/${projectId}/template`, companyId),
  ).toEqual(source);
  expect(
    records(
      (await read(page, `/projects/${projectId}/tasks`, companyId)).tasks,
    ),
  ).toHaveLength(13);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  // The production parent still holds an open status when another session closes this Project.
  await tasks
    .getByRole('button', { name: 'Plan selected Tasks', exact: true })
    .click();
  await expect(group.getByRole('checkbox')).toHaveCount(13);
  const currentTasks = records(
    (await read(page, `/projects/${projectId}/tasks`, companyId)).tasks,
  );
  for (const current of currentTasks)
    await command(
      page,
      `/tasks/${text(current.id)}/complete`,
      { expectedVersion: current.version },
      { companyId, identity: ada },
    );
  await command(page, '/company-project-approver-assignments', {
    companyId,
    workspaceMembershipId: member,
  });
  const closure = await page.request.post(
    api + `/projects/${projectId}/lifecycle-transitions`,
    {
      headers: {
        ...ada,
        'x-company-context-id': companyId,
        'idempotency-key': randomUUID(),
      },
      data: {
        action: 'cancel',
        expectedLifecycleRevision: 0,
        reason: 'Synthetic remote closure after ordinary Tasks are done',
      },
    },
  );
  expect(closure.status()).toBe(200);
  await group.getByRole('button', { name: 'Reload planning' }).click();
  await expect(
    group.getByText(
      'Read-only: this Project is closed. Task history remains available.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    group.getByText(
      'Read-only: the original Client has been superseded. Task history remains available.',
      { exact: true },
    ),
  ).toHaveCount(0);
  await expect(
    group.getByText('No open Tasks to plan.', { exact: true }),
  ).toBeVisible();
  await expect(
    group.getByRole('button', { name: 'Save selected planning' }),
  ).toHaveCount(0);
  expect(
    await read(page, `/projects/${projectId}/template`, companyId),
  ).toEqual(source);
  await group.screenshot({ path: info.outputPath('remote-closure.png') });
  await plan.screenshot({ path: info.outputPath('preserved-source.png') });
});
