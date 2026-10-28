import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { selectOption } from './select-option';
const origin = 'http://127.0.0.1:4174/api';
const actor = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'local-demonstration-user',
  'x-test-display-name': 'Ada Ionescu',
  'x-test-email': 'ada@example.test',
};
const owner = {
  ...actor,
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};
function object(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw new Error('Expected response');
  return Object.fromEntries(Object.entries(v));
}
function text(v: unknown) {
  if (typeof v !== 'string' || !v) throw new Error('Expected identity');
  return v;
}
async function navigate(page: Page, narrow: boolean) {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: 'Projects', exact: true })
    .click();
}
test('inspects later configured current work, opens exact native Task and returns freshly with independent result denial', async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const narrow = info.project.name.endsWith('narrow'),
    suffix = narrow ? 'Narrow' : 'Desktop',
    membershipId = text(process.env.ACCEPTANCE_PRIMARY_MEMBERSHIP_ID);
  const created = await page.request.post(origin + '/companies', {
    headers: { ...owner, 'idempotency-key': randomUUID() },
    data: { displayName: 'Current work DEMO ' + suffix },
  });
  expect(created.status()).toBe(201);
  const companyId = text(object(await created.json()).id);
  async function grant(bundle: string, active = true) {
    const path = origin + '/company-' + bundle + '-assignments';
    const response = active
      ? await page.request.post(path, {
          headers: { ...owner, 'idempotency-key': randomUUID() },
          data: { companyId, workspaceMembershipId: membershipId },
        })
      : await page.request.delete(path + '/' + membershipId + '/' + companyId, {
          headers: { ...owner, 'idempotency-key': randomUUID() },
        });
    expect(response.status()).toBe(active ? 201 : 200);
  }
  for (const bundle of [
    'context',
    'director-client',
    'project',
    'task-manager',
    'mission-plan-configuration',
    'mission-plan-user',
    'document-registrar',
    'mission-deliverable-access',
    'document-content-reader',
    'document-content-uploader',
    'document-approver',
    'document-project-organizer',
    'task-result-recorder',
  ])
    await grant(bundle);
  const headers = { ...actor, 'x-company-context-id': companyId };
  async function post(path: string, data: unknown) {
    const response = await page.request.post(origin + path, {
      headers: { ...headers, 'idempotency-key': randomUUID() },
      data,
    });
    expect(response.status(), path).toBe(201);
    return object(await response.json());
  }
  const clientId = text(
    (
      await post('/clients', {
        displayName: 'Current-work Client DEMO ' + suffix,
      })
    ).id,
  );
  const activities = Array.from({ length: 26 }, (_, i) => ({
    key: randomUUID(),
    title: `Initial activity ${i + 1} DEMO`,
    activity: ` Preserved action ${i + 1}\nЖ / é `,
    intendedResult: ` Preserved intended result ${i + 1}\n🌍 `,
  }));
  const version = object(
    (
      await post('/mission-plans', {
        title: 'Original source DEMO ' + suffix,
        activities,
      })
    ).version,
  );
  const projectName = 'Current-work Project DEMO ' + suffix,
    projectId = text(
      (
        await post('/projects/from-mission-plan', {
          title: projectName,
          clientAccountId: clientId,
          planId: version.planId,
          versionId: version.id,
          versionNumber: 1,
        })
      ).id,
    );
  const copyResponse = await page.request.get(
    origin + `/projects/${projectId}/mission-plan`,
    { headers },
  );
  expect(copyResponse.status()).toBe(200);
  const copy = object(object(await copyResponse.json()).plan);
  if (!Array.isArray(copy.tasks)) throw new Error('Missing mappings');
  const taskId = text(object(copy.tasks[25]).taskId);
  const edit = await page.request.patch(origin + `/tasks/${taskId}`, {
    headers: { ...headers, 'idempotency-key': randomUUID() },
    data: {
      expectedVersion: 1,
      title: 'Current Task26 DEMO ' + suffix,
      priority: 'critical',
      dueDate: '2026-11-07',
      assigneeMembershipId: membershipId,
    },
  });
  expect(edit.status()).toBe(200);
  await post(`/tasks/${taskId}/status`, {
    expectedVersion: 2,
    status: 'blocked',
    reason: 'Current literal blockage Ж / é',
  });
  const doc = await post('/documents', {
      type: 'mission-deliverable',
      clientId,
      title: 'Frozen current-work output DEMO ' + suffix,
      purpose: 'Synthetic declared result',
    }),
    documentId = text(doc.id),
    versionId = text(object(doc.version).id);
  const bytes = await readFile(
    new URL(
      '../../api/test-support/fixtures/questionnaire-demo.pdf',
      import.meta.url,
    ),
  );
  const upload = await page.request.post(
    origin +
      `/documents/${documentId}/versions/${versionId}/content?expectedRevision=1&fileName=current-work.pdf`,
    {
      headers: {
        ...headers,
        'idempotency-key': randomUUID(),
        'content-type': 'application/pdf',
      },
      data: bytes,
    },
  );
  expect(upload.status()).toBe(201);
  const designation = await page.request.post(
    origin +
      `/documents/${documentId}/versions/${versionId}/official-designation`,
    {
      headers: { ...headers, 'idempotency-key': randomUUID() },
      data: { expectedRevision: 2 },
    },
  );
  expect(designation.status()).toBe(200);
  await post(`/documents/${documentId}/project-association`, {
    action: 'link',
    projectId,
    expectedRevision: 0,
  });
  await post(`/tasks/${taskId}/results`, {
    expectedTaskVersion: 3,
    expectedResultRevision: 0,
    documentId,
    versionId,
    declaration: 'Original current-work declaration',
  });
  await post(`/tasks/${taskId}/results/corrections`, {
    expectedTaskVersion: 3,
    expectedResultRevision: 1,
    documentId,
    versionId,
    declaration: 'Corrected current declaration Ж / é',
    reason: 'Current correction reason',
  });
  await post(`/mission-plans/${text(version.planId)}/versions`, {
    title: 'Reordered later source DEMO',
    expectedHeadVersion: 1,
    activities: [...activities].reverse().map((a) => ({
      ...a,
      intendedResult: 'Later successor intended result',
    })),
  });
  let reads = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.endsWith('/mission-plan/current-work'))
      reads++;
  });
  await page.goto('/');
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(
    page.getByLabel('Active Company', { exact: true }),
    companyId,
  );
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
  await navigate(page, narrow);
  const projects = page.locator('.project-workspace');
  await projects
    .getByRole('searchbox', { name: 'Find Projects' })
    .fill(projectName);
  await projects
    .getByRole('list', { name: 'Projects' })
    .getByRole('button', { name: new RegExp(projectName, 'u') })
    .click();
  const panel = page.getByRole('region', { name: 'Current mission work' });
  await expect(panel.getByText('Activities 1–25 of 26')).toBeVisible();
  await panel.getByRole('button', { name: 'Next activities' }).focus();
  await page.keyboard.press('Enter');
  await expect(panel.getByText('Activities 26–26 of 26')).toBeVisible();
  expect(reads).toBe(1);
  await expect(
    panel.getByText('Preserved intended result 26 🌍', { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText('Corrected current declaration Ж / é', { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByText('Current literal blockage Ж / é', { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText('2026-11-07', { exact: true })).toBeVisible();
  await expect(page.locator('body')).toHaveJSProperty(
    'scrollWidth',
    await page.evaluate(() => document.documentElement.clientWidth),
  );
  await panel.screenshot({
    path: info.outputPath('later-window-current-work.png'),
  });
  const exact = panel.getByRole('button', {
    name: 'Open current Task: Current Task26 DEMO ' + suffix,
  });
  await exact.focus();
  await page.keyboard.press('Enter');
  await expect(projects.getByLabel('Task title', { exact: true })).toHaveValue(
    'Current Task26 DEMO ' + suffix,
  );
  await projects
    .getByLabel('Task title', { exact: true })
    .fill('Fresh native Task26 DEMO ' + suffix);
  await projects
    .getByRole('button', { name: 'Save Task', exact: true })
    .click();
  await expect(
    projects.getByText('Task change recorded.', { exact: true }),
  ).toBeVisible();
  await panel
    .getByRole('button', { name: 'Return to fresh current work' })
    .click();
  const fresh = panel.getByRole('button', {
    name: 'Open current Task: Fresh native Task26 DEMO ' + suffix,
  });
  await expect(fresh).toBeFocused();
  await expect(panel.getByText('Activities 26–26 of 26')).toBeVisible();
  expect(reads).toBe(2);
  await expect(
    panel.getByText('Preserved intended result 26 🌍', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('exact-task-fresh-return.png'),
  });
  await grant('document-content-reader', false);
  await panel.getByRole('button', { name: 'Refresh current work' }).click();
  await expect(
    panel.getByText(
      'Result access unavailable. Ordinary Task work remains available.',
    ),
  ).toBeVisible();
  await expect(
    panel.getByText('Corrected current declaration Ж / é'),
  ).toHaveCount(0);
  await expect(fresh).toBeEnabled();
  await expect(page.locator('body')).toHaveJSProperty(
    'scrollWidth',
    await page.evaluate(() => document.documentElement.clientWidth),
  );
  await panel.screenshot({
    path: info.outputPath('independent-result-denial.png'),
  });
  const preserved = await page.request.get(
    origin + `/projects/${projectId}/mission-plan`,
    { headers },
  );
  expect(object(await preserved.json()).plan).toEqual(copy);
});
