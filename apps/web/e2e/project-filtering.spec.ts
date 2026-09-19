import { expect, test } from '@playwright/test';
import { actorContextFixture } from './actor-context.fixture';

for (const frame of ['classic', 'prisme'] as const) {
  test(`${frame} filters loaded Projects without losing detail or exact retry`, async ({
    page,
  }, testInfo) => {
    const company = { id: 'company-filter', displayName: 'PRISMA-PRIM' };
    const clients = [
      {
        id: 'client-alpha',
        displayName: 'Alpha Advisory',
        relatedToActiveCompany: true,
      },
      {
        id: 'client-beta',
        displayName: 'Beta Certification',
        relatedToActiveCompany: true,
      },
    ];
    const firstProject = {
      id: 'project-beta',
      companyId: company.id,
      clientAccountId: clients[1].id,
      clientDisplayName: clients[1].displayName,
      title: 'ISO preparation',
      status: 'preparatory',
      createdAt: '2026-09-19T08:00:00.000Z',
    };
    const secondProject = {
      id: 'project-alpha',
      companyId: company.id,
      clientAccountId: clients[0].id,
      clientDisplayName: clients[0].displayName,
      title: 'ISO preparation',
      status: 'preparatory',
      createdAt: '2026-09-19T09:00:00.000Z',
    };
    const reopenedProject = {
      ...secondProject,
      title: 'ISO 9001 preparation',
    };
    const createdProject = {
      ...secondProject,
      id: 'project-created',
      title: 'New audit preparation',
    };
    const projects = [firstProject, secondProject];
    const createKeys: string[] = [];
    let projectReads = 0;

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
                    taskPermissionAssignmentId: 'task-grant',
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
      if (path === '/api/activity-log')
        return route.fulfill({ json: { events: [] } });
      if (path === '/api/clients') return route.fulfill({ json: clients });
      if (path === '/api/projects' && request.method() === 'POST') {
        const key = request.headers()['idempotency-key'];
        if (key) createKeys.push(key);
        if (createKeys.length === 1) return route.fulfill({ status: 500 });
        projects.push(createdProject);
        return route.fulfill({ status: 201, json: createdProject });
      }
      if (path === '/api/projects') {
        projectReads += 1;
        return route.fulfill({ json: projects });
      }
      if (path === `/api/projects/${secondProject.id}`)
        return route.fulfill({ json: reopenedProject });
      if (path.endsWith('/eligible-task-assignees'))
        return route.fulfill({ json: { members: [] } });
      if (path.endsWith('/tasks'))
        return route.fulfill({ json: { mutable: true, tasks: [] } });
      if (path === '/api/documents') return route.fulfill({ json: [] });
      if (path.endsWith('/documents'))
        return route.fulfill({ json: { mutable: true, documents: [] } });
      return route.fulfill({ status: 404 });
    });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/?frame=${frame}#projects`);
    if (frame === 'prisme' && testInfo.project.name === 'narrow')
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await page
      .getByLabel('Active Company', { exact: true })
      .selectOption(company.id);
    if (frame === 'prisme' && testInfo.project.name === 'narrow')
      await page.getByRole('button', { name: 'Close navigation' }).click();
    await page.goto(`/?frame=${frame}#projects`);

    const list = page.getByRole('list', { name: 'Projects' });
    await expect(list.getByRole('button')).toHaveCount(2);
    expect(await list.getByRole('button').allTextContents()).toEqual([
      `${firstProject.title} Client: ${firstProject.clientDisplayName}`,
      `${secondProject.title} Client: ${secondProject.clientDisplayName}`,
    ]);
    await expect(list.getByText(/Alpha Advisory/)).toBeVisible();
    await expect(list.getByText(/Beta Certification/)).toBeVisible();

    const search = page.getByRole('searchbox', { name: 'Find Projects' });
    await search.fill('aLpHa');
    await expect(
      list.getByRole('button', {
        name: `${secondProject.title} Client: ${secondProject.clientDisplayName}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      list.getByRole('button', {
        name: `${firstProject.title} Client: ${firstProject.clientDisplayName}`,
        exact: true,
      }),
    ).toHaveCount(0);
    expect(projectReads).toBe(1);

    await list
      .getByRole('button', {
        name: `${secondProject.title} Client: ${secondProject.clientDisplayName}`,
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: reopenedProject.title }),
    ).toBeVisible();
    await expect(
      list.getByRole('button', {
        name: `${reopenedProject.title} Client: ${reopenedProject.clientDisplayName}`,
        exact: true,
      }),
    ).toBeVisible();
    const taskDraft = 'Keep this draft while its Project row is hidden';
    await page.getByLabel('Task title').fill(taskDraft);
    await search.fill('beta');
    await expect(
      page.getByRole('heading', { name: reopenedProject.title }),
    ).toBeVisible();
    await expect(page.getByLabel('Task title')).toHaveValue(taskDraft);

    await search.fill('no matching project');
    await expect(
      page.getByText('No Project matches this search.'),
    ).toBeVisible();
    await expect(
      page.getByText('No preparatory Projects for this Company yet.'),
    ).toHaveCount(0);

    await search.fill('new');
    await page.getByLabel('Project title').fill(createdProject.title);
    await page
      .getByLabel('Client', { exact: true })
      .selectOption(createdProject.clientAccountId);
    await page
      .getByRole('button', { name: 'Create Project', exact: true })
      .click();
    await expect(page.getByRole('alert')).toHaveText(
      'The Project could not be loaded or saved. Please try again.',
    );
    await search.fill('new audit');
    await page
      .getByRole('button', { name: 'Create Project', exact: true })
      .click();
    await expect(
      list.getByRole('button', {
        name: `${createdProject.title} Client: ${createdProject.clientDisplayName}`,
        exact: true,
      }),
    ).toBeVisible();
    expect(createKeys).toHaveLength(2);
    expect(createKeys[0]).toBe(createKeys[1]);

    await search.focus();
    await expect(search).toBeFocused();
    expect(
      await search.evaluate(
        (element) => getComputedStyle(element).outlineStyle,
      ),
    ).not.toBe('none');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    for (const id of [
      company.id,
      ...clients.map((client) => client.id),
      ...projects.map((project) => project.id),
    ])
      await expect(page.getByText(id, { exact: true })).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`${frame}-project-filtering.png`),
      fullPage: true,
    });
  });
}
