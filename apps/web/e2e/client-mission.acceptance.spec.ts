import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { selectOption } from './select-option';

const origin = 'http://127.0.0.1:4174/api';
const owner = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};
const reader = {
  ...owner,
  'x-test-external-subject': 'local-demonstration-user',
  'x-test-display-name': 'Ada Ionescu',
  'x-test-email': 'ada@example.test',
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a public response.');
  return Object.fromEntries(Object.entries(value));
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new Error('Expected a public identity.');
  return value;
}

test('continues a Client mission beyond its first scoped page through its exact Task and independent human review', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const narrow = info.project.name.endsWith('narrow');
  const suffix = narrow ? 'Narrow' : 'Desktop';
  const companyName = `Client missions DEMO ${suffix}`;
  const clientName = `Mission Client DEMO ${suffix}`;
  const projectTitle = `Representative mission DEMO ${suffix}`;
  async function post(
    path: string,
    data: unknown,
    identity = owner,
    companyId?: string,
  ) {
    const response = await page.request.post(origin + path, {
      headers: {
        ...identity,
        ...(companyId ? { 'x-company-context-id': companyId } : {}),
        'idempotency-key': randomUUID(),
      },
      data,
    });
    expect(response.status(), path).toBe(201);
    return object(await response.json());
  }
  const companyId = text(
    (await post('/companies', { displayName: companyName })).id,
  );
  const actor = await page.request.get(origin + '/access/current-actor', {
    headers: reader,
  });
  expect(actor.status()).toBe(200);
  const membershipId = text(object(await actor.json()).workspaceMembershipId);
  for (const bundle of [
    'context',
    'director-client',
    'project',
    'task-manager',
    'project-template-user',
    'document-registrar',
    'document-content-reader',
    'mission-deliverable-access',
    'mission-result-reviewer',
  ])
    await post(`/company-${bundle}-assignments`, {
      companyId,
      workspaceMembershipId: membershipId,
    });
  const headers = { ...reader, 'x-company-context-id': companyId };
  const clientId = text(
    (await post('/clients', { displayName: clientName }, reader, companyId)).id,
  );
  const unrelatedId = text(
    (
      await post(
        '/clients',
        { displayName: `Other Client DEMO ${suffix}` },
        reader,
        companyId,
      )
    ).id,
  );
  for (let index = 0; index < 52; index += 1)
    await post(
      '/projects',
      {
        title: `Unrelated Company Project ${index} ${suffix}`,
        clientAccountId: unrelatedId,
      },
      reader,
      companyId,
    );
  for (let index = 0; index < 25; index += 1)
    await post(
      '/projects',
      {
        title: `Client preparation ${index} ${suffix}`,
        clientAccountId: clientId,
      },
      reader,
      companyId,
    );
  const projectId = text(
    (
      await post(
        '/projects/from-template',
        {
          title: projectTitle,
          clientAccountId: clientId,
          templateKey: 'CONSULTING_MISSION_PILOT_ILLUSTRATIVE',
          templateVersion: 1,
        },
        reader,
        companyId,
      )
    ).id,
  );
  const responsible = await page.request.put(
    `${origin}/projects/${projectId}/responsible`,
    {
      headers: { ...headers, 'idempotency-key': randomUUID() },
      data: { expectedRevision: 0, workspaceMembershipId: membershipId },
    },
  );
  expect(responsible.status()).toBe(200);
  const responsibilityLabel = text(
    object(object(await responsible.json()).responsible).displayLabel,
  );
  const planResponse = await page.request.get(
    `${origin}/projects/${projectId}/template`,
    { headers },
  );
  expect(planResponse.status()).toBe(200);
  const plan = object(object(await planResponse.json()).template);
  if (!Array.isArray(plan.activities))
    throw new Error('Expected copied pilot activities.');
  const activities: unknown[] = plan.activities;
  const first = object(activities[0]);
  expect(first.key).toBe('CT_AN01');
  const taskId = text(first.taskId);
  const taskRead = await page.request.get(`${origin}/tasks/${taskId}`, {
    headers,
  });
  expect(taskRead.status()).toBe(200);
  const taskTitle = text(object(object(await taskRead.json()).task).title);
  const edited = await page.request.patch(`${origin}/tasks/${taskId}`, {
    headers: { ...headers, 'idempotency-key': randomUUID() },
    data: {
      expectedVersion: 1,
      assigneeMembershipId: membershipId,
      dueDate: '2030-01-15',
    },
  });
  expect(edited.status()).toBe(200);
  const assigneeLabel = text(
    object(object(await edited.json()).assignee).displayLabel,
  );
  await post(
    `/tasks/${taskId}/complete`,
    { expectedVersion: 2 },
    reader,
    companyId,
  );

  async function navigate(label: string) {
    if (narrow)
      await page
        .getByRole('button', { name: 'Open navigation', exact: true })
        .click();
    await page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name: label, exact: true })
      .click();
  }
  async function openDossier() {
    await navigate('Clients');
    const row = page
      .locator('.client-directory li')
      .filter({ has: page.getByText(clientName, { exact: true }) });
    await row
      .getByRole('button', { name: 'Open dossier', exact: true })
      .click();
    const dossier = page.getByRole('region', { name: clientName, exact: true });
    await expect(dossier).toBeVisible();
    return dossier;
  }
  async function chooseCompany() {
    if (narrow)
      await page
        .getByRole('button', { name: 'Open navigation', exact: true })
        .click();
    await selectOption(
      page.getByLabel('Active Company', { exact: true }),
      companyId,
    );
    if (narrow)
      await page
        .getByRole('button', { name: 'Close navigation', exact: true })
        .click();
  }
  await page.goto('/');
  await chooseCompany();
  let dossier = await openDossier();
  let missions = dossier.getByRole('region', {
    name: 'Client missions',
    exact: true,
  });
  await expect(missions.locator('.client-mission-list > li')).toHaveCount(25);
  await expect(missions.getByText(/Unrelated Company Project/u)).toHaveCount(0);
  await expect(
    missions.getByRole('button', { name: 'Create Task', exact: true }),
  ).toHaveCount(0);
  await missions
    .getByRole('button', { name: 'Next missions', exact: true })
    .click();
  await expect(
    missions.getByRole('heading', { name: projectTitle, exact: true }),
  ).toBeVisible();
  await expect(
    missions.getByText(responsibilityLabel, { exact: true }),
  ).toBeVisible();
  await expect(
    missions.getByRole('heading', { name: 'Client missions', exact: true }),
  ).toBeFocused();
  await missions.screenshot({
    path: info.outputPath(`client-mission-project-${suffix.toLowerCase()}.png`),
  });
  await missions
    .getByRole('button', { name: `View Tasks: ${projectTitle}`, exact: true })
    .click();
  const preview = missions.getByRole('region', {
    name: `Tasks for: ${projectTitle}`,
    exact: true,
  });
  await expect(preview.locator('.client-mission-list > li')).toHaveCount(13);
  const firstTask = preview
    .getByRole('heading', { name: taskTitle, exact: true })
    .locator('..');
  await expect(firstTask.getByText('Done', { exact: false })).toBeVisible();
  await expect(
    firstTask.getByText(assigneeLabel, { exact: true }),
  ).toBeVisible();
  await expect(firstTask.locator('time[datetime="2030-01-15"]')).toBeVisible();
  await firstTask.screenshot({
    path: info.outputPath(`client-mission-task-${suffix.toLowerCase()}.png`),
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await firstTask
    .getByRole('button', { name: `Open Task: ${taskTitle}`, exact: true })
    .click();
  const projects = page.locator('.project-workspace');
  const tasks = projects.locator('.project-tasks');
  await expect(
    tasks.getByRole('heading', { name: taskTitle, exact: true }),
  ).toBeFocused();
  await expect(
    tasks.locator('.task-facts time[datetime="2030-01-15"]'),
  ).toBeVisible();
  // Done is an existing read-only Task state; the preview did not invent completion or a result.
  await expect(
    tasks.getByRole('button', { name: 'Save Task', exact: true }),
  ).toHaveCount(0);
  const review = projects.getByRole('region', {
    name: 'Mission result review',
    exact: true,
  });
  await expect(review.getByRole('checkbox')).toHaveCount(13);
  await review
    .getByRole('checkbox', { name: 'Select activity — CT_AN01', exact: true })
    .check();
  await review
    .getByRole('textbox', {
      name: 'Literal external reference — CT_AN01',
      exact: true,
    })
    .fill('Synthetic Client mission register DEMO900');
  await review
    .getByRole('combobox', { name: 'Review outcome', exact: true })
    .selectOption('ACCEPTED_BY_REVIEWER');
  await review
    .getByRole('textbox', { name: 'Shared review basis', exact: true })
    .fill(
      'Synthetic attributed review of this exact activity and observed Task; no fulfillment or certification inference.',
    );
  await review
    .getByRole('button', { name: 'Record human review', exact: true })
    .click();
  await expect(
    review.getByText('Review confirmed.', { exact: true }),
  ).toBeVisible();
  await expect(
    review.getByText('Observed app facts still match', { exact: true }),
  ).toHaveCount(1);
  await review.screenshot({
    path: info.outputPath(`client-mission-review-${suffix.toLowerCase()}.png`),
  });

  const revoked = await page.request.delete(
    `${origin}/company-task-manager-assignments/${membershipId}/${companyId}`,
    {
      headers: { ...owner, 'idempotency-key': randomUUID() },
    },
  );
  expect(revoked.status()).toBe(200);
  expect(
    (
      await page.request.get(`${origin}/projects/${projectId}/tasks`, {
        headers,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.get(`${origin}/projects/${projectId}`, { headers })
    ).status(),
  ).toBe(200);
  await page.reload();
  await chooseCompany();
  dossier = await openDossier();
  missions = dossier.getByRole('region', {
    name: 'Client missions',
    exact: true,
  });
  await missions
    .getByRole('button', { name: 'Next missions', exact: true })
    .click();
  await expect(
    missions.getByRole('heading', { name: projectTitle, exact: true }),
  ).toBeVisible();
  await expect(
    missions.getByRole('button', {
      name: `View Tasks: ${projectTitle}`,
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    dossier.getByRole('heading', { name: clientName, exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(page.url()).not.toContain(clientId);
  expect(page.url()).not.toContain(projectId);
  expect(page.url()).not.toContain(taskId);
});
