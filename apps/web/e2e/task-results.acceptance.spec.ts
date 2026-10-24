import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page, type Locator } from '@playwright/test';
import { selectOption } from './select-option';

const origin = 'http://127.0.0.1:4174/api';
const ada = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'local-demonstration-user',
  'x-test-display-name': 'Ada Ionescu',
  'x-test-email': 'ada@example.test',
};
const owner = {
  ...ada,
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected identified response');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new Error('Expected identity');
  return value;
}
async function navigate(page: Page, name: string, narrow: boolean) {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name, exact: true })
    .click();
}
async function exactDownload(page: Page, button: Locator, bytes: Buffer) {
  const pending = page.waitForEvent('download');
  await button.click();
  const path = await (await pending).path();
  if (!path) throw new Error('Missing exact download');
  expect(await readFile(path)).toEqual(bytes);
}

test('records a Task result, preserves its exact superseded PDF, corrects and completes/reopens without rewriting history under independent rights', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'narrow' : 'desktop';
  const companyId = text(process.env.ACCEPTANCE_PRIMARY_COMPANY_ID);
  const membershipId = text(process.env.ACCEPTANCE_PRIMARY_MEMBERSHIP_ID);
  const identity = { ...ada, 'x-company-context-id': companyId };
  const title = `Task-result mission DEMO ${suffix}`;
  const projectTitle = `Task-result Project DEMO ${suffix}`;
  const taskTitle = `Prepare mission output DEMO ${suffix}`;
  const firstText = `Prepared the first mission output DEMO ${suffix}`;
  const secondText = `Updated the mission output DEMO ${suffix}`;
  const pdfA = await readFile(
    new URL(
      '../../api/test-support/fixtures/questionnaire-demo.pdf',
      import.meta.url,
    ),
  );
  const pdfB = Buffer.from(pdfA);
  pdfB.write('NEXT', pdfB.indexOf('DEMO'), 'ascii');
  const grants = new Set<string>();
  async function assign(bundle: string, active: boolean) {
    const path = `${origin}/company-${bundle}-assignments`;
    const headers = { ...owner, 'idempotency-key': randomUUID() };
    const response = active
      ? await page.request.post(path, {
          headers,
          data: { companyId, workspaceMembershipId: membershipId },
        })
      : await page.request.delete(`${path}/${membershipId}/${companyId}`, {
          headers,
        });
    expect(response.status()).toBe(active ? 201 : 200);
    if (active) grants.add(bundle);
    else grants.delete(bundle);
  }
  async function post(path: string, data: unknown) {
    const response = await page.request.post(`${origin}${path}`, {
      headers: { ...identity, 'idempotency-key': randomUUID() },
      data,
    });
    expect(response.status()).toBe(201);
    return record(await response.json());
  }
  async function openTask() {
    await page.goto('/');
    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await selectOption(page.getByLabel('Active Company', { exact: true }), {
      label: 'PRISMA-PRIM',
    });
    if (narrow)
      await page.getByRole('button', { name: 'Close navigation' }).click();
    await navigate(page, 'Projects', narrow);
    const projects = page.locator('.project-workspace');
    await projects
      .getByRole('searchbox', { name: 'Find Projects' })
      .fill(projectTitle);
    await projects
      .getByRole('list', { name: 'Projects' })
      .getByRole('button', { name: new RegExp(projectTitle, 'u') })
      .click();
    await projects.getByRole('tab', { name: 'Tasks', exact: true }).click();
    const tasks = projects.locator('.project-tasks');
    await tasks
      .locator('.task-list')
      .getByRole('button', { name: taskTitle, exact: true })
      .click();
    return tasks;
  }
  try {
    for (const bundle of [
      'mission-deliverable-access',
      'document-content-reader',
      'document-content-uploader',
      'document-approver',
      'task-result-recorder',
    ])
      await assign(bundle, true);
    const client = await post('/clients', {
      displayName: `Task-result Client DEMO ${suffix}`,
    });
    const clientId = text(client.id);
    const project = await post('/projects', {
      title: projectTitle,
      clientAccountId: clientId,
    });
    const projectId = text(project.id);
    const taskId = text(
      (await post(`/projects/${projectId}/tasks`, { title: taskTitle })).id,
    );
    const document = await post('/documents', {
      type: 'mission-deliverable',
      clientId,
      title,
      purpose: 'Synthetic declared result evidence',
    });
    const documentId = text(document.id);
    const versionId = text(record(document.version).id);
    const upload = await page.request.post(
      `${origin}/documents/${documentId}/versions/${versionId}/content?expectedRevision=1&fileName=task-result-a.pdf`,
      {
        headers: {
          ...identity,
          'idempotency-key': randomUUID(),
          'content-type': 'application/pdf',
        },
        data: pdfA,
      },
    );
    expect(upload.status()).toBe(201);
    expect(
      (
        await page.request.post(
          `${origin}/documents/${documentId}/versions/${versionId}/official-designation`,
          {
            headers: { ...identity, 'idempotency-key': randomUUID() },
            data: { expectedRevision: 2 },
          },
        )
      ).status(),
    ).toBe(200);
    await post(`/documents/${documentId}/project-association`, {
      action: 'link',
      projectId,
      expectedRevision: 0,
    });
    let tasks = await openTask();
    let results = tasks.locator('.task-results');
    await expect(results.getByText('No declared result.')).toBeVisible();
    await results.getByLabel('Result declaration').fill(firstText);
    await results.getByLabel('Frozen mission Version').focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(results.getByLabel('Frozen mission Version')).toHaveText(
      new RegExp(title, 'u'),
    );
    await expect(page.locator('body')).toHaveJSProperty(
      'scrollWidth',
      await page.evaluate(() => document.documentElement.clientWidth),
    );
    await results.screenshot({
      path: testInfo.outputPath('task-result-record-form.png'),
    });
    await results
      .getByRole('button', { name: 'Record result', exact: true })
      .click();
    await expect(results.getByText('Result confirmed.')).toBeVisible();
    await expect(results.getByText(firstText, { exact: true })).toBeVisible();
    await exactDownload(
      page,
      results.getByRole('button', {
        name: 'Download exact PDF · Version 1',
        exact: true,
      }),
      pdfA,
    );
    await navigate(page, 'Working Documents', narrow);
    const documents = page.locator('.working-documents');
    await documents.getByRole('button', { name: title, exact: true }).click();
    await documents
      .getByRole('button', { name: 'Start new draft', exact: true })
      .click();
    const successor = documents.locator('.working-document-version').filter({
      has: page.getByRole('heading', { name: 'Version 2', exact: true }),
    });
    await successor.getByLabel('Choose the PDF file').setInputFiles({
      name: 'task-result-b.pdf',
      mimeType: 'application/pdf',
      buffer: pdfB,
    });
    await successor
      .getByRole('button', { name: 'Preserve PDF', exact: true })
      .click();
    await expect(
      successor.getByText('task-result-b.pdf', { exact: true }),
    ).toBeVisible();
    await successor
      .getByRole('button', { name: 'Designate as official', exact: true })
      .click();
    await documents
      .getByRole('button', { name: 'Confirm official designation' })
      .click();
    tasks = await openTask();
    results = tasks.locator('.task-results');
    await expect(results.getByText(firstText, { exact: true })).toBeVisible();
    await expect(results.getByText(/Superseded · historical/u)).toBeVisible();
    await exactDownload(
      page,
      results.getByRole('button', {
        name: 'Download exact PDF · Version 1',
        exact: true,
      }),
      pdfA,
    );
    await results
      .getByRole('button', { name: 'Correct result', exact: true })
      .click();
    await results.getByLabel('Result declaration').fill(secondText);
    await selectOption(results.getByLabel('Frozen mission Version'), {
      label: `${title} · 2 · Official`,
    });
    await results
      .getByLabel('Correction reason')
      .fill('New preserved output DEMO');
    await results
      .getByRole('button', { name: 'Save correction', exact: true })
      .click();
    await expect(results.getByText(secondText, { exact: true })).toBeVisible();
    await exactDownload(
      page,
      results.getByRole('button', {
        name: 'Download exact PDF · Version 2',
        exact: true,
      }),
      pdfB,
    );
    await tasks.getByRole('button', { name: 'Mark done', exact: true }).click();
    await expect(
      results.getByText(/Result history is read-only/u),
    ).toBeVisible();
    await tasks
      .getByRole('button', { name: 'Reopen Task', exact: true })
      .click();
    await expect(
      results.getByRole('button', { name: 'Correct result', exact: true }),
    ).toBeVisible();
    await results
      .getByRole('button', { name: 'Result history', exact: true })
      .click();
    const history = results.getByRole('list');
    await expect(history.getByRole('listitem')).toHaveCount(2);
    await expect(history.getByRole('listitem').nth(0)).toContainText(
      secondText,
    );
    await expect(history.getByRole('listitem').nth(1)).toContainText(firstText);
    await exactDownload(
      page,
      history.getByRole('button', {
        name: 'Download exact PDF · Version 1',
        exact: true,
      }),
      pdfA,
    );
    await expect(page.locator('body')).toHaveJSProperty(
      'scrollWidth',
      await page.evaluate(() => document.documentElement.clientWidth),
    );
    await results
      .getByRole('heading', { name: 'Declared Task result', exact: true })
      .click();
    await page.screenshot({
      path: testInfo.outputPath('task-result-exact-history.png'),
      fullPage: true,
    });
    await results.screenshot({
      path: testInfo.outputPath('task-result-protected-history.png'),
    });
    await assign('task-result-recorder', false);
    tasks = await openTask();
    results = tasks.locator('.task-results');
    await expect(results.getByText(secondText, { exact: true })).toBeVisible();
    await expect(
      results.getByRole('button', { name: 'Correct result', exact: true }),
    ).toHaveCount(0);
    await assign('document-content-reader', false);
    tasks = await openTask();
    results = tasks.locator('.task-results');
    await expect(
      tasks.getByRole('heading', { name: taskTitle, exact: true }),
    ).toBeVisible();
    await expect(
      results.getByText(
        'Task result access is unavailable. Ordinary Task work remains separate.',
      ),
    ).toBeVisible();
    await expect(results.getByText(secondText, { exact: true })).toHaveCount(0);
    await expect(
      results.getByRole('button', { name: /Download exact PDF/u }),
    ).toHaveCount(0);
    expect(
      (
        await page.request.get(`${origin}/tasks/${taskId}/results/history`, {
          headers: identity,
        })
      ).status(),
    ).toBe(404);
  } finally {
    for (const bundle of [...grants].reverse()) await assign(bundle, false);
  }
});
