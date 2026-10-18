import { randomUUID } from 'node:crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from '@playwright/test';
import { selectOption } from './select-option';

const apiOrigin = 'http://127.0.0.1:4174';
const owner = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};
const ada = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'local-demonstration-user',
  'x-test-display-name': 'Ada Ionescu',
  'x-test-email': 'ada@example.test',
};
const sourceTitles = [
  'Clarifier la demande',
  'Confirmer le périmètre',
  'Recueillir le questionnaire',
  'Préparer le plan',
];

// Real UI, API and disposable PostgreSQL. Only grant configuration uses the
// administrator API; the Client, Project, assignment and completion use UI.
test('creates and reopens a copied illustrative Project plan and completes an explicitly assigned Task', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'Narrow' : 'Desktop';
  const clientTitle = `Template acceptance Client ${suffix}`;
  const projectTitle = `Préparation {originale} — Демо ${suffix}`;
  const companyId = required('ACCEPTANCE_PRIMARY_COMPANY_ID');
  const membershipId = required('ACCEPTANCE_PRIMARY_MEMBERSHIP_ID');
  await grantTemplate(page.request, membershipId, companyId);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Hello, Ada Ionescu.' }),
  ).toBeVisible();
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(
    page.getByLabel('Active Company', { exact: true }),
    companyId,
  );
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
  await navigate(page, 'Clients', narrow);
  const clients = page.locator('.client-workspace');
  await clients
    .getByRole('button', { name: 'New Client', exact: true })
    .click();
  await clients.getByLabel('Client display name').fill(clientTitle);
  const clientWrite = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/clients',
  );
  await clients
    .getByRole('button', { name: 'Create Client', exact: true })
    .click();
  const clientResponse = await clientWrite;
  expect(clientResponse.status()).toBe(201);
  const clientValue: unknown = await clientResponse.json();
  const clientId = identifier(clientValue);
  await expect(
    clients.getByRole('heading', { name: clientTitle, exact: true }),
  ).toBeVisible();
  await navigate(page, 'Projects', narrow);
  const projects = page.locator('.project-workspace');
  await expect(
    projects.getByRole('combobox', { name: 'Project template' }),
  ).toBeVisible();
  // The shell keeps the Project owner mounted while registering the Client.
  // Refresh its earlier Client choices through the existing public UI.
  const clientChoicesRead = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === '/api/clients' &&
      response.request().headers()['x-company-context-id'] === companyId,
  );
  await projects.getByRole('button', { name: 'Reload Projects' }).click();
  const clientChoicesResponse = await clientChoicesRead;
  expect(clientChoicesResponse.status()).toBe(200);
  const clientChoices: unknown = await clientChoicesResponse.json();
  expect(clientChoices).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: clientId,
        displayName: clientTitle,
        relatedToActiveCompany: true,
      }),
    ]),
  );
  await projects
    .getByLabel('Project title', { exact: true })
    .fill(projectTitle);
  const clientChoice = projects.getByLabel('Client', { exact: true });
  await selectOption(clientChoice, { label: clientTitle });
  await expect(clientChoice).toHaveAttribute('data-value', clientId);
  await selectOption(
    projects.getByLabel('Project template', { exact: true }),
    'CONSULTING_PREPARATION_ILLUSTRATIVE:1',
  );
  await expect(
    projects.getByText(
      'Illustrative template. Creates four unassigned Tasks without due dates. Does not authorize a real engagement to start.',
    ),
  ).toBeVisible();

  const writes: Array<{
    body: string | null;
    key: string | undefined;
    company: string | undefined;
  }> = [];
  let committedProjectId = '';
  await page.route('**/api/projects/from-template', async (route) => {
    const request = route.request();
    writes.push({
      body: request.postData(),
      key: request.headers()['idempotency-key'],
      company: request.headers()['x-company-context-id'],
    });
    if (writes.length === 1) {
      // Commit the real command, then lose only the transport confirmation.
      const committed = await route.fetch();
      expect(committed.status()).toBe(201);
      const value: unknown = await committed.json();
      committedProjectId = identifier(value);
      return route.fulfill({
        status: 503,
        body: 'Synthetic lost confirmation',
      });
    }
    return route.continue();
  });
  await projects
    .getByRole('button', { name: 'Create Project from template', exact: true })
    .click();
  await expect(
    projects.getByText(
      'The Project creation could not be confirmed. Retry the same details safely.',
    ),
  ).toBeVisible();
  expect(writes).toHaveLength(1);
  const first = writes[0];
  if (!first) throw new Error('The creation command was not observed.');
  const input: unknown = JSON.parse(first.body ?? '{}');
  expect(input).toEqual({
    title: projectTitle,
    clientAccountId: clientId,
    templateKey: 'CONSULTING_PREPARATION_ILLUSTRATIVE',
    templateVersion: 1,
  });
  expect(first.key).toBeTruthy();
  expect(first.company).toBe(companyId);
  for (const [locale, titleLabel, createLabel] of [
    ['fr', 'Titre du Projet', 'Créer le Projet depuis le modèle'],
    ['ru', 'Название Проекта', 'Создать Проект из шаблона'],
    ['ro', 'Titlul Proiectului', 'Creați Proiectul din model'],
    ['en', 'Project title', 'Create Project from template'],
  ]) {
    if (!locale || !titleLabel || !createLabel)
      throw new Error('Incomplete locale expectation.');
    await selectOption(page.locator('#interface-locale'), locale);
    await expect(projects.getByLabel(titleLabel, { exact: true })).toHaveValue(
      projectTitle,
    );
    await expect(
      projects.getByRole('button', { name: createLabel, exact: true }),
    ).toBeEnabled();
    expect(writes).toHaveLength(1);
  }
  const replay = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/projects/from-template',
  );
  await projects
    .getByRole('button', { name: 'Create Project from template', exact: true })
    .click();
  expect((await replay).status()).toBe(201);
  await expect(
    projects.getByRole('heading', { name: projectTitle, exact: true }),
  ).toBeVisible();
  expect(writes).toHaveLength(2);
  expect(writes[1]).toEqual(first);
  expect(committedProjectId).not.toBe('');
  const plan = projects.getByRole('region', {
    name: 'Plan copied from template',
  });
  await expect(
    plan.getByText('Préparation d’une mission de conseil — Version 1', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    plan.getByRole('heading', { name: 'Cadrage', exact: true }),
  ).toBeVisible();
  await expect(
    plan.getByRole('heading', { name: 'Préparation', exact: true }),
  ).toBeVisible();
  for (const title of sourceTitles)
    await expect(
      plan.getByText(`${title} — Required`, { exact: true }),
    ).toBeVisible();
  const tasks = page.locator('.project-tasks');
  const taskNavigation = tasks.getByRole('navigation', {
    name: 'Tasks',
    exact: true,
  });
  const taskRows = taskNavigation.getByRole('list').getByRole('listitem');
  const responsibleChoice = tasks
    .locator('form')
    .getByRole('combobox', { name: 'Responsible member', exact: true });
  const taskFacts = tasks.locator('.task-facts');
  const responsibleFact = taskFacts
    .locator('div')
    .filter({
      has: page.getByText('Responsible member', { exact: true }),
    })
    .getByRole('definition');
  await expect(taskRows.getByRole('button')).toHaveCount(4);
  for (const title of sourceTitles)
    await expect(
      taskRows.getByRole('button', { name: title, exact: true }),
    ).toHaveCount(1);
  await tasks
    .getByRole('button', { name: 'Clarifier la demande', exact: true })
    .click();
  await expect(responsibleFact).toHaveText('Unassigned');
  await expect(
    taskFacts.getByText('No due date', { exact: true }),
  ).toBeVisible();
  await expect(responsibleChoice).toBeEnabled();
  await selectOption(responsibleChoice, membershipId);
  await expect(responsibleChoice).toHaveAttribute('data-value', membershipId);
  const assignmentWrite = page.waitForResponse(
    (response) =>
      response.request().method() === 'PATCH' &&
      /^\/api\/tasks\/[^/]+$/u.test(new URL(response.url()).pathname),
  );
  await tasks.getByRole('button', { name: 'Save Task', exact: true }).click();
  const assignmentResponse = await assignmentWrite;
  expect(assignmentResponse.status()).toBe(200);
  const assignedTask: unknown = await assignmentResponse.json();
  const firstTaskId = identifier(assignedTask);
  expect(assignedTask).toMatchObject({
    status: 'todo',
    version: 2,
    assignee: { workspaceMembershipId: membershipId },
  });
  await expect(responsibleFact).toContainText('Ada Ionescu');
  await expect(
    tasks.getByRole('button', { name: 'Mark done', exact: true }),
  ).toBeEnabled();

  // A second real command makes the opened Task stale. The existing owner
  // must reject the old completion before an explicit reload and new command.
  const concurrentEdit = await page.request.patch(
    `${apiOrigin}/api/tasks/${firstTaskId}`,
    {
      headers: {
        ...ada,
        'x-company-context-id': companyId,
        'idempotency-key': randomUUID(),
      },
      data: { expectedVersion: 2, dueDate: '2026-12-01' },
    },
  );
  expect(concurrentEdit.status()).toBe(200);
  const concurrentTask: unknown = await concurrentEdit.json();
  expect(concurrentTask).toMatchObject({
    id: firstTaskId,
    status: 'todo',
    version: 3,
    dueDate: '2026-12-01',
  });
  const staleCompletion = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === `/api/tasks/${firstTaskId}/complete`,
  );
  await tasks.getByRole('button', { name: 'Mark done', exact: true }).click();
  expect((await staleCompletion).status()).toBe(409);
  await expect(
    tasks.getByText(
      'This Task or its permissions changed. Reload the Task before making another change.',
      { exact: true },
    ),
  ).toBeVisible();
  await tasks.getByRole('button', { name: 'Reload Task', exact: true }).click();
  await expect(
    tasks.getByRole('button', { name: 'Mark done', exact: true }),
  ).toBeEnabled();
  const currentCompletion = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === `/api/tasks/${firstTaskId}/complete`,
  );
  await tasks.getByRole('button', { name: 'Mark done', exact: true }).click();
  const completedResponse = await currentCompletion;
  expect(completedResponse.status()).toBe(201);
  const completedTask: unknown = await completedResponse.json();
  expect(completedTask).toMatchObject({
    id: firstTaskId,
    status: 'done',
    version: 4,
  });
  await expect(
    tasks.getByRole('button', { name: 'Reopen Task', exact: true }),
  ).toBeVisible();
  await expect(
    tasks.getByText('Completion declared by Ada Ionescu', { exact: false }),
  ).toBeVisible();
  await tasks
    .getByRole('button', { name: 'Confirmer le périmètre', exact: true })
    .click();
  await expect(responsibleChoice).toBeEnabled();
  await selectOption(responsibleChoice, membershipId);
  await expect(responsibleChoice).toHaveAttribute('data-value', membershipId);
  await tasks.getByRole('button', { name: 'Save Task', exact: true }).click();
  await expect(responsibleFact).toContainText('Ada Ionescu');
  await tasks.getByRole('button', { name: 'Mark done', exact: true }).click();
  await expect(
    tasks.getByRole('button', { name: 'Reopen Task', exact: true }),
  ).toBeVisible();
  await expect(
    projects
      .getByRole('region', { name: 'Lifecycle' })
      .getByText('Preparatory', { exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath(`template-${suffix.toLowerCase()}-completed.png`),
    fullPage: true,
  });

  await page.reload();
  await projects
    .getByRole('list', { name: 'Projects', exact: true })
    .getByRole('button')
    .filter({ hasText: projectTitle })
    .click();
  await expect(
    plan.getByText('Préparation d’une mission de conseil — Version 1', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(taskRows.getByRole('button')).toHaveCount(4);
  await tasks
    .getByRole('button', { name: 'Clarifier la demande', exact: true })
    .click();
  await expect(
    tasks.getByRole('button', { name: 'Reopen Task', exact: true }),
  ).toBeVisible();
  await expect(
    tasks
      .getByRole('region', { name: 'Task history' })
      .getByText('Completion declared', { exact: true }),
  ).toBeVisible();
  await expect(plan.getByRole('button')).toHaveCount(0);
  await noOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath(`template-${suffix.toLowerCase()}-reopened.png`),
    fullPage: true,
  });

  const visible = await page.request.get(`${apiOrigin}/api/projects`, {
    headers: { ...ada, 'x-company-context-id': companyId },
  });
  expect(visible.status()).toBe(200);
  const projectList: unknown = await visible.json();
  if (!Array.isArray(projectList)) throw new Error('Expected a Project list.');
  const values: unknown[] = projectList;
  expect(
    values.filter((value) => record(value) && value.id === committedProjectId),
  ).toHaveLength(1);
  // Keep the browser's old Template projection while the administrator revokes
  // the actual grant. Only the transport dispatch is held; the backend decides403.
  await page.unroute('**/api/projects/from-template');
  let releaseCreation: (() => void) | undefined;
  const creationGate = new Promise<void>((resolve) => {
    releaseCreation = resolve;
  });
  await page.route('**/api/projects/from-template', async (route) => {
    await creationGate;
    const response = await route.fetch();
    expect(response.status()).toBe(403);
    await route.fulfill({ response });
  });
  await projects
    .getByLabel('Project title', { exact: true })
    .fill(`Denied ${suffix}`);
  await selectOption(projects.getByLabel('Client', { exact: true }), {
    label: clientTitle,
  });
  await selectOption(
    projects.getByLabel('Project template', { exact: true }),
    'CONSULTING_PREPARATION_ILLUSTRATIVE:1',
  );
  const heldCreation = page.waitForRequest(
    (request) =>
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/projects/from-template',
  );
  await projects
    .getByRole('button', { name: 'Create Project from template', exact: true })
    .click();
  await heldCreation;
  const revoked = await page.request.delete(
    `${apiOrigin}/api/company-project-template-user-assignments/${membershipId}/${companyId}`,
    { headers: { ...owner, 'idempotency-key': randomUUID() } },
  );
  expect(revoked.status()).toBe(200);
  const refusedCreation = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/projects/from-template',
  );
  const recoveredProjects = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === '/api/projects',
  );
  if (!releaseCreation) throw new Error('The Template creation was not held.');
  releaseCreation();
  expect((await refusedCreation).status()).toBe(403);
  expect((await recoveredProjects).status()).toBe(200);
  await expect(
    projects.getByText('Explicit Project template access is required.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    projects.getByLabel('Project template', { exact: true }),
  ).toHaveCount(0);
  await expect(
    projects.getByRole('button', { name: 'Create Project', exact: true }),
  ).toBeEnabled();
  await projects
    .getByRole('list', { name: 'Projects', exact: true })
    .getByRole('button')
    .filter({ hasText: projectTitle })
    .click();
  await expect(taskRows.getByRole('button')).toHaveCount(4);
  await noOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(
      `template-${suffix.toLowerCase()}-denial-recovery.png`,
    ),
    fullPage: true,
  });
  const denied = await page.request.get(
    `${apiOrigin}/api/projects/${committedProjectId}/template`,
    { headers: { ...ada, 'x-company-context-id': companyId } },
  );
  expect(denied.status()).toBe(403);
  await page.reload();
  await expect(
    projects.getByRole('combobox', { name: 'Project template' }),
  ).toHaveCount(0);
  await projects
    .getByRole('list', { name: 'Projects', exact: true })
    .getByRole('button')
    .filter({ hasText: projectTitle })
    .click();
  await expect(taskRows.getByRole('button')).toHaveCount(4);
  await expect(
    projects.getByRole('region', { name: 'Plan copied from template' }),
  ).toHaveCount(0);
});

