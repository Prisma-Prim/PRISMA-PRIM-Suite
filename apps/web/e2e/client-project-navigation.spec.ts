import { expect, test } from '@playwright/test';
import {
  actorContextFixture,
  preparatoryLifecycle,
  unassignedResponsibility,
} from './actor-context.fixture';

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
      if (path.endsWith('/responsible'))
        return route.fulfill({ json: unassignedResponsibility });
      if (path.endsWith('/lifecycle'))
        return route.fulfill({ json: preparatoryLifecycle });
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

  test(`${frame} lists a historical Project from the canonical and then the restored dossier`, async ({
    page,
  }, testInfo) => {
    const company = { id: 'company-identity', displayName: 'PRISMA-PRIM' };
    const first = {
      id: 'client-identity-first',
      version: 2,
      displayName: 'Identity Client',
      taxId: 'UNION-344',
      address: null,
      telephone: '+373 60 111 222',
      generalEmail: null,
      businessActivity: null,
      contacts: [{ name: 'Alex' }],
    };
    const second = {
      ...first,
      id: 'client-identity-second',
      version: 4,
      displayName: 'Identity Client Canonical',
      address: '14 Example Avenue',
      contacts: [{ name: 'Dana' }],
    };
    const reviewReference = 'review-identity';
    const projectionReference = 'projection-identity';
    const project = {
      id: 'project-identity',
      companyId: company.id,
      clientAccountId: first.id,
      clientDisplayName: first.displayName,
      title: 'Identity preparation',
      status: 'preparatory',
      createdAt: '2026-09-19T08:00:00.000Z',
    };
    const projectRow = `${project.title} Client: ${first.displayName}`;
    const taskDraft = 'Preserve this draft across the union and its reversal';
    let united = false;
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
                    clientPermissions: [
                      'client.read',
                      'client.create',
                      'client.update',
                      'client.duplicate.resolve',
                    ],
                    clientPermissionAssignmentId: 'client-identity-grant',
                    clientPermissionSetVersion: 'v2',
                    projectPermissions: ['project.read'],
                    taskPermissions: ['task.read', 'task.manage'],
                    taskPermissionAssignmentId: 'task-identity-grant',
                    taskPermissionSetVersion: 'v1',
                  },
                }
              : {}),
          },
        });
      if (path === '/api/companies') return route.fulfill({ json: [company] });
      if (path === '/api/activity-log')
        return route.fulfill({ json: { events: [] } });
      if (path === '/api/client-duplicate-reviews')
        return route.fulfill({ json: { items: [], next_cursor: null } });
      if (path === '/api/clients')
        return route.fulfill({
          json: (united ? [second] : [first, second]).map((client) => ({
            ...client,
            relatedToActiveCompany: true,
          })),
        });
      if (path === `/api/clients/${first.id}/union-reviews`)
        return route.fulfill({
          status: 201,
          json: {
            outcome: 'comparison',
            reviewReference,
            clients: [first, second],
            companies: [company],
          },
        });
      if (path === `/api/client-union-reviews/${reviewReference}/confirm`) {
        united = true;
        return route.fulfill({
          status: 201,
          json: {
            outcome: 'united',
            canonicalClientId: second.id,
            projectionReference,
          },
        });
      }
      if (path.endsWith('/union-history'))
        return route.fulfill({
          json: {
            events: [
              {
                action: 'client.union_confirmed',
                projectionReference,
                companyId: company.id,
              },
            ],
            detailReferences: [projectionReference],
          },
        });
      if (path === `/api/client-union-operations/${projectionReference}`)
        return route.fulfill({
          json: {
            state: 'united',
            projectionReference,
            canonicalClientId: second.id,
            originals: [first, second],
            companies: [company],
            reason: 'Same verified legal identity.',
            occurredAt: '2026-09-20T12:00:00.000Z',
            actor: { displayName: actorContextFixture.displayName },
            reversal: null,
            canReverse: true,
          },
        });
      if (
        path === `/api/client-union-operations/${projectionReference}/reversal`
      ) {
        united = false;
        return route.fulfill({
          status: 201,
          json: { outcome: 'reversed', clientIds: [first.id, second.id] },
        });
      }
      const dossier = [first, second].find(
        (client) => path === `/api/clients/${client.id}`,
      );
      if (dossier)
        return route.fulfill({
          json: {
            ...dossier,
            relatedToActiveCompany: true,
            involvedCompanyDisplayNames: [company.displayName],
          },
        });
      const projected = {
        ...project,
        clientDossierId: united ? second.id : first.id,
      };
      if (path === '/api/projects') {
        projectReads += 1;
        return route.fulfill({ json: [projected] });
      }
      if (path === `/api/projects/${project.id}`)
        return route.fulfill({ json: projected });
      if (path.endsWith('/eligible-task-assignees'))
        return route.fulfill({ json: { members: [] } });
      if (path.endsWith('/responsible'))
        return route.fulfill({ json: unassignedResponsibility });
      if (path.endsWith('/lifecycle'))
        return route.fulfill({ json: preparatoryLifecycle });
      if (path.endsWith('/tasks'))
        return route.fulfill({ json: { mutable: true, tasks: [] } });
      if (path === '/api/documents') return route.fulfill({ json: [] });
      if (path.endsWith('/documents'))
        return route.fulfill({ json: { mutable: false, documents: [] } });
      return route.fulfill({ status: 404 });
    });

    const navigate = async (label: string) => {
      const menu = page.getByRole('button', { name: 'Open navigation' });
      if (await menu.isVisible()) await menu.click();
      await page
        .getByRole('navigation', { name: 'Primary navigation' })
        .getByRole('link', { name: label, exact: true })
        .click();
    };
    const openDossier = (displayName: string) =>
      page
        .getByRole('listitem')
        .filter({
          has: page.getByRole('heading', { name: displayName, exact: true }),
        })
        .getByRole('button', { name: 'Open dossier' })
        .click();
    const dossierRegion = page.locator('.client-dossier-detail');
    const union = page.getByRole('region', { name: 'Governed Client union' });
    const projectsTarget = page.locator('#projects');
    const projectList = page.getByRole('list', { name: 'Projects' });
    const search = page.getByRole('searchbox', { name: 'Find Projects' });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/?frame=${frame}#clients`);
    if (frame === 'prisme' && testInfo.project.name === 'narrow')
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await page
      .getByLabel('Active Company', { exact: true })
      .selectOption(company.id);
    if (frame === 'prisme' && testInfo.project.name === 'narrow')
      await page.getByRole('button', { name: 'Close navigation' }).click();

    await navigate('Projects');
    await projectList.getByRole('button', { name: projectRow }).click();
    await page.getByLabel('Task title').fill(taskDraft);
    const readsBeforeUnion = projectReads;

    await navigate('Clients');
    await openDossier(first.displayName);
    await union
      .getByRole('button', { name: 'Review existing duplicates' })
      .click();
    const confirm = union.getByRole('form', { name: 'Confirm union' });
    await expect(confirm).toBeVisible();
    for (const select of await confirm.getByRole('combobox').all())
      await select.selectOption(second.id);
    await confirm
      .getByLabel('Reason for this union')
      .fill('Same verified legal identity.');
    for (const checkbox of await confirm.getByRole('checkbox').all())
      await checkbox.check();
    await confirm
      .getByRole('button', { name: 'Confirm union', exact: true })
      .click();
    await expect(
      dossierRegion.getByRole('heading', {
        name: second.displayName,
        exact: true,
      }),
    ).toBeVisible();

    await dossierRegion
      .getByRole('button', { name: 'Open Client Projects' })
      .click();
    await expect(projectsTarget).toBeFocused();
    await expect(search).toHaveValue(second.displayName);
    await expect(projectList.getByRole('button')).toHaveCount(1);
    await expect(
      projectList.getByRole('button', { name: projectRow }),
    ).toBeVisible();
    await expect(page.getByLabel('Task title')).toHaveValue(taskDraft);
    await page.getByRole('button', { name: 'Open Client dossier' }).click();
    await expect(page.locator('#clients')).toBeFocused();
    await expect(
      dossierRegion.getByRole('heading', {
        name: second.displayName,
        exact: true,
      }),
    ).toBeVisible();

    await union
      .getByRole('button', { name: 'Union history', exact: true })
      .click();
    await union
      .getByRole('button', { name: 'View authorized union details' })
      .click();
    const reversal = union.getByRole('form', { name: 'Reverse union' });
    await reversal
      .getByLabel('Reason for reversal')
      .fill('Restore separate dossiers.');
    await reversal.getByRole('checkbox').check();
    await reversal
      .getByRole('button', { name: 'Reverse union', exact: true })
      .click();
    await expect(union.getByText(/Union reversed\./)).toBeVisible();

    await openDossier(first.displayName);
    await expect(
      dossierRegion.getByRole('heading', {
        name: first.displayName,
        exact: true,
      }),
    ).toBeVisible();
    await dossierRegion
      .getByRole('button', { name: 'Open Client Projects' })
      .click();
    await expect(projectsTarget).toBeFocused();
    await expect(search).toHaveValue(first.displayName);
    await expect(projectList.getByRole('button')).toHaveCount(1);
    await expect(
      projectList.getByRole('button', { name: projectRow }),
    ).toBeVisible();
    await expect(page.getByLabel('Task title')).toHaveValue(taskDraft);
    expect(projectReads).toBe(readsBeforeUnion + 2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`${frame}-client-project-identity.png`),
      fullPage: true,
    });
  });
}
