import { enterClassicCompatibility } from './classic-compatibility';
import {
  expect,
  test,
  type Locator,
  type Page,
  type Request,
  type Response,
  type TestInfo,
} from '@playwright/test';

test('operates the delivered Client, Project, Task and working Document journey through PostgreSQL', async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  const narrow = testInfo.project.name.endsWith('narrow');
  const suffix = narrow ? 'Narrow' : 'Desktop';
  const clientName = `Acceptance Client ${suffix}`;
  const projectTitle = `Acceptance preparation Project ${suffix}`;
  const taskTitle = `Prepare the acceptance questionnaire ${suffix}`;
  const documentTitle = `Acceptance working questionnaire ${suffix}`;
  const documentPurpose = `Prepare the ${suffix} Client acceptance interview`;
  const documentUrl = `https://example.test/acceptance-questionnaire-${suffix.toLowerCase()}`;
  const preservedDraft = `Draft preserved across ${suffix} frame rollback`;
  const documentOpenDraft = `Draft preserved across the ${suffix} Document open`;

  // The administrator revokes and re-grants Company Project Access through the
  // existing Company assignment administration; the fresh grant captures v2.
  await regrantProjectAccess(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page).toHaveURL(/\/$/u);
  await expect(
    page.getByRole('heading', { name: 'Hello, Ada Ionescu.' }),
  ).toBeVisible();
  const company = page.getByLabel('Active Company', { exact: true });
  const navigation = page.getByRole('navigation', {
    name: 'Primary navigation',
  });
  const clients = page.locator('.client-workspace');
  const projects = page.locator('.project-workspace');
  const tasks = page.locator('.project-tasks');
  const myTasks = page.locator('.my-tasks');
  const workingDocuments = page.locator('.working-documents');
  const projectDocuments = page.locator('.project-documents');
  const activity = page.locator('.activity-log');

  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await company.selectOption({ label: 'PRISMA-PRIM' });
  await expect(company).toBeEnabled();
  await expect(company.locator('option:checked')).toHaveText('PRISMA-PRIM');
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();

  await navigate(page, navigation, 'Clients', narrow);
  await expect(
    clients.getByRole('heading', { name: clientName, exact: true }),
  ).toHaveCount(0);
  await clients
    .getByRole('button', { name: 'New Client', exact: true })
    .click();
  await clients.getByLabel('Client display name').fill(clientName);
  const clientResponse = page.waitForResponse(
    mutationResponse('POST', '/api/clients'),
  );
  await clients
    .getByRole('button', { name: 'Create Client', exact: true })
    .click();
  const clientId = await responseId(clientResponse);
  await expect(
    clients.getByRole('heading', { name: clientName, exact: true }),
  ).toBeVisible();
  await clients.getByRole('button', { name: 'Close registration' }).click();

  await page.reload();
  const clientRow = clients.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: clientName, exact: true }),
  });
  await clientRow.getByRole('button', { name: 'Open dossier' }).click();
  const clientDossier = page.locator('.client-dossier-detail');
  await expect(
    clientDossier.getByRole('heading', { name: clientName, exact: true }),
  ).toBeVisible();
  await expect(clientDossier.getByText('PRISMA-PRIM')).toBeVisible();
  await clientDossier
    .getByRole('button', { name: 'Open Client Projects' })
    .click();

  await expect(
    projects.getByRole('heading', { name: projectTitle, exact: true }),
  ).toHaveCount(0);
  await projects.getByLabel('Project title').fill(projectTitle);
  await projects.getByLabel('Client', { exact: true }).selectOption({
    label: clientName,
  });
  const projectResponse = page.waitForResponse(
    mutationResponse('POST', '/api/projects'),
  );
  await projects.getByRole('button', { name: 'Create Project' }).click();
  const projectId = await responseId(projectResponse);
  await expect(
    projects.getByRole('heading', { name: projectTitle, exact: true }),
  ).toBeVisible();
  await expect(
    projects
      .getByRole('article', { name: projectTitle })
      .getByText(
        'Preparation only. This record does not authorize work to start.',
      ),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await tasks.getByLabel('Task title').fill(taskTitle);
  const priority = tasks.locator('form').getByLabel('Priority');
  await priority.selectOption({ label: 'Critical' });
  const taskResponse = page.waitForResponse(
    mutationResponse('POST', `/api/projects/${projectId}/tasks`),
  );
  await tasks.getByRole('button', { name: 'Create Task' }).click();
  const taskId = await responseId(taskResponse);
  await expect(
    tasks.getByRole('heading', { name: taskTitle, exact: true }),
  ).toBeVisible();
  await expect(
    tasks.locator('dd').getByText('Critical', { exact: true }),
  ).toBeVisible();
  const responsibleMember = tasks
    .locator('form')
    .getByLabel('Responsible member');
  await responsibleMember.selectOption({ index: 1 });
  await expect(responsibleMember.locator('option:checked')).toContainText(
    'Ada Ionescu',
  );
  await tasks.getByLabel('Due date').fill('2026-10-15');
  await priority.selectOption({ label: 'Important' });
  await tasks.getByRole('button', { name: 'Save Task', exact: true }).click();
  await expect(
    tasks.locator('dd').getByText('Ada Ionescu', { exact: true }),
  ).toBeVisible();
  await expect(
    tasks.locator('dd').getByText('Important', { exact: true }),
  ).toBeVisible();
  await expect(
    tasks
      .getByRole('region', { name: 'Task history' })
      .getByText('Critical → Important'),
  ).toBeVisible();
  // Leave the Task, so only My Tasks' Open selects it again.
  await tasks.getByRole('button', { name: 'New Task', exact: true }).click();
  await expect(
    tasks.getByRole('heading', { name: taskTitle, exact: true }),
  ).toHaveCount(0);

  await navigate(page, navigation, 'My Tasks', narrow);
  expect(await refreshMyTasks(page, myTasks)).toContain(taskId);
  const assignedTask = myTasks.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: taskTitle, exact: true }),
  });
  await expect(assignedTask.getByRole('definition')).toHaveText([
    projectTitle,
    clientName,
    '2026-10-15',
    'Important',
  ]);
  await capture(
    page,
    testInfo,
    `operational-foundation-${narrow ? 'narrow' : 'desktop'}-my-tasks.png`,
  );
  const exactRead = (pathname: string) =>
    page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        new URL(response.url()).pathname === pathname,
    );
  const projectRead = exactRead(`/api/projects/${projectId}`);
  const taskRead = exactRead(`/api/tasks/${taskId}`);
  await assignedTask
    .getByRole('button', {
      name: `Open ${taskTitle} in ${projectTitle} (${clientName})`,
      exact: true,
    })
    .click();
  expect((await projectRead).ok()).toBe(true);
  expect((await taskRead).ok()).toBe(true);
  await expect(projects).toBeFocused();
  await expect(page).toHaveURL(/#projects$/u);
  await expect(
    projects.getByRole('heading', { name: projectTitle, exact: true }),
  ).toBeVisible();
  await expect(
    tasks.getByRole('heading', { name: taskTitle, exact: true }),
  ).toBeVisible();
  await expect(
    tasks.locator('dd').getByText('2026-10-15', { exact: true }),
  ).toBeVisible();
  await expect(
    tasks.locator('dd').getByText('Important', { exact: true }),
  ).toBeVisible();
  await capture(
    page,
    testInfo,
    `operational-foundation-${narrow ? 'narrow' : 'desktop'}-my-task-open.png`,
  );

  await tasks.getByLabel('Task title').fill(preservedDraft);
  const completionPath = new RegExp(
    `/api/tasks/${escapeRegExp(taskId)}/complete$`,
    'u',
  );
  const completionKeys: string[] = [];
  const captureCompletionKey = (request: Request) => {
    if (
      request.method() === 'POST' &&
      completionPath.test(new URL(request.url()).pathname)
    ) {
      const key = request.headers()['idempotency-key'];
      if (key) completionKeys.push(key);
    }
  };
  page.on('request', captureCompletionKey);
  await page.route(completionPath, (route) => route.abort('connectionfailed'));
  await tasks.getByRole('button', { name: 'Mark done' }).click();
  await expect(
    tasks.getByRole('button', { name: 'Retry pending Task change' }),
  ).toBeVisible();
  await page.unroute(completionPath);

  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await enterClassicCompatibility(page);
  await expect(page).toHaveURL(/\?frame=classic#projects$/u);
  await expect(company.locator('option:checked')).toHaveText('PRISMA-PRIM');
  await expect(tasks.getByLabel('Task title')).toHaveValue(preservedDraft);
  await expect(
    tasks.getByRole('button', { name: 'Retry pending Task change' }),
  ).toBeVisible();
  await expect(
    projects.getByRole('heading', { name: projectTitle, exact: true }),
  ).toBeVisible();
  await expect(
    projects
      .getByRole('region', { name: 'Responsible member' })
      .getByText('No responsible member', { exact: true }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await capture(
    page,
    testInfo,
    `operational-foundation-${narrow ? 'narrow' : 'desktop'}-classic.png`,
  );
  await page.getByRole('button', { name: 'Try Prisme' }).click();
  await expect(page).toHaveURL(/\/#projects$/u);
  await expect(tasks.getByLabel('Task title')).toHaveValue(preservedDraft);
  await expect(
    tasks.getByRole('button', { name: 'Retry pending Task change' }),
  ).toBeVisible();
  await tasks
    .getByRole('button', { name: 'Retry pending Task change' })
    .click();
  await expect(
    tasks.getByText('Completion declared by Ada Ionescu', { exact: false }),
  ).toBeVisible();
  // The completed Task keeps its priority visible without a priority control.
  await expect(
    tasks.locator('dd').getByText('Important', { exact: true }),
  ).toBeVisible();
  await expect(priority).toHaveCount(0);
  page.off('request', captureCompletionKey);
  expect(completionKeys).toHaveLength(2);
  expect(completionKeys[1]).toBe(completionKeys[0]);

  await navigate(page, navigation, 'My Tasks', narrow);
  expect(await refreshMyTasks(page, myTasks)).not.toContain(taskId);
  await expect(
    myTasks.getByRole('heading', { name: taskTitle, exact: true }),
  ).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  await navigate(page, navigation, 'Working Documents', narrow);
  await workingDocuments.getByLabel('Client', { exact: true }).selectOption({
    label: clientName,
  });
  await workingDocuments
    .getByLabel('Title', { exact: true })
    .fill(documentTitle);
  await workingDocuments
    .getByLabel('Purpose', { exact: true })
    .fill(documentPurpose);
  await workingDocuments.getByLabel('External HTTPS link').fill(documentUrl);
  const documentResponse = page.waitForResponse(
    mutationResponse('POST', '/api/documents'),
  );
  await workingDocuments
    .getByRole('button', { name: 'Register working reference' })
    .click();
  const documentId = await responseId(documentResponse);
  await expect(
    workingDocuments.getByRole('heading', {
      name: documentTitle,
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await workingDocuments.getByRole('button', { name: documentTitle }).click();
  await expect(
    workingDocuments.getByText('Draft questionnaire · Company-confidential'),
  ).toBeVisible();
  await expect(
    workingDocuments.getByRole('link', { name: 'Open external reference' }),
  ).toHaveAttribute('href', documentUrl);
  await expectNoHorizontalOverflow(page);

  await navigate(page, navigation, 'Projects', narrow);
  await projects.getByRole('searchbox', { name: 'Find Projects' }).fill('');
  await projects
    .getByRole('list', { name: 'Projects' })
    .getByRole('button', {
      name: `${projectTitle} Client: ${clientName}`,
    })
    .click();
  await projects
    .getByRole('tab', { name: 'Working Documents', exact: true })
    .click();
  await projectDocuments
    .getByRole('button', { name: 'Attach working Document' })
    .click();
  const associationResponse = page.waitForResponse(
    mutationResponse(
      'POST',
      `/api/documents/${documentId}/project-association`,
    ),
  );
  await projectDocuments
    .getByRole('button', { name: `Attach ${documentTitle}` })
    .click();
  await expect((await associationResponse).ok()).toBe(true);
  await expect(
    projectDocuments.getByRole('heading', {
      name: documentTitle,
      exact: true,
    }),
  ).toBeVisible();

  await page.reload();
  const projectRow = projects.getByRole('button', {
    name: `${projectTitle} Client: ${clientName}`,
  });
  await projectRow.click();
  const responsible = projects.getByRole('region', {
    name: 'Responsible member',
  });
  const projectResponsible = responsible.locator('dd');
  await expect(projectResponsible).toHaveText('No responsible member');
  await nameResponsible(page, responsible, projectId, 'Ion Popa');
  await expect(projectResponsible).toHaveText(/^Ion Popa · /u);
  await page.reload();
  await projectRow.click();
  await expect(projectResponsible).toHaveText(/^Ion Popa · /u);
  await expect(
    responsible.getByText(/^Last changed by Ada Ionescu on /u),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await nameResponsible(page, responsible, projectId, 'Ada Ionescu');
  await expect(projectResponsible).toHaveText(/^Ada Ionescu · /u);
  await responsible
    .getByRole('button', { name: 'Change', exact: true })
    .click();
  const cleared = page.waitForResponse(
    mutationResponse('PUT', `/api/projects/${projectId}/responsible`),
  );
  await responsible
    .getByRole('button', { name: 'Clear responsible member' })
    .click();
  expect((await cleared).ok()).toBe(true);
  await expect(projectResponsible).toHaveText('No responsible member');
  await projects.getByRole('tab', { name: 'Tasks', exact: true }).click();
  await tasks.getByRole('button', { name: taskTitle, exact: true }).click();
  await expect(
    tasks.getByRole('button', { name: 'Reopen Task' }),
  ).toBeVisible();
  await expect(
    tasks.locator('dd').getByText('Ada Ionescu', { exact: true }),
  ).toBeVisible();
  await expect(
    tasks.getByText('Completion declared by Ada Ionescu', { exact: false }),
  ).toBeVisible();
  await projects
    .getByRole('tab', { name: 'Working Documents', exact: true })
    .click();
  await expect(
    projectDocuments.getByRole('heading', {
      name: documentTitle,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    projectDocuments.getByRole('link', { name: 'Open external reference' }),
  ).toHaveAttribute('href', documentUrl);
  await capture(
    page,
    testInfo,
    `operational-foundation-${narrow ? 'narrow' : 'desktop'}-prisme.png`,
  );

  // Opening the linked Document keeps the Project's Task draft and records nothing.
  await projects.getByRole('tab', { name: 'Tasks', exact: true }).click();
  await tasks.getByRole('button', { name: 'New Task', exact: true }).click();
  await tasks.getByLabel('Task title').fill(documentOpenDraft);
  await projects
    .getByRole('tab', { name: 'Working Documents', exact: true })
    .click();
  await projectDocuments
    .getByRole('listitem')
    .filter({
      has: page.getByRole('heading', { name: documentTitle, exact: true }),
    })
    .getByRole('button', { name: 'Open Document', exact: true })
    .click();
  await expect(page.locator('#documents')).toBeFocused();
  const openedDocument = workingDocuments.getByRole('article');
  await expect(
    openedDocument.getByRole('heading', { name: documentTitle, exact: true }),
  ).toBeVisible();
  await expect(
    openedDocument.getByText(documentPurpose, { exact: true }),
  ).toBeVisible();
  await expect(
    openedDocument.getByText('Registration time', { exact: true }),
  ).toBeVisible();
  expect(page.url()).not.toContain(documentId);
  await capture(
    page,
    testInfo,
    `operational-foundation-${narrow ? 'narrow' : 'desktop'}-document-open.png`,
  );
  // The opened detail replaces the references; return to them so the journey
  // below opens the same Document from its row.
  await openedDocument
    .getByRole('button', { name: 'Back to references', exact: true })
    .click();
  await navigate(page, navigation, 'Projects', narrow);
  await projects.getByRole('tab', { name: 'Tasks', exact: true }).click();
  await expect(tasks.getByLabel('Task title')).toHaveValue(documentOpenDraft);

  // Opening the linked Project from its Document keeps another Project's
  // Task draft and records nothing.
  const otherProjectTitle = `Acceptance other preparation Project ${suffix}`;
  const otherProjectDraft = `Draft kept while opening the linked Project ${suffix}`;
  const visibleTasks = tasks.filter({ visible: true });
  await projects.getByLabel('Project title').fill(otherProjectTitle);
  await projects.getByLabel('Client', { exact: true }).selectOption({
    label: clientName,
  });
  const otherProjectResponse = page.waitForResponse(
    mutationResponse('POST', '/api/projects'),
  );
  await projects.getByRole('button', { name: 'Create Project' }).click();
  expect(await responseId(otherProjectResponse)).not.toBe(projectId);
  await expect(
    projects.getByRole('heading', { name: otherProjectTitle, exact: true }),
  ).toBeVisible();
  await visibleTasks.getByLabel('Task title').fill(otherProjectDraft);

  await navigate(page, navigation, 'Working Documents', narrow);
  await workingDocuments.getByRole('button', { name: documentTitle }).click();
  const documentDetail = workingDocuments.getByRole('article');
  await expect(
    documentDetail
      .locator('dl')
      .filter({ hasText: /^Project/u })
      .getByRole('definition'),
  ).toHaveText(projectTitle);
  const openLinkedProject = documentDetail.getByRole('button', {
    name: 'Open Project',
    exact: true,
  });
  await openLinkedProject.focus();
  await page.keyboard.press('Enter');
  await expect(projects).toBeFocused();
  await expect(page).toHaveURL(/\/#projects$/u);
  expect(page.url()).not.toContain(projectId);
  await expect(
    projects.getByRole('heading', { name: projectTitle, exact: true }),
  ).toBeVisible();
  await expect(
    projects.getByRole('tab', { name: 'Tasks', exact: true }),
  ).toHaveAttribute('aria-selected', 'true');
  await capture(
    page,
    testInfo,
    `operational-foundation-${narrow ? 'narrow' : 'desktop'}-document-project.png`,
  );
  await projects
    .getByRole('list', { name: 'Projects' })
    .getByRole('button', {
      name: `${otherProjectTitle} Client: ${clientName}`,
    })
    .click();
  await expect(
    projects.getByRole('heading', { name: otherProjectTitle, exact: true }),
  ).toBeVisible();
  await expect(visibleTasks.getByLabel('Task title')).toHaveValue(
    otherProjectDraft,
  );

  await page.goto('/#activity');
  await expect(activity).toBeVisible();
  const finalActivityResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/activity-log' &&
      response.request().method() === 'GET',
  );
  await page.reload();
  const activityResponse = await finalActivityResponse;
  const activityBody: unknown = await activityResponse.json();
  const ids = { clientId, projectId, taskId, documentId };
  const serverActions = readJourneyActions(activityBody, ids);
  expect(serverActions.slice(0, 9)).toEqual(requiredActions.slice(0, 9));
  expect(serverActions.slice(9).sort()).toEqual(
    requiredActions.slice(9).sort(),
  );
  expect(
    responsibleChanges(activityBody, ids.projectId).map((change) => [
      change.before?.displayLabel.split(' · ')[0] ?? null,
      change.after?.displayLabel.split(' · ')[0] ?? null,
    ]),
  ).toEqual([
    ['Ada Ionescu', null],
    ['Ion Popa', 'Ada Ionescu'],
    [null, 'Ion Popa'],
  ]);
  expectNoOtherCompanyActivity(
    activityBody,
    requiredEnvironment('ACCEPTANCE_OTHER_COMPANY_ID'),
    requiredEnvironment('ACCEPTANCE_OTHER_PROJECT_ID'),
  );

  const expectedVisibleActions = activityRecords(activityBody)
    .filter(isRequiredActivity)
    .map((event) => `${event.actorDisplayName} ${actionLabels[event.action]}`);
  await expect
    .poll(async () =>
      activityDescriptions(await activity.locator('strong').allTextContents()),
    )
    .toEqual(expectedVisibleActions);
  const activityText = await activity.textContent();
  expect(activityText).toContain(projectTitle);
  expect(activityText).toContain(taskTitle);
  expect(activityText).toContain(documentTitle);
  expect(activityText).not.toMatch(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/iu,
  );
  await expectNoHorizontalOverflow(page);
});

type RequiredAction =
  | 'project.responsible.changed'
  | 'document.project.linked'
  | 'document.registered'
  | 'task.completed'
  | 'task.updated'
  | 'task.created'
  | 'project.created'
  | 'client_company_relationship.established'
  | 'client.created';

type JourneyIds = {
  clientId: string;
  projectId: string;
  taskId: string;
  documentId: string;
};

type ActivityRecord = {
  action: string;
  actorDisplayName: string;
  target: Record<string, unknown>;
};

const requiredActions: RequiredAction[] = [
  'project.responsible.changed',
  'project.responsible.changed',
  'project.responsible.changed',
  'document.project.linked',
  'document.registered',
  'task.completed',
  'task.updated',
  'task.created',
  'project.created',
  'client_company_relationship.established',
  'client.created',
];
const requiredActionSet: ReadonlySet<string> = new Set(requiredActions);
const companyScopedActions: ReadonlySet<string> = new Set([
  'project.responsible.changed',
  'document.project.linked',
  'document.project.unlinked',
  'document.registered',
  'document.corrected',
  'task.completed',
  'task.updated',
  'task.created',
  'task.reopened',
  'project.created',
  'client_company_relationship.established',
  'client.corrected',
]);
const actionLabels: Record<RequiredAction, string> = {
  'project.responsible.changed': 'changed the responsible member of a Project',
  'document.project.linked': 'attached a working Document to a Project',
  'document.registered': 'registered a working Document reference',
  'task.completed': 'declared a Task done',
  'task.updated': 'updated a Task',
  'task.created': 'created a Task',
  'project.created': 'created a preparatory Project',
  'client_company_relationship.established': 'linked a Client to a Company',
  'client.created': 'created a Client',
};

const apiAdministratorHeaders = {
  'x-test-external-provider': 'local-demo',
  'x-test-external-subject': 'workspace-owner',
  'x-test-display-name': 'Workspace Owner',
  'x-test-email': 'owner@example.test',
};

async function regrantProjectAccess(page: Page): Promise<void> {
  const membershipId = requiredEnvironment('ACCEPTANCE_PRIMARY_MEMBERSHIP_ID');
  const companyId = requiredEnvironment('ACCEPTANCE_PRIMARY_COMPANY_ID');
  const revoked = await page.request.delete(
    `http://127.0.0.1:4174/api/company-project-assignments/${membershipId}/${companyId}`,
    {
      headers: {
        ...apiAdministratorHeaders,
        'idempotency-key': `acceptance-revoke-project-${crypto.randomUUID()}`,
      },
    },
  );
  expect(revoked.status()).toBe(200);
  const granted = await page.request.post(
    'http://127.0.0.1:4174/api/company-project-assignments',
    {
      headers: {
        ...apiAdministratorHeaders,
        'content-type': 'application/json',
        'idempotency-key': `acceptance-grant-project-${crypto.randomUUID()}`,
      },
      data: { workspaceMembershipId: membershipId, companyId },
    },
  );
  expect(granted.status()).toBe(201);
  expect(await granted.json()).toMatchObject({
    bundle: 'Company Project Access',
    permissionSetVersion: 'v2',
    active: true,
  });
}

// Names an eligible member from the explicitly opened selector.
async function nameResponsible(
  page: Page,
  responsible: Locator,
  projectId: string,
  name: string,
): Promise<void> {
  await responsible
    .getByRole('button', { name: 'Change', exact: true })
    .click();
  const chooser = responsible.getByLabel('Choose the responsible member');
  const value = await chooser
    .locator('option', { hasText: name })
    .getAttribute('value');
  if (!value) throw new Error(`${name} is not an eligible responsible member.`);
  await chooser.selectOption(value);
  const saved = page.waitForResponse(
    mutationResponse('PUT', `/api/projects/${projectId}/responsible`),
  );
  await responsible.getByRole('button', { name: 'Save', exact: true }).click();
  expect((await saved).ok()).toBe(true);
}

type RecordedResponsible = { displayLabel: string } | null;

// Newest first, the before and after members of this Project's changes.
function responsibleChanges(
  value: unknown,
  projectId: string,
): Array<{ before: RecordedResponsible; after: RecordedResponsible }> {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('events' in value) ||
    !Array.isArray(value.events)
  )
    throw new Error('Expected an Activity Log response.');
  const events: unknown[] = value.events;
  return events.flatMap((event) => {
    if (
      typeof event !== 'object' ||
      event === null ||
      !('action' in event) ||
      event.action !== 'project.responsible.changed' ||
      !('target' in event) ||
      typeof event.target !== 'object' ||
      event.target === null ||
      !('projectId' in event.target) ||
      event.target.projectId !== projectId
    )
      return [];
    if (
      !('metadata' in event) ||
      typeof event.metadata !== 'object' ||
      event.metadata === null ||
      !('before' in event.metadata) ||
      !('after' in event.metadata)
    )
      throw new Error('Expected a responsible-member change.');
    return [
      {
        before: recordedResponsible(event.metadata.before),
        after: recordedResponsible(event.metadata.after),
      },
    ];
  });
}

function recordedResponsible(value: unknown): RecordedResponsible {
  if (value === null) return null;
  if (
    typeof value !== 'object' ||
    !('displayLabel' in value) ||
    typeof value.displayLabel !== 'string' ||
    JSON.stringify(value).includes('@')
  )
    throw new Error('Expected a responsible member without directory data.');
  return { displayLabel: value.displayLabel };
}

function mutationResponse(method: string, pathname: string) {
  return (response: Response) =>
    response.request().method() === method &&
    new URL(response.url()).pathname === pathname;
}

async function responseId(responsePromise: Promise<Response>): Promise<string> {
  const response = await responsePromise;
  expect(response.ok()).toBe(true);
  const value: unknown = await response.json();
  if (
    typeof value !== 'object' ||
    value === null ||
    !('id' in value) ||
    typeof value.id !== 'string'
  )
    throw new Error('Expected a mutation receipt with an id.');
  return value.id;
}

function activityRecords(value: unknown): ActivityRecord[] {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('events' in value) ||
    !Array.isArray(value.events)
  )
    throw new Error('Expected an Activity Log response.');
  return value.events.map((event: unknown) => {
    if (
      typeof event !== 'object' ||
      event === null ||
      !('action' in event) ||
      typeof event.action !== 'string' ||
      !('target' in event) ||
      typeof event.target !== 'object' ||
      event.target === null ||
      Array.isArray(event.target)
    )
      throw new Error('Expected a complete Activity Log event.');
    if (
      !('actor' in event) ||
      typeof event.actor !== 'object' ||
      event.actor === null ||
      !('displayName' in event.actor) ||
      typeof event.actor.displayName !== 'string'
    )
      throw new Error('Expected an attributable Activity Log event.');
    return {
      action: event.action,
      actorDisplayName: event.actor.displayName,
      target: event.target,
    };
  });
}

function readJourneyActions(value: unknown, ids: JourneyIds): RequiredAction[] {
  return activityRecords(value)
    .filter((event) => belongsToJourney(event, ids))
    .map((event) => {
      if (!isRequiredAction(event.action))
        throw new Error(`Unexpected journey action: ${event.action}`);
      return event.action;
    });
}

function belongsToJourney(event: ActivityRecord, ids: JourneyIds): boolean {
  if (!isRequiredAction(event.action)) return false;
  switch (event.action) {
    case 'client.created':
    case 'client_company_relationship.established':
      return event.target.clientAccountId === ids.clientId;
    case 'project.created':
    case 'project.responsible.changed':
      return event.target.projectId === ids.projectId;
    case 'task.created':
    case 'task.updated':
    case 'task.completed':
      return event.target.taskId === ids.taskId;
    case 'document.registered':
      return event.target.documentId === ids.documentId;
    case 'document.project.linked':
      return (
        event.target.documentId === ids.documentId &&
        event.target.projectId === ids.projectId
      );
  }
}

function expectNoOtherCompanyActivity(
  value: unknown,
  otherCompanyId: string,
  otherProjectId: string,
): void {
  for (const event of activityRecords(value)) {
    if (
      companyScopedActions.has(event.action) &&
      event.target.companyId === otherCompanyId
    )
      throw new Error(`Other-Company activity was exposed: ${event.action}`);
    if (event.target.projectId === otherProjectId)
      throw new Error('The other Company Project was exposed.');
  }
}

function activityDescriptions(descriptions: string[]): string[] {
  return descriptions.filter((description) =>
    Object.values(actionLabels).some((label) => description.endsWith(label)),
  );
}

function isRequiredAction(value: string): value is RequiredAction {
  return requiredActionSet.has(value);
}

function isRequiredActivity(
  event: ActivityRecord,
): event is ActivityRecord & { action: RequiredAction } {
  return isRequiredAction(event.action);
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} was not supplied by global setup.`);
  return value;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

async function navigate(
  page: Page,
  navigation: ReturnType<Page['getByRole']>,
  label: string,
  narrow: boolean,
): Promise<void> {
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await navigation.getByRole('link', { name: label, exact: true }).click();
}

// My Tasks re-reads only on an explicit Refresh; returns the raw server reply.
async function refreshMyTasks(
  page: Page,
  myTasks: ReturnType<Page['locator']>,
): Promise<string> {
  const read = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/assigned-tasks' &&
      response.request().method() === 'GET',
  );
  await myTasks.getByRole('button', { name: 'Refresh My Tasks' }).click();
  const response = await read;
  expect(response.ok()).toBe(true);
  await expect(myTasks.getByRole('status')).toHaveCount(0);
  return response.text();
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(
    dimensions.documentWidth,
    JSON.stringify(dimensions),
  ).toBeLessThanOrEqual(dimensions.viewportWidth);
}

async function capture(
  page: Page,
  testInfo: TestInfo,
  filename: string,
): Promise<void> {
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath(filename),
    fullPage: true,
  });
}
