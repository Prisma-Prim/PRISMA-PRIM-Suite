import { expect, test } from '@playwright/test';
import { actorContextFixture } from './actor-context.fixture';

for (const frame of ['classic', 'prisme'] as const) {
  test(`${frame} navigates between a Client dossier and its Projects`, async ({
    page,
  }, testInfo) => {
    const company = { id: 'company-navigation', displayName: 'PRISMA-PRIM' };
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
    const projects = clients.map((client) => ({
      id: `project-${client.id}`,
      companyId: company.id,
      clientAccountId: client.id,
      clientDisplayName: client.displayName,
      title: `${client.displayName} preparation`,
      status: 'preparatory',
      createdAt: '2026-09-19T08:00:00.000Z',
    }));
    let projectReads = 0;

    await page.route('**/api/**', (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const companyContext = request.headers()['x-company-context-id'];
      if (path === '/api/access/current-actor')
        return route.fulfill({
          json: {
            ...actorContextFixture,
            ...(companyContext
              ? {
                  activeCompany: {
                    ...company,
                    clientPermissions: ['client.read'],
                    projectPermissions: ['project.read'],
                    taskPermissions: ['task.read', 'task.manage'],
                    taskPermissionAssignmentId: 'task-navigation',
                    taskPermissionSetVersion: 'v1',
                  },
                }
              : {}),
          },
        });
      if (path === '/api/companies') return route.fulfill({ json: [company] });
      if (path === '/api/activity-log')
        return route.fulfill({ json: { events: [] } });
      if (path === '/api/clients') return route.fulfill({ json: clients });
      if (path === `/api/clients/${clients[0].id}`)
        return route.fulfill({
          json: {
            ...clients[0],
            taxId: null,
            address: null,
            telephone: null,
            generalEmail: null,
            contacts: [],
            businessActivity: null,
            version: 1,
            involvedCompanyDisplayNames: [company.displayName],
          },
        });
      if (path === '/api/projects') {
        projectReads += 1;
        return route.fulfill({ json: projects });
      }
      if (path === `/api/projects/${projects[0].id}`)
        return route.fulfill({ json: projects[0] });
      if (path.endsWith('/tasks'))
        return route.fulfill({ json: { mutable: true, tasks: [] } });
      if (path.endsWith('/eligible-task-assignees'))
        return route.fulfill({ json: { members: [] } });
      if (path.includes('/client-duplicate-reviews'))
        return route.fulfill({ json: { items: [], next_cursor: null } });
      return route.fulfill({ status: 404 });
    });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/?frame=${frame}#clients`);
    if (frame === 'prisme' && testInfo.project.name === 'narrow')
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await page
      .getByLabel('Active Company', { exact: true })
      .selectOption(company.id);
    if (frame === 'prisme' && testInfo.project.name === 'narrow')
      await page.getByRole('button', { name: 'Close navigation' }).click();
    await page.goto(`/?frame=${frame}#clients`);

    await page.getByRole('button', { name: 'Open dossier' }).first().click();
    await expect(
      page.getByRole('heading', { name: clients[0].displayName }),
    ).toBeVisible();
    const readsBeforeNavigation = projectReads;
    await page.getByRole('button', { name: 'Open Client Projects' }).click();
    await expect(page).toHaveURL(/#projects$/);
    const search = page.getByRole('searchbox', { name: 'Find Projects' });
    await expect(search).toHaveValue(clients[0].displayName);
    await expect(
      page.getByRole('list', { name: 'Projects' }).getByRole('button'),
    ).toHaveCount(1);
    expect(projectReads).toBe(readsBeforeNavigation);

    await search.fill('');
    await expect(
      page.getByRole('list', { name: 'Projects' }).getByRole('button'),
    ).toHaveCount(2);
    await page
      .getByRole('button', { name: new RegExp(projects[0].title) })
      .click();
    const taskDraft = 'Preserve this mounted Task draft';
    await page.getByLabel('Task title').fill(taskDraft);
    await page.getByRole('button', { name: 'Open Client dossier' }).click();
    await expect(page).toHaveURL(/#clients$/);
    await expect(
      page.getByRole('heading', { name: clients[0].displayName }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Open Client Projects' }).click();
    await expect(page.getByLabel('Task title')).toHaveValue(taskDraft);
    expect(projectReads).toBe(readsBeforeNavigation);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    for (const id of [
      company.id,
      ...clients.map(({ id }) => id),
      ...projects.map(({ id }) => id),
    ])
      await expect(page.getByText(id, { exact: true })).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`${frame}-client-project-navigation.png`),
      fullPage: true,
    });
  });
}
