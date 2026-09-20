import { expect, test } from '@playwright/test';
import { actorContextFixture } from './actor-context.fixture';

for (const frame of ['classic', 'prisme'] as const) {
  test(`${frame} navigates between one Client dossier and its loaded Projects`, async ({
    page,
  }, testInfo) => {
    const company = { id: 'company-navigation', displayName: 'PRISMA-PRIM' };
    const client = {
      id: 'client-navigation',
      displayName: 'Navigation Client',
      relatedToActiveCompany: true,
    };
    const otherClient = {
      id: 'other-client-navigation',
      displayName: 'Other Navigation Client',
      relatedToActiveCompany: true,
    };
    const dossier = {
      ...client,
      taxId: null,
      address: null,
      telephone: null,
      generalEmail: null,
      contacts: [],
      businessActivity: null,
      version: 1,
      involvedCompanyDisplayNames: [company.displayName],
    };
    const project = {
      id: 'project-navigation',
      companyId: company.id,
      clientAccountId: 'historical-client-navigation',
      clientDossierId: client.id,
      clientDisplayName: client.displayName,
      title: 'Navigation preparation',
      status: 'preparatory',
      createdAt: '2026-09-19T08:00:00.000Z',
    };
    const otherDossier = {
      ...otherClient,
      taxId: null,
      address: null,
      telephone: null,
      generalEmail: null,
      contacts: [],
      businessActivity: null,
      version: 1,
      involvedCompanyDisplayNames: [company.displayName],
    };
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
      if (path === '/api/clients')
        return route.fulfill({ json: [client, otherClient] });
      if (path === `/api/clients/${client.id}`)
        return route.fulfill({ json: dossier });
      if (path === `/api/clients/${otherClient.id}`)
        return route.fulfill({ json: otherDossier });
      if (path === '/api/projects') {
        projectReads += 1;
        return route.fulfill({ json: [project] });
      }
      if (path === `/api/projects/${project.id}`)
        return route.fulfill({ json: project });
      if (path.endsWith('/eligible-task-assignees'))
        return route.fulfill({ json: { members: [] } });
      if (path.endsWith('/tasks'))
        return route.fulfill({ json: { mutable: true, tasks: [] } });
      if (path === '/api/documents') return route.fulfill({ json: [] });
      if (path.endsWith('/documents'))
        return route.fulfill({ json: { mutable: false, documents: [] } });
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

    await page
      .getByRole('listitem')
      .filter({
        has: page.getByRole('heading', {
          name: client.displayName,
          exact: true,
        }),
      })
      .getByRole('button', { name: 'Open dossier' })
      .click();
    const dossierRegion = page.locator('.client-dossier-detail');
    await expect(
      dossierRegion.getByRole('heading', {
        name: client.displayName,
        exact: true,
      }),
    ).toBeVisible();
    await dossierRegion
      .getByRole('button', { name: 'Open Client Projects' })
      .click();

    const projectsTarget = page.locator('#projects');
    await expect(projectsTarget).toBeFocused();
    expect(
      await projectsTarget.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.top < window.innerHeight && bounds.bottom > 0;
      }),
    ).toBe(true);
    await expect(
      page.getByRole('searchbox', { name: 'Find Projects' }),
    ).toHaveValue(client.displayName);
    await page
      .getByRole('list', { name: 'Projects' })
      .getByRole('button', {
        name: `${project.title} Client: ${client.displayName}`,
      })
      .click();
    const taskDraft = 'Preserve this draft across dossier navigation';
    await page.getByLabel('Task title').fill(taskDraft);
    await page.getByRole('button', { name: 'Open Client dossier' }).click();

    await expect(page.locator('#clients')).toBeFocused();
    await expect(
      dossierRegion.getByRole('heading', {
        name: client.displayName,
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('listitem')
      .filter({
        has: page.getByRole('heading', {
          name: otherClient.displayName,
          exact: true,
        }),
      })
      .getByRole('button', { name: 'Open dossier' })
      .click();
    await expect(
      dossierRegion.getByRole('heading', {
        name: otherClient.displayName,
        exact: true,
      }),
    ).toBeVisible();
    if (testInfo.project.name === 'narrow')
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('link', { name: 'Projects', exact: true }).click();
    await expect(projectsTarget).toBeFocused();
    expect(
      await projectsTarget.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.top < window.innerHeight && bounds.bottom > 0;
      }),
    ).toBe(true);
    await page.getByRole('button', { name: 'Open Client dossier' }).click();
    await expect(page.locator('#clients')).toBeFocused();
    await expect(
      dossierRegion.getByRole('heading', {
        name: client.displayName,
        exact: true,
      }),
    ).toBeVisible();
    await dossierRegion
      .getByRole('button', { name: 'Open Client Projects' })
      .click();
    await expect(page.getByLabel('Task title')).toHaveValue(taskDraft);
    await page.getByRole('searchbox', { name: 'Find Projects' }).fill('');
    await expect(
      page.getByRole('list', { name: 'Projects' }).getByRole('button'),
    ).toHaveCount(1);
    expect(projectReads).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`${frame}-client-project-navigation.png`),
      fullPage: true,
    });
  });
}
