import { expect, test } from '@playwright/test';
import { actorContextFixture } from './actor-context.fixture';

test('creates and opens a Project, then switches local panels without reloading them', async ({
  page,
}, testInfo) => {
  const company = { id: 'company-prisme-projects', displayName: 'PRISMA-PRIM' };
  const client = {
    id: 'client-prisme-projects',
    displayName: 'Exemplu Certification Services',
    relatedToActiveCompany: true,
  };
  const existingProject = {
    id: 'project-existing',
    companyId: company.id,
    clientAccountId: client.id,
    clientDisplayName: client.displayName,
    title: 'Existing ISO preparation',
    status: 'preparatory',
    createdAt: '2026-09-19T08:00:00.000Z',
  };
  const createdProject = {
    ...existingProject,
    id: 'project-created',
    title: 'ISO 9001 certification preparation',
  };
  const projects = [existingProject];
  const reads = { tasks: 0, documents: 0 };

  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const companyContext = request.headers()['x-company-context-id'];
    if (path === '/api/access/current-actor')
      return route.fulfill({
        json: {
          ...actorContextFixture,
          workspacePermissions: ['client.manage'],
          ...(companyContext
            ? {
                activeCompany: {
                  ...company,
                  projectPermissions: ['project.read', 'project.create'],
                  taskPermissions: ['task.read', 'task.manage'],
                  taskPermissionAssignmentId: 'task-manager-grant',
                  taskPermissionSetVersion: 'v1',
                  documentPermissions: [
                    'document.read',
                    'document.project.manage',
                  ],
                },
              }
            : {}),
        },
      });
    if (path === '/api/companies') return route.fulfill({ json: [company] });
    if (path === '/api/clients') return route.fulfill({ json: [client] });
    if (path === '/api/activity-log')
      return route.fulfill({ json: { events: [] } });
    if (path === '/api/projects' && request.method() === 'POST') {
      expect(request.postDataJSON()).toEqual({
        title: createdProject.title,
        clientAccountId: client.id,
      });
      expect(request.headers()['idempotency-key']).toBeTruthy();
      projects.push(createdProject);
      return route.fulfill({ status: 201, json: createdProject });
    }
    if (path === '/api/projects') return route.fulfill({ json: projects });
    if (path === `/api/projects/${existingProject.id}`)
      return route.fulfill({ json: existingProject });
    if (path === `/api/projects/${createdProject.id}`)
      return route.fulfill({ json: createdProject });
    if (path === `/api/projects/${createdProject.id}/tasks`) {
      reads.tasks += 1;
      return route.fulfill({ json: { mutable: true, tasks: [] } });
    }
    if (path === `/api/projects/${createdProject.id}/eligible-task-assignees`)
      return route.fulfill({ json: { members: [] } });
    if (path === `/api/projects/${createdProject.id}/documents`) {
      reads.documents += 1;
      return route.fulfill({ json: { mutable: true, documents: [] } });
    }
    if (path === '/api/documents') return route.fulfill({ json: [] });
    return route.fulfill({ status: 404 });
  });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?frame=prisme#projects');
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByLabel('Active Company', { exact: true })
    .selectOption(company.id);
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Close navigation' }).click();
  await page.goto('/?frame=prisme#projects');

  await expect(page.getByLabel('Project title')).toBeVisible();
  await page.getByLabel('Project title').fill(createdProject.title);
  await page.getByLabel('Client', { exact: true }).selectOption(client.id);
  await page.screenshot({
    path: testInfo.outputPath('prisme-projects-create.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Create Project', exact: true })
    .click();

  const projectHeading = page.getByRole('heading', {
    name: createdProject.title,
    exact: true,
  });
  await expect(projectHeading).toBeVisible();
  await expect(page.getByText(`Client: ${client.displayName}`)).toBeVisible();
  await expect(
    page.getByText(
      'Preparation only. This record does not authorize work to start.',
    ),
  ).toBeVisible();

  const tasksTab = page.getByRole('tab', { name: 'Tasks', exact: true });
  const documentsTab = page.getByRole('tab', {
    name: 'Working Documents',
    exact: true,
  });
  const tasksPanel = page.getByRole('tabpanel', { name: 'Tasks' });
  const documentsPanel = page.getByRole('tabpanel', {
    name: 'Working Documents',
  });
  await expect(tasksTab).toHaveAttribute('aria-selected', 'true');
  await expect(tasksPanel).toBeVisible();
  await expect(documentsPanel).toBeHidden();

  await tasksTab.focus();
  await tasksTab.press('End');
  await expect(documentsTab).toBeFocused();
  await expect(documentsPanel).toBeVisible();
  await documentsTab.press('Home');
  await expect(tasksTab).toBeFocused();
  await expect(tasksPanel).toBeVisible();
  await tasksTab.press('ArrowRight');
  await expect(documentsTab).toBeFocused();
  await documentsTab.press('ArrowLeft');
  await expect(tasksTab).toBeFocused();
  await expect(tasksPanel).toBeVisible();

  await expect(
    tasksPanel.getByText('No manual Tasks for this Project yet.'),
  ).toBeVisible();
  const taskDraft = 'Prepare the certification interview';
  await tasksPanel.getByLabel('Task title').fill(taskDraft);
  const readsAfterOpen = { ...reads };

  await documentsTab.click();
  await expect(documentsTab).toBeFocused();
  await expect(documentsPanel).toBeVisible();
  await expect(tasksPanel).toBeHidden();
  await expect(
    documentsPanel.getByText('No working Documents attached.'),
  ).toBeVisible();
  await tasksTab.click();
  await expect(tasksPanel.getByLabel('Task title')).toHaveValue(taskDraft);

  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Use classic frame' }).click();
  await expect(page.getByLabel('Task title')).toHaveValue(taskDraft);
  await expect(
    page
      .locator('#project-documents-panel')
      .getByRole('region', { name: 'Working Documents', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Try Prisme' }).click();
  await expect(tasksPanel.getByLabel('Task title')).toHaveValue(taskDraft);
  expect(reads).toEqual(readsAfterOpen);

  const rawIds = [company.id, client.id, existingProject.id, createdProject.id];
  for (const id of rawIds)
    await expect(page.getByText(id, { exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('prisme-projects-detail.png'),
    fullPage: true,
  });
});
