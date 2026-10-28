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
const locales = [
  {
    name: 'Română',
    label: 'Instrucțiunile Sarcinii (opțional)',
    error:
      'Introduceți text simplu valid, de maximum 2000 de puncte de cod Unicode.',
  },
  {
    name: 'Русский',
    label: 'Инструкции Задачи (необязательно)',
    error:
      'Введите корректный обычный текст, не более 2000 кодовых точек Unicode.',
  },
  {
    name: 'Français',
    label: 'Instructions de la Tâche (facultatif)',
    error:
      'Saisissez un texte brut valide de 2000 points de code Unicode au maximum.',
  },
  {
    name: 'English',
    label: 'Task instructions (optional)',
    error: 'Enter valid plain text of at most 2000 Unicode code points.',
  },
];
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
async function command(
  page: Page,
  path: string,
  data: unknown,
  companyId?: string,
) {
  const response = await page.request.post(api + path, {
    headers: {
      ...(companyId ? ada : owner),
      'idempotency-key': randomUUID(),
      ...(companyId ? { 'x-company-context-id': companyId } : {}),
    },
    data,
  });
  expect(response.status(), path).toBe(201);
  const value: unknown = await response.json();
  return record(value);
}
async function drawer(page: Page, open: boolean) {
  const toggle = page.locator('.production-menu-button');
  if (
    (await toggle.count()) &&
    (await toggle.isVisible()) &&
    ((await toggle.getAttribute('aria-expanded')) === 'true') !== open
  )
    await toggle.click();
}
async function navigate(page: Page, name: string) {
  await drawer(page, true);
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
for (const frame of ['classic', 'prisme']) {
  test(`${frame}: creates, reopens, retries, corrects and clears literal instructions with full attributed history and an independent draft`, async ({
    page,
  }, info) => {
    test.setTimeout(120_000);
    const suffix = `${frame} ${info.project.name.endsWith('narrow') ? 'Narrow' : 'Desktop'}`;
    const companyId = text(
      (
        await command(page, '/companies', {
          displayName: `Instructions Company DEMO ${suffix}`,
        })
      ).id,
    );
    const membershipId = text(process.env.ACCEPTANCE_PRIMARY_MEMBERSHIP_ID);
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
    const clientTitle = `Instructions Client DEMO ${suffix}`;
    const clientId = text(
      (await command(page, '/clients', { displayName: clientTitle }, companyId))
        .id,
    );
    const projectTitle = `Instructions Project DEMO ${suffix}`;
    const projectId = text(
      (
        await command(
          page,
          '/projects',
          { title: projectTitle, clientAccountId: clientId },
          companyId,
        )
      ).id,
    );
    const otherTitle = `Independent Project DEMO ${suffix}`;
    await command(
      page,
      '/projects',
      { title: otherTitle, clientAccountId: clientId },
      companyId,
    );
    const calls: {
      method: string;
      path: string;
      body: string | null;
      key: string | undefined;
    }[] = [];
    page.on('request', (request) => {
      const path = new URL(request.url()).pathname;
      if (path.startsWith('/api/'))
        calls.push({
          method: request.method(),
          path,
          body: request.postData(),
          key: request.headers()['idempotency-key'],
        });
    });
    await page.goto(`/?frame=${frame}#projects`);
    await expect(page.locator('.production-shell')).toBeVisible();
    await drawer(page, true);
    await expect(
      page.getByRole('combobox', { name: 'Active Company', exact: true }),
    ).toBeEnabled();
    await selectOption(
      page.getByRole('combobox', { name: 'Active Company', exact: true }),
      companyId,
    );
    await drawer(page, false);
    await navigate(page, 'Projects');
    const projects = page.getByRole('region', {
      name: 'Projects',
      exact: true,
    });
    await projects
      .getByRole('button', {
        name: `${projectTitle} Client: ${clientTitle}`,
        exact: true,
      })
      .click();
    const tasks = page.locator('.project-tasks:visible');
    const title = `Literal instructions Task DEMO ${suffix}`;
    const initial =
      'Citiți dosarul Ș / Я / 😀.\n  Keep <b>literal markup</b> and  both spaces.\n' +
      'Unbroken'.repeat(28);
    await tasks.getByLabel('Task title', { exact: true }).fill(title);
    const instructions = tasks.getByLabel('Task instructions (optional)', {
      exact: true,
    });
    await expect(instructions).toBeEnabled();
    const currentTaskRows = async () => {
      const response = await page.request.get(
        `${api}/projects/${projectId}/tasks`,
        { headers: { ...ada, 'x-company-context-id': companyId } },
      );
      expect(response.status()).toBe(200);
      const value: unknown = await response.json();
      return record(value).tasks;
    };
    expect(await currentTaskRows()).toEqual([]);
    const invalidDescription = '😀'.repeat(2001);
    await instructions.fill(invalidDescription);
    await tasks
      .getByRole('button', { name: 'Create Task', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(instructions).toHaveAttribute('aria-invalid', 'true');
    await expect(instructions).toHaveAttribute(
      'aria-describedby',
      /description-help .*description-error/u,
    );
    for (const locale of locales) {
      await drawer(page, true);
      const picker = page
        .locator('.interface-locale-control')
        .getByRole('combobox');
      await selectOption(picker, { label: locale.name });
      await expect(picker).toBeFocused();
      await drawer(page, false);
      const field = tasks.getByLabel(locale.label, { exact: true });
      await expect(field).toHaveValue(invalidDescription);
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      await expect(tasks.locator('.task-reason-error')).toHaveText(
        locale.error,
      );
      await field.focus();
      await expect(field).toBeFocused();
      await fit(page);
    }
    expect(
      calls.filter(
        (call) =>
          call.method === 'POST' &&
          call.path === `/api/projects/${projectId}/tasks`,
      ),
    ).toEqual([]);
    expect(await currentTaskRows()).toEqual([]);
    await tasks.locator('.task-panel').screenshot({
      path: info.outputPath('invalid-description-associated-error.png'),
    });
    await instructions.fill('');
    await instructions.focus();
    await page.keyboard.insertText(initial);
    const created = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === `/api/projects/${projectId}/tasks`,
    );
    await tasks
      .getByRole('button', { name: 'Create Task', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    const createdResponse = await created;
    expect(createdResponse.status()).toBe(201);
    const createdValue: unknown = await createdResponse.json();
    const taskId = text(record(createdValue).id);
    expect(record(createdValue)).toMatchObject({
      description: initial,
      version: 1,
    });
    await expect(tasks.getByLabel('Task instructions (optional)')).toHaveValue(
      initial,
    );
    await expect(
      tasks.getByRole('button', { name: 'Reload Task', exact: true }),
    ).toBeEnabled();
    await tasks
      .getByRole('button', { name: 'Reload Task', exact: true })
      .click();
    await expect(tasks.getByLabel('Task instructions (optional)')).toHaveValue(
      initial,
    );
    await expect(tasks.locator('b,script')).toHaveCount(0);
    await fit(page);
    await tasks.locator('.task-panel').screenshot({
      path: info.outputPath('created-literal-instructions.png'),
    });

    await projects
      .getByRole('button', {
        name: `${otherTitle} Client: ${clientTitle}`,
        exact: true,
      })
      .click();
    const independent = 'Independent native instructions\n  Не терять 😀';
    await tasks
      .getByLabel('Task title', { exact: true })
      .fill('Independent unsaved Task');
    await tasks.getByLabel('Task instructions (optional)').fill(independent);
    await navigate(page, 'Team Tasks');
    const team = page.getByRole('region', { name: 'Team Tasks', exact: true });
    await expect(
      team.getByRole('heading', { name: title, exact: true }),
    ).toBeVisible();
    await expect(team.getByText(initial, { exact: true })).toHaveCount(0);
    const exactRead = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        new URL(response.url()).pathname === `/api/tasks/${taskId}`,
    );
    await team
      .getByRole('button', { name: new RegExp(`^Open ${title}`) })
      .focus();
    await page.keyboard.press('Enter');
    expect((await exactRead).status()).toBe(200);
    await expect(tasks.getByLabel('Task instructions (optional)')).toHaveValue(
      initial,
    );
    expect(page.url()).not.toContain(taskId);

    const corrected =
      'Corecție literală Ș / Я / 🧭.\n  Retain the original dossier.\n' +
      'Long'.repeat(45);
    let loseReply = true;
    await page.route(`**/api/tasks/${taskId}`, async (route) => {
      if (route.request().method() === 'PATCH' && loseReply) {
        loseReply = false;
        const committed = await route.fetch();
        expect(committed.status()).toBe(200);
        await route.abort('failed');
      } else await route.continue();
    });
    await tasks.getByLabel('Task instructions (optional)').fill(corrected);
    await tasks.getByRole('button', { name: 'Save Task', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(
      tasks.getByRole('button', {
        name: 'Retry pending Task change',
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      tasks.getByLabel('Task instructions (optional)'),
    ).toBeDisabled();
    const writes = () =>
      calls.filter(
        (call) =>
          call.path === `/api/tasks/${taskId}` && call.method === 'PATCH',
      );
    expect(writes()).toHaveLength(1);
    const saved = writes()[0];
    if (!saved) throw new Error('Expected exact saved intent.');
    expect(JSON.parse(saved.body ?? '{}')).toEqual({
      expectedVersion: 1,
      description: corrected,
    });
    const dataReads = () =>
      calls.filter(
        (call) =>
          call.method === 'GET' &&
          /\/tasks|\/access\/current-actor|eligible-task-assignees/.test(
            call.path,
          ),
      ).length;
    const beforeLocales = dataReads();
    for (const locale of locales) {
      await drawer(page, true);
      const picker = page
        .locator('.interface-locale-control')
        .getByRole('combobox');
      await selectOption(picker, { label: locale.name });
      await expect(picker).toBeFocused();
      await drawer(page, false);
      await expect(tasks.getByLabel(locale.label, { exact: true })).toHaveValue(
        corrected,
      );
      expect(dataReads()).toBe(beforeLocales);
      await fit(page);
      await tasks.locator('.task-panel').screenshot({
        path: info.outputPath(`uncertain-${locale.name}-instructions.png`),
      });
    }
    await tasks
      .getByRole('button', { name: 'Retry pending Task change', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(
      tasks.getByText('Task change recorded.', { exact: true }),
    ).toBeVisible();
    await expect(
      tasks.getByLabel('Task instructions (optional)'),
    ).toBeEnabled();
    expect(writes()).toHaveLength(2);
    expect(writes()[1]).toEqual(saved);
    const history = tasks.getByRole('region', {
      name: 'Task history',
      exact: true,
    });
    await expect(history.getByRole('listitem')).toHaveCount(2);
    await expect(
      history.getByText('Ada Ionescu', { exact: false }).first(),
    ).toBeVisible();
    await expect(
      history.getByText(initial, { exact: false }).first(),
    ).toBeVisible();
    await expect(history.getByText(corrected, { exact: false })).toBeVisible();
    await fit(page);
    await history.screenshot({
      path: info.outputPath('corrected-attributed-history.png'),
    });

    await tasks
      .getByRole('button', { name: 'Clear instructions', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    expect(writes()).toHaveLength(2);
    await expect(tasks.getByLabel('Task instructions (optional)')).toHaveValue(
      '',
    );
    const cleared = page.waitForResponse(
      (response) =>
        response.request().method() === 'PATCH' &&
        new URL(response.url()).pathname === `/api/tasks/${taskId}`,
    );
    await tasks.getByRole('button', { name: 'Save Task', exact: true }).focus();
    await page.keyboard.press('Enter');
    const clearedReply = await cleared;
    expect(clearedReply.status()).toBe(200);
    const clearValue: unknown = await clearedReply.json();
    expect(record(clearValue)).toMatchObject({ description: null, version: 3 });
    expect(JSON.parse(writes()[2]?.body ?? '{}')).toEqual({
      expectedVersion: 2,
      description: null,
    });
    await expect(history.getByRole('listitem')).toHaveCount(3);
    await tasks
      .getByRole('button', { name: 'Reload Task', exact: true })
      .click();
    await expect(tasks.locator('.task-panel > .task-description')).toHaveText(
      'InstructionsNo description',
    );
    await fit(page);
    await tasks
      .locator('.task-panel')
      .screenshot({ path: info.outputPath('cleared-current-and-history.png') });
    await projects
      .getByRole('button', {
        name: `${otherTitle} Client: ${clientTitle}`,
        exact: true,
      })
      .click();
    await expect(tasks.getByLabel('Task instructions (optional)')).toHaveValue(
      independent,
    );
    await expect(tasks.getByLabel('Task title', { exact: true })).toHaveValue(
      'Independent unsaved Task',
    );
    await tasks
      .locator('.task-panel')
      .screenshot({ path: info.outputPath('independent-preserved-draft.png') });
    await page.reload();
    await projects
      .getByRole('button', {
        name: `${projectTitle} Client: ${clientTitle}`,
        exact: true,
      })
      .click();
    await tasks.getByRole('button', { name: title, exact: true }).click();
    await expect(tasks.getByLabel('Task instructions (optional)')).toHaveValue(
      '',
    );
    await expect(
      tasks.getByRole('region', { name: 'Task history' }).getByRole('listitem'),
    ).toHaveCount(3);
    await fit(page);
    await page.screenshot({
      path: info.outputPath('reopened-cleared-history.png'),
      fullPage: true,
    });
  });
}