// #687: real App, API and disposable PostgreSQL. Only transport failure replies are injected.
test('advances the preserved first Project stage explicitly and retries its exact committed intent across locales', async ({
  page,
}, testInfo) => {
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'narrow' : 'desktop';
  const companyId = required('ACCEPTANCE_PRIMARY_COMPANY_ID');
  const membershipId = required('ACCEPTANCE_PRIMARY_MEMBERSHIP_ID');
  await grantTemplate(page.request, membershipId, companyId);
  const stageGrant = await page.request.post(
    `${apiOrigin}/api/company-project-stage-advancer-assignments`,
    {
      headers: { ...owner, 'idempotency-key': randomUUID() },
      data: { workspaceMembershipId: membershipId, companyId },
    },
  );
  expect(stageGrant.status()).toBe(201);
  const headers = { ...ada, 'x-company-context-id': companyId };
  const clientResponse = await page.request.post(`${apiOrigin}/api/clients`, {
    headers: { ...headers, 'idempotency-key': randomUUID() },
    data: { displayName: `Stage Client ${suffix}` },
  });
  expect(clientResponse.status()).toBe(201);
  const clientValue: unknown = await clientResponse.json();
  const clientId = identifier(clientValue);
  const title = `Stage preparation ${suffix}`;
  const creation = await page.request.post(
    `${apiOrigin}/api/projects/from-template`,
    {
      headers: { ...headers, 'idempotency-key': randomUUID() },
      data: {
        title,
        clientAccountId: clientId,
        templateKey: 'CONSULTING_PREPARATION_ILLUSTRATIVE',
        templateVersion: 1,
      },
    },
  );
  expect(creation.status()).toBe(201);
  const created: unknown = await creation.json();
  const projectId = identifier(created);
  await page.goto('/');
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(
    page.getByLabel('Active Company', { exact: true }),
    companyId,
  );
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
  await navigate(page, 'Projects', narrow);
  const projects = page.locator('.project-workspace');
  await projects
    .getByRole('list', { name: 'Projects', exact: true })
    .getByRole('button')
    .filter({ hasText: title })
    .click();
  const stage = projects.locator('.project-stage');
  const tasks = page.locator('.project-tasks');
  await expect(
    stage.getByText(
      'Complete both required Tasks before advancing. Cancelled Tasks do not satisfy this gate.',
    ),
  ).toBeVisible();
  await expect(
    stage.getByRole('button', { name: 'Advance to Préparation' }),
  ).toBeDisabled();
  await noOverflow(page);
  await stage.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath(`stage-${suffix}-blocked.png`),
  });
  await tasks
    .getByRole('button', { name: 'Clarifier la demande', exact: true })
    .click();
  await tasks.getByRole('button', { name: 'Mark done', exact: true }).click();
  await expect(
    tasks.getByRole('button', { name: 'Reopen Task', exact: true }),
  ).toBeVisible();
  await tasks
    .getByRole('button', { name: 'Confirmer le périmètre', exact: true })
    .click();
  await tasks.getByRole('button', { name: 'Cancel Task', exact: true }).click();
  await tasks
    .getByLabel('Cancellation reason')
    .fill('Cancellation is not completion.');
  await tasks
    .getByRole('button', { name: 'Save cancellation', exact: true })
    .click();
  await expect(
    tasks.getByRole('button', { name: 'Reopen Task', exact: true }),
  ).toBeVisible();
  await stage.getByRole('button', { name: 'Reload stage progress' }).click();
  await expect(
    stage.getByText('Confirmer le périmètre — Cancelled'),
  ).toBeVisible();
  await expect(
    stage.getByRole('button', { name: 'Advance to Préparation' }),
  ).toBeDisabled();
  await tasks.getByRole('button', { name: 'Reopen Task', exact: true }).click();
  await expect(
    tasks.getByRole('button', { name: 'Mark done', exact: true }),
  ).toBeVisible();
  await tasks.getByRole('button', { name: 'Mark done', exact: true }).click();
  await expect(
    tasks.getByRole('button', { name: 'Reopen Task', exact: true }),
  ).toBeVisible();
  await stage.getByRole('button', { name: 'Reload stage progress' }).click();
  await expect(
    stage.getByRole('button', { name: 'Advance to Préparation' }),
  ).toBeEnabled();
  const writes: { body: string | null; key: string | undefined }[] = [];
  await page.route(
    `**/api/projects/${projectId}/stage-advance`,
    async (route) => {
      writes.push({
        body: route.request().postData(),
        key: route.request().headers()['idempotency-key'],
      });
      if (writes.length === 1)
        return route.fulfill({
          status: 409,
          contentType: 'application/json',
          body: JSON.stringify({ code: 'project_stage_conflict' }),
        });
      if (writes.length === 2) {
        const committed = await route.fetch();
        expect(committed.status()).toBe(201);
        return route.fulfill({
          status: 503,
          body: 'Synthetic lost stage confirmation',
        });
      }
      return route.continue();
    },
  );
  await stage.getByRole('button', { name: 'Advance to Préparation' }).click();
  await expect(
    stage.getByText(
      'Stage progress changed or this intent conflicts. Reload before choosing another action.',
    ),
  ).toBeVisible();
  await stage.getByRole('button', { name: 'Reload stage progress' }).click();
  await expect(
    stage.getByRole('button', { name: 'Advance to Préparation' }),
  ).toBeEnabled();
  await projects
    .getByRole('textbox', { name: 'Project title', exact: true })
    .fill('Retain entered work through stage retry');
  await stage.getByRole('button', { name: 'Advance to Préparation' }).click();
  await expect(
    stage.getByText(
      'The stage change could not be confirmed. Retry the exact same intent explicitly.',
    ),
  ).toBeVisible();
  const language = page
    .locator('.interface-locale-control')
    .getByRole('combobox');
  await selectOption(language, 'ru');
  await expect(
    stage.getByRole('button', { name: 'Повторить переход этапа' }),
  ).toBeVisible();
  await noOverflow(page);
  await stage.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath(`stage-${suffix}-uncertain-ru.png`),
  });
  await selectOption(language, 'fr');
  await expect(
    stage.getByRole('button', { name: 'Réessayer le changement d’étape' }),
  ).toBeVisible();
  await selectOption(language, 'en');
  await expect(
    projects.getByRole('textbox', { name: 'Project title', exact: true }),
  ).toHaveValue('Retain entered work through stage retry');
  await stage.getByRole('button', { name: 'Retry stage advance' }).click();
  await expect(
    stage.getByText(
      'Last supported stage. No further transition is available.',
    ),
  ).toBeVisible();
  expect(writes).toHaveLength(3);
  expect(writes[2]).toEqual(writes[1]);
  expect(writes[1]?.key).not.toBe(writes[0]?.key);
  await expect(stage.getByText('Cadrage → Préparation')).toBeVisible();
  await expect(stage.getByText('Ada Ionescu', { exact: true })).toBeVisible();
  await expect(
    projects
      .getByRole('region', { name: 'Lifecycle' })
      .getByText('Preparatory', { exact: true }),
  ).toBeVisible();
  await tasks
    .getByRole('button', { name: 'Clarifier la demande', exact: true })
    .click();
  await tasks.getByRole('button', { name: 'Reopen Task', exact: true }).click();
  await expect(
    tasks.getByRole('button', { name: 'Mark done', exact: true }),
  ).toBeVisible();
  await stage.getByRole('button', { name: 'Reload stage progress' }).click();
  await expect(
    stage.getByText(
      'Last supported stage. No further transition is available.',
    ),
  ).toBeVisible();
  for (const locale of ['ro', 'ru', 'fr', 'en']) {
    await selectOption(language, locale);
    await expect(stage.getByText('Cadrage → Préparation')).toBeVisible();
    await noOverflow(page);
    await stage.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`stage-${suffix}-reached-${locale}.png`),
    });
  }
  await page.reload();
  await projects
    .getByRole('list', { name: 'Projects', exact: true })
    .getByRole('button')
    .filter({ hasText: title })
    .click();
  await expect(stage.getByText('Cadrage → Préparation')).toBeVisible();
  await expect(
    stage.getByText(
      'Last supported stage. No further transition is available.',
    ),
  ).toBeVisible();
  await noOverflow(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath(`stage-${suffix}-history-reloaded.png`),
    fullPage: true,
  });
});

async function grantTemplate(
  request: APIRequestContext,
  membershipId: string,
  companyId: string,
) {
  const response = await request.post(
    `${apiOrigin}/api/company-project-template-user-assignments`,
    {
      headers: { ...owner, 'idempotency-key': randomUUID() },
      data: { workspaceMembershipId: membershipId, companyId },
    },
  );
  expect(response.status()).toBe(201);
  const value: unknown = await response.json();
  expect(value).toMatchObject({
    bundle: 'Company Project Template User',
    permissionSetVersion: 'v1',
    active: true,
  });
}
async function navigate(page: Page, name: string, narrow: boolean) {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name, exact: true })
    .click();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
function required(name: string) {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} is required from the acceptance fixture.`);
  return value;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function identifier(value: unknown) {
  if (
    !record(value) ||
    typeof value.id !== 'string' ||
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
      value.id,
    )
  )
    throw new Error('Expected a persisted identifier.');
  return value.id;
}
