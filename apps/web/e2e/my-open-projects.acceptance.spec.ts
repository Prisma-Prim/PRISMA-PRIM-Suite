import { randomUUID } from 'node:crypto';
import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { selectOption } from './select-option';

type Subject =
  'workspace-owner' | 'local-demonstration-user' | 'responsible-colleague';
type Scope = { companyId?: string; subject?: Subject };
function headers({
  companyId,
  subject = 'local-demonstration-user',
}: Scope = {}) {
  return {
    'x-test-external-provider': 'local-demo',
    'x-test-external-subject': subject,
    'x-test-display-name':
      subject === 'workspace-owner'
        ? 'Workspace Owner'
        : subject === 'responsible-colleague'
          ? 'Ion Popa'
          : 'Ada Ionescu',
    'x-test-email':
      subject === 'workspace-owner'
        ? 'owner@example.test'
        : subject === 'responsible-colleague'
          ? 'ion@example.test'
          : 'ada@example.test',
    ...(companyId ? { 'x-company-context-id': companyId } : {}),
  };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected API object.');
  return Object.fromEntries(Object.entries(value));
}
function identifier(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected API identifier.');
  return value;
}
async function get(input: {
  request: APIRequestContext;
  path: string;
  scope?: Scope;
}) {
  const response = await input.request.get(`/api${input.path}`, {
    headers: headers(input.scope),
  });
  expect(response.status()).toBe(200);
  const value: unknown = await response.json();
  return value;
}
async function post(input: {
  request: APIRequestContext;
  path: string;
  value: unknown;
  scope?: Scope;
}) {
  const response = await input.request.post(`/api${input.path}`, {
    headers: { ...headers(input.scope), 'idempotency-key': randomUUID() },
    data: input.value,
  });
  expect(response.status()).toBe(201);
  const value: unknown = await response.json();
  return object(value);
}
async function assign(input: {
  request: APIRequestContext;
  projectId: string;
  membershipId: string;
  companyId: string;
}) {
  const response = await input.request.put(
    `/api/projects/${input.projectId}/responsible`,
    {
      headers: {
        ...headers({ companyId: input.companyId }),
        'idempotency-key': randomUUID(),
      },
      data: { expectedRevision: 0, workspaceMembershipId: input.membershipId },
    },
  );
  expect(response.status()).toBe(200);
}
async function navigate(input: { page: Page; name: string; narrow: boolean }) {
  if (input.narrow)
    await input.page.getByRole('button', { name: 'Open navigation' }).click();
  await input.page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: input.name, exact: true })
    .click();
}
async function frame(input: { page: Page; subject: Locator }) {
  await input.page.evaluate(async () => {
    await document.fonts.ready;
  });
  await input.subject.scrollIntoViewIfNeeded();
  await expect(input.subject).toBeInViewport();
  expect(
    await input.page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

// Real App, API and disposable PostgreSQL; public commands create synthetic
// givens. No route interception, private-module substitution or real assignment.
test('chooses current own open Projects while retaining real Task and Document work in four languages', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'narrow' : 'desktop';
  const companyName = `My Projects acceptance ${suffix}`;
  const clientTitle = `Atelier Știință ${suffix}`;
  const ownTitle = `My preparation ${suffix}`;
  const otherTitle = `Colleague preparation ${suffix}`;
  const unassignedTitle = `Unassigned preparation ${suffix}`;
  const companyId = identifier(
    (
      await post({
        request,
        path: '/companies',
        value: { displayName: companyName },
        scope: { subject: 'workspace-owner' },
      })
    ).id,
  );
  const membershipId = identifier(
    object(await get({ request, path: '/access/current-actor' }))
      .workspaceMembershipId,
  );
  const colleagueId = identifier(
    object(
      await get({
        request,
        path: '/access/current-actor',
        scope: { subject: 'responsible-colleague' },
      }),
    ).workspaceMembershipId,
  );
  for (const [member, routes] of [
    [
      membershipId,
      [
        '/company-context-assignments',
        '/company-director-client-assignments',
        '/company-project-assignments',
        '/company-task-manager-assignments',
        '/company-document-registrar-assignments',
        '/company-document-project-organizer-assignments',
      ],
    ],
    [
      colleagueId,
      [
        '/company-context-assignments',
        '/company-director-client-assignments',
        '/company-project-assignments',
      ],
    ],
  ] satisfies Array<[string, string[]]>) {
    for (const path of routes)
      await post({
        request,
        path,
        value: { workspaceMembershipId: member, companyId },
        scope: { subject: 'workspace-owner' },
      });
  }
  const scope = { companyId };
  const clientId = identifier(
    (
      await post({
        request,
        path: '/clients',
        value: { displayName: clientTitle },
        scope,
      })
    ).id,
  );
  const ownId = identifier(
    (
      await post({
        request,
        path: '/projects',
        value: { title: ownTitle, clientAccountId: clientId },
        scope,
      })
    ).id,
  );
  const otherId = identifier(
    (
      await post({
        request,
        path: '/projects',
        value: { title: otherTitle, clientAccountId: clientId },
        scope,
      })
    ).id,
  );
  await post({
    request,
    path: '/projects',
    value: { title: unassignedTitle, clientAccountId: clientId },
    scope,
  });
  await assign({ request, projectId: ownId, membershipId, companyId });
  await assign({
    request,
    projectId: otherId,
    membershipId: colleagueId,
    companyId,
  });
  const assignedResponsible = object(
    await get({
      request,
      path: `/projects/${ownId}/responsible`,
      scope,
    }),
  );
  const assignedMember = object(assignedResponsible.responsible);
  expect(assignedMember.workspaceMembershipId).toBe(membershipId);
  const responsibleLabel = assignedMember.displayLabel;
  if (
    typeof responsibleLabel !== 'string' ||
    responsibleLabel.trim().length === 0
  )
    throw new Error('Expected a non-empty public responsible-member label.');
  await post({
    request,
    path: '/documents',
    value: {
      clientId,
      title: `Preparation questionnaire ${suffix}`,
      purpose: 'Synthetic preparation evidence.',
      url: 'https://example.test/acceptance-questionnaire',
    },
    scope,
  });
  const outsideDocumentTitle = `Outside questionnaire ${suffix}`;
  const outsideDocumentId = identifier(
    (
      await post({
        request,
        path: '/documents',
        value: {
          clientId,
          title: outsideDocumentTitle,
          purpose: 'Exact navigation to a readable Project outside Mine.',
          url: 'https://example.test/outside-questionnaire',
        },
        scope,
      })
    ).id,
  );
  await post({
    request,
    path: `/documents/${outsideDocumentId}/project-association`,
    value: { projectId: otherId, action: 'link', expectedRevision: 0 },
    scope,
  });
  const outsideTaskTitle = `Outside assigned Task ${suffix}`;
  const outsideTaskId = identifier(
    (
      await post({
        request,
        path: `/projects/${otherId}/tasks`,
        value: {
          title: outsideTaskTitle,
          assigneeMembershipId: membershipId,
          dueDate: null,
          priority: 'normal',
        },
        scope,
      })
    ).id,
  );
  expect(
    await get({ request, path: '/projects?view=mine_open', scope }),
  ).toEqual([expect.objectContaining({ id: ownId })]);
  expect(
    await get({
      request,
      path: '/projects?view=mine_open',
      scope: { companyId, subject: 'responsible-colleague' },
    }),
  ).toEqual([expect.objectContaining({ id: otherId })]);

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
  await navigate({ page, name: 'Projects', narrow });
  const projects = page.locator('.project-workspace');
  const directory = projects.getByRole('list', {
    name: 'Projects',
    exact: true,
  });
  const ownRow = directory.getByRole('button', {
    name: `${ownTitle} Client: ${clientTitle}`,
    exact: true,
  });
  await expect(ownRow).toBeVisible();
  await expect(directory.getByRole('button')).toHaveCount(3);
  const closed = projects.getByRole('checkbox', {
    name: 'Include closed Projects',
  });
  await expect(closed).toHaveCSS('appearance', 'none');
  await closed.focus();
  await page.keyboard.press('Space');
  await expect(closed).toBeChecked();
  const registrationDraft = projects
    .locator('.project-registration')
    .getByRole('textbox', { name: 'Project title' });
  await registrationDraft.fill(`Literal registration {draft} ${suffix}`);
  await frame({ page, subject: closed });
  await page.screenshot({
    path: testInfo.outputPath(`my-projects-all-${suffix}.png`),
  });
  const view = projects.locator('#project-directory-view');
  await expect(view).toHaveAttribute('role', 'combobox');
  const mineRead = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === '/api/projects' &&
      new URL(response.url()).search === '?view=mine_open',
  );
  await view.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  expect((await mineRead).status()).toBe(200);
  await expect(view).toBeFocused();
  await expect(directory.getByRole('button')).toHaveCount(1);
  await expect(ownRow).toBeVisible();
  await expect(registrationDraft).toHaveValue(
    `Literal registration {draft} ${suffix}`,
  );
  await frame({ page, subject: view });
  await page.screenshot({
    path: testInfo.outputPath(`my-projects-mine-${suffix}.png`),
  });
  // These are the real shell callbacks: they open an exact readable target,
  // rather than asking Home/Client to replace the directory's meaning.
  await navigate({ page, name: 'Working Documents', narrow });
  const workingDocuments = page.locator('#documents');
  await workingDocuments
    .getByRole('button', { name: outsideDocumentTitle, exact: true })
    .click();
  await workingDocuments
    .getByRole('article')
    .getByRole('button', { name: 'Open Project', exact: true })
    .click();
  await expect(
    projects.getByRole('article', { name: otherTitle, exact: true }),
  ).toBeVisible();
  await expect(view).toHaveText('My open Projects');
  await expect(directory.getByRole('button')).toHaveCount(1);
  await expect(ownRow).toBeVisible();
  await expect(registrationDraft).toHaveValue(
    `Literal registration {draft} ${suffix}`,
  );
  await frame({ page, subject: view });
  await page.screenshot({
    path: testInfo.outputPath(`my-projects-exact-project-${suffix}.png`),
  });
  const outsideProjectHeading = projects
    .getByRole('article', { name: otherTitle, exact: true })
    .getByRole('heading', { name: otherTitle, exact: true });
  await outsideProjectHeading.evaluate((element) =>
    element.scrollIntoView({ block: 'center' }),
  );
  await frame({ page, subject: outsideProjectHeading });
  await page.screenshot({
    path: testInfo.outputPath(`my-projects-exact-project-detail-${suffix}.png`),
  });
  await navigate({ page, name: 'My Tasks', narrow });
  const exactTaskRead = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === `/api/tasks/${outsideTaskId}`,
  );
  await page
    .locator('#my-tasks')
    .getByRole('button', {
      name: `Open ${outsideTaskTitle} in ${otherTitle} (${clientTitle})`,
      exact: true,
    })
    .click();
  expect((await exactTaskRead).status()).toBe(200);
  await expect(
    projects.getByRole('heading', { name: outsideTaskTitle, exact: true }),
  ).toBeVisible();
  await expect(view).toHaveText('My open Projects');
  await expect(directory.getByRole('button')).toHaveCount(1);
  await expect(ownRow).toBeVisible();
  await expect(registrationDraft).toHaveValue(
    `Literal registration {draft} ${suffix}`,
  );
  await frame({ page, subject: view });
  await page.screenshot({
    path: testInfo.outputPath(`my-projects-exact-task-${suffix}.png`),
  });
  const outsideTaskHeading = projects.getByRole('heading', {
    name: outsideTaskTitle,
    exact: true,
  });
  await outsideTaskHeading.evaluate((element) =>
    element.scrollIntoView({ block: 'center' }),
  );
  await frame({ page, subject: outsideTaskHeading });
  await page.screenshot({
    path: testInfo.outputPath(`my-projects-exact-task-detail-${suffix}.png`),
  });
  await ownRow.click();
  const detail = projects.getByRole('article', { name: ownTitle, exact: true });
  await expect(detail).toBeVisible();
  const tasks = projects.locator(
    '#project-tasks-panel > div:not([hidden]) .project-tasks',
  );
  const taskDraft = tasks
    .locator('form')
    .first()
    .getByRole('textbox', { includeHidden: true })
    .first();
  await expect(taskDraft).toHaveAccessibleName('Task title');
  await expect(taskDraft).toBeVisible();
  await taskDraft.fill(`Keep Task {draft} ${suffix}`);
  await projects
    .getByRole('tab', { name: 'Working Documents', exact: true })
    .click();
  const documents = projects.locator('.project-documents');
  await documents
    .getByRole('button', { name: 'Attach working Document', exact: true })
    .click();
  const documentSearch = documents
    .locator('.project-document-selector')
    .getByRole('searchbox');
  await documentSearch.fill(`Keep Document {filter} ${suffix}`);
  await expect(
    projects
      .getByRole('region', { name: 'Responsible member', exact: true })
      .getByText(responsibleLabel, { exact: true })
      .first(),
  ).toBeVisible();
  await frame({ page, subject: documentSearch });
  await page.screenshot({
    path: testInfo.outputPath(`my-projects-document-draft-${suffix}.png`),
  });
  await selectOption(view, 'all');
  await expect(closed).toBeChecked();
  await expect(directory.getByRole('button')).toHaveCount(3);
  await selectOption(view, 'mine_open');
  await expect(directory.getByRole('button')).toHaveCount(1);
  await expect(taskDraft).toHaveValue(`Keep Task {draft} ${suffix}`);
  await expect(documentSearch).toHaveValue(`Keep Document {filter} ${suffix}`);
  const observed: string[] = [];
  page.on('request', (sent) => {
    if (new URL(sent.url()).pathname.startsWith('/api/'))
      observed.push(sent.method() + ' ' + new URL(sent.url()).pathname);
  });
  const before = observed.length;
  for (const [locale, caption] of [
    ['ro', 'Proiectele mele deschise'],
    ['ru', 'Мои открытые Проекты'],
    ['fr', 'Mes Projets ouverts'],
    ['en', 'My open Projects'],
  ] as const) {
    await selectOption(page.locator('#interface-locale'), locale);
    await expect(view).toHaveText(caption);
    await expect(taskDraft).toHaveValue(`Keep Task {draft} ${suffix}`);
    await expect(documentSearch).toHaveValue(
      `Keep Document {filter} ${suffix}`,
    );
    await expect(
      projects.locator('.project-registration input').first(),
    ).toHaveValue(`Literal registration {draft} ${suffix}`);
    expect(observed).toHaveLength(before);
    await frame({ page, subject: view });
    await page.screenshot({
      path: testInfo.outputPath(`my-projects-${locale}-${suffix}.png`),
    });
  }
  const responsible = projects.getByRole('region', {
    name: 'Responsible member',
    exact: true,
  });
  await responsible
    .getByRole('button', { name: 'Change', exact: true })
    .click();
  const changed = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' &&
      new URL(response.url()).pathname === `/api/projects/${ownId}/responsible`,
  );
  await responsible
    .getByRole('button', { name: 'Clear responsible member', exact: true })
    .click();
  expect((await changed).status()).toBe(200);
  await expect(
    projects.getByText('No open Projects currently list you as responsible.', {
      exact: true,
    }),
  ).toBeVisible();
  await expect(detail).toBeVisible();
  await expect(taskDraft).toHaveValue(`Keep Task {draft} ${suffix}`);
  await expect(documentSearch).toHaveValue(`Keep Document {filter} ${suffix}`);
  expect(
    await get({ request, path: '/projects?view=mine_open', scope }),
  ).toEqual([]);
  await frame({ page, subject: view });
  await page.screenshot({
    path: testInfo.outputPath(`my-projects-empty-${suffix}.png`),
  });
});
