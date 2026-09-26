import { expect, test, type Page } from '@playwright/test';
import type { TaskView } from '../src/project/task-response';
import {
  actorContextFixture,
  operationalHomeFixture,
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
      if (path === '/api/operational-home')
        return route.fulfill({
          json: operationalHomeFixture(company.id, {
            active_clients: 2,
            open_projects: 1,
            overdue_tasks: 0,
          }),
        });
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
      if (path === '/api/operational-home')
        return route.fulfill({
          json: operationalHomeFixture(company.id, {
            active_clients: united ? 1 : 2,
            open_projects: 1,
            overdue_tasks: 0,
          }),
        });
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

  test(`${frame} opens the records each Company summary counts from the home`, async ({
    page,
  }, testInfo) => {
    // Long Romanian names prove the summary, cards and panel fit both widths.
    const company = {
      id: 'company-operational-home',
      displayName:
        'PRISMA-PRIM Consultanță, Instruire și Certificare a Sistemelor de Management',
    };
    const client = {
      id: 'client-operational-home',
      displayName:
        'GRUP Demo SA — Întreprinderea Mixtă de Producție și Comercializare Agroalimentară',
      relatedToActiveCompany: true,
    };
    const otherClient = {
      id: 'other-client-operational-home',
      displayName: 'Demo Logistic SRL',
      relatedToActiveCompany: true,
    };
    const project = {
      id: 'project-operational-home',
      companyId: company.id,
      clientAccountId: client.id,
      clientDossierId: client.id,
      clientDisplayName: client.displayName,
      title:
        'ISO 9001 — Pregătirea documentației sistemului de management al calității',
      status: 'preparatory',
      createdAt: '2026-09-19T08:00:00.000Z',
    };
    const attribution = {
      internalUserId: actorContextFixture.internalUserId,
      workspaceMembershipId: actorContextFixture.workspaceMembershipId,
      displayName: actorContextFixture.displayName,
    };
    const collect = {
      id: 'task-collect-procedures',
      companyId: company.id,
      projectId: project.id,
      clientAccountId: client.id,
      title:
        'Colectarea procedurilor operaționale și a înregistrărilor proceselor de producție',
      assignee: {
        workspaceMembershipId: actorContextFixture.workspaceMembershipId,
        displayLabel: 'Ana Popescu · 1',
      },
      dueDate: '2026-09-20',
      priority: 'normal',
      status: 'todo',
      completion: null,
      version: 1,
      createdAt: '2026-09-19T09:00:00.000Z',
      updatedAt: '2026-09-19T09:00:00.000Z',
      createdBy: attribution,
    } satisfies TaskView;
    const manual = {
      ...collect,
      id: 'task-quality-manual',
      title: 'Redactarea manualului calității',
      assignee: null,
      dueDate: '2026-09-26',
      status: 'blocked',
      version: 2,
      blockage: {
        reason: 'Se așteaptă domeniul semnat.',
        actor: attribution,
        occurredAt: '2026-09-24T10:00:00.000Z',
      },
    } satisfies TaskView;
    const approve = {
      ...collect,
      id: 'task-approve-audit-plan',
      title: 'Approve audit plan',
      dueDate: null,
      priority: 'critical',
    } satisfies TaskView;
    const signature = {
      ...collect,
      id: 'task-obtain-client-signature',
      title: 'Obtain client signature',
      dueDate: null,
      status: 'blocked',
      version: 2,
      blockage: {
        reason: 'Waiting for the Client.',
        actor: attribution,
        occurredAt: '2026-09-24T11:00:00.000Z',
      },
    } satisfies TaskView;
    const plan = {
      ...collect,
      id: 'task-plan-internal-audit',
      title: 'Plan internal audit',
      dueDate: '2026-09-27',
    } satisfies TaskView;
    const invitations = {
      ...collect,
      id: 'task-send-training-invitations',
      title: 'Send training invitations',
      dueDate: '2026-10-02',
    } satisfies TaskView;
    const order = {
      ...collect,
      id: 'task-order-materials',
      title: 'Order materials',
      dueDate: '2026-10-05',
    } satisfies TaskView;
    const tasks: TaskView[] = [
      collect,
      manual,
      approve,
      signature,
      plan,
      invitations,
      order,
    ];
    const labels = {
      id: project.id,
      title: project.title,
      clientDisplayName: project.clientDisplayName,
    };
    const taskReads: string[] = [];
    const reads = { home: 0, overdue: 0, projects: 0, tasks: taskReads };

    await page.route('**/api/**', (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      const companyContext = request.headers()['x-company-context-id'];
      expect(request.method()).toBe('GET');
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
                    taskPermissionAssignmentId: 'task-operational-home',
                    taskPermissionSetVersion: 'v1',
                  },
                }
              : {}),
          },
        });
      if (path === '/api/companies') return route.fulfill({ json: [company] });
      if (path === '/api/activity-log')
        return route.fulfill({ json: { events: [] } });
      if (path === '/api/operational-home') {
        reads.home += 1;
        expect(companyContext).toBe(company.id);
        return route.fulfill({
          json: {
            ...operationalHomeFixture(company.id, {
              active_clients: 2,
              open_projects: 1,
              overdue_tasks: 2,
            }),
            attention: {
              matchingCount: 5,
              tasks: [
                {
                  ...collect,
                  project: labels,
                  rules: ['overdue'],
                  dueInDays: -7,
                },
                {
                  ...approve,
                  project: labels,
                  rules: ['critical'],
                  dueInDays: null,
                },
                {
                  ...signature,
                  project: labels,
                  rules: ['blocked'],
                  dueInDays: null,
                },
                {
                  ...plan,
                  project: labels,
                  rules: ['due_soon'],
                  dueInDays: 0,
                },
                {
                  ...invitations,
                  project: labels,
                  rules: ['due_soon'],
                  dueInDays: 5,
                },
              ],
            },
          },
        });
      }
      if (path === '/api/overdue-tasks') {
        reads.overdue += 1;
        expect(companyContext).toBe(company.id);
        return route.fulfill({
          json: {
            companyId: company.id,
            today: '2026-09-27',
            total: tasks.length,
            tasks: [
              { ...collect, project: labels, daysOverdue: 7 },
              { ...manual, project: labels, daysOverdue: 1 },
            ],
          },
        });
      }
      if (path === '/api/clients')
        return route.fulfill({ json: [client, otherClient] });
      for (const account of [client, otherClient])
        if (path === `/api/clients/${account.id}`)
          return route.fulfill({
            json: {
              ...account,
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
      if (path === '/api/assigned-tasks')
        return route.fulfill({ json: { tasks: [] } });
      if (path === '/api/projects') {
        reads.projects += 1;
        return route.fulfill({ json: [project] });
      }
      if (path === `/api/projects/${project.id}`)
        return route.fulfill({ json: project });
      if (path === `/api/projects/${project.id}/tasks`)
        return route.fulfill({ json: { mutable: true, tasks } });
      if (path.endsWith('/eligible-task-assignees'))
        return route.fulfill({ json: { members: [] } });
      if (path.endsWith('/responsible'))
        return route.fulfill({ json: unassignedResponsibility });
      for (const task of tasks) {
        if (path === `/api/tasks/${task.id}`) {
          reads.tasks.push(task.id);
          return route.fulfill({ json: { mutable: true, task } });
        }
        if (path === `/api/tasks/${task.id}/history`)
          return route.fulfill({ json: { events: [] } });
      }
      if (path === '/api/documents') return route.fulfill({ json: [] });
      if (path.endsWith('/documents'))
        return route.fulfill({ json: { mutable: false, documents: [] } });
      return route.fulfill({ status: 404 });
    });

    const narrow = testInfo.project.name === 'narrow';
    const navigation = page.getByRole('navigation', {
      name: 'Primary navigation',
    });
    const openHome = async () => {
      if (frame === 'classic') return;
      if (narrow)
        await page.getByRole('button', { name: 'Open navigation' }).click();
      await navigation
        .getByRole('link', { name: 'Overview', exact: true })
        .click();
    };
    const summary = page.getByRole('region', {
      name: 'Company summary',
      exact: true,
    });
    const card = (name: string) =>
      summary.getByRole('button', { name, exact: true });
    const clientsCard = card('Active Clients: 2. Open the Client directory');
    const projectsCard = card('Open Projects: 1. Open the Project list');
    const overdueCard = card('Overdue Tasks: 2. Show the overdue Tasks');
    const attention = page.getByRole('region', {
      name: 'My attention',
      exact: true,
    });
    const projectsTarget = page.locator('#projects');
    const search = page.getByRole('searchbox', { name: 'Find Projects' });

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/?frame=${frame}`);
    if (frame === 'prisme' && narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await page
      .getByLabel('Active Company', { exact: true })
      .selectOption(company.id);
    if (frame === 'prisme' && narrow)
      await page.getByRole('button', { name: 'Close navigation' }).click();

    // The home reads the three counts of the active Company.
    await expect(clientsCard).toBeVisible();
    await expect(projectsCard).toBeVisible();
    await expect(overdueCard).toBeVisible();
    await expect(attention).toBeVisible();
    const attentionRows = attention.getByRole('listitem');
    await expect(attentionRows).toHaveCount(5);
    await expect(attentionRows.nth(0)).toContainText(collect.title);
    await expect(attentionRows.nth(0)).toContainText('Overdue by 7 days');
    await expect(attentionRows.nth(1)).toContainText('Approve audit plan');
    await expect(attentionRows.nth(1)).toContainText('Critical');
    await expect(attentionRows.nth(1)).toContainText('No due date');
    await expect(attentionRows.nth(2)).toContainText('Obtain client signature');
    await expect(attentionRows.nth(2)).toContainText('Blocked');
    await expect(attentionRows.nth(3)).toContainText('Plan internal audit');
    await expect(attentionRows.nth(3)).toContainText('Due today');
    await expect(attentionRows.nth(4)).toContainText(
      'Send training invitations',
    );
    await expect(attentionRows.nth(4)).toContainText('Due in 5 days');
    await expect(attention).not.toContainText('Order materials');
    const attentionBox = await attention.boundingBox();
    const cardsBox = await clientsCard.boundingBox();
    if (!attentionBox || !cardsBox)
      throw new Error('Expected the attention queue and Company summary.');
    expect(attentionBox.y).toBeLessThan(cardsBox.y);
    await expect(summary).toContainText(
      `Counted on 2026-09-27 from the records you can open in ${company.displayName}.`,
    );
    await expect(clientsCard).toHaveAccessibleDescription(
      `Clients with an active relationship with ${company.displayName}`,
    );
    await expect(overdueCard).toHaveAccessibleDescription(
      'Open Tasks due before 2026-09-27 in Projects you can open',
    );
    const boxes = await Promise.all(
      [clientsCard, projectsCard, overdueCard].map(async (target) => {
        const box = await target.boundingBox();
        if (!box) throw new Error('Expected a visible summary card.');
        return box;
      }),
    );
    const [first, second, third] = boxes;
    if (!first || !second || !third) throw new Error('Expected three cards.');
    if (narrow) {
      // One card per row at 390px.
      expect(second.y).toBeGreaterThanOrEqual(first.y + first.height);
      expect(third.y).toBeGreaterThanOrEqual(second.y + second.height);
    } else {
      expect(second.y).toBe(first.y);
      expect(third.x).toBeGreaterThan(second.x);
    }
    await expectNoHorizontalOverflow(page);
    await summary.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`${frame}-operational-home-attention.png`),
      fullPage: true,
    });

    // The queue uses App's existing My Tasks and Task-in-Project intents.
    await attention
      .getByRole('button', { name: 'See all in My Tasks', exact: true })
      .click();
    await expect(page.locator('#my-tasks')).toBeFocused();
    await openHome();
    await attention
      .getByRole('button', {
        name: `Open ${signature.title} in ${project.title} (${client.displayName})`,
        exact: true,
      })
      .click();
    await expect(projectsTarget).toBeFocused();
    await expect(
      page
        .locator('.project-workspace')
        .getByRole('region', { name: 'Tasks', exact: true })
        .getByRole('heading', { name: signature.title, exact: true }),
    ).toBeVisible();
    await openHome();

    // Active Clients opens the Client directory it counts.
    await clientsCard.click();
    await expect(page.locator('#clients')).toBeFocused();
    const clientRow = page
      .locator('.client-workspace')
      .getByRole('listitem')
      .filter({
        has: page.getByRole('heading', {
          name: client.displayName,
          exact: true,
        }),
      });
    await expect(clientRow).toBeVisible();

    // A Client restriction App holds is cleared by Open Projects.
    await clientRow.getByRole('button', { name: 'Open dossier' }).click();
    await page
      .locator('.client-dossier-detail')
      .getByRole('button', { name: 'Open Client Projects' })
      .click();
    await expect(projectsTarget).toBeFocused();
    await expect(search).toHaveValue(client.displayName);
    await openHome();
    await projectsCard.click();
    await expect(projectsTarget).toBeFocused();
    await expect(search).toHaveValue('');
    await expect(
      page
        .getByRole('list', { name: 'Projects', exact: true })
        .getByRole('button', {
          name: `${project.title} Client: ${client.displayName}`,
          exact: true,
        }),
    ).toBeVisible();

    // Overdue Tasks opens the Company list on the home, oldest first.
    await openHome();
    await overdueCard.click();
    const panel = page.getByRole('region', {
      name: `Overdue Tasks in ${company.displayName}`,
      exact: true,
    });
    await expect(
      panel.getByRole('heading', {
        name: `Overdue Tasks in ${company.displayName}`,
        exact: true,
      }),
    ).toBeFocused();
    const rows = panel.getByRole('listitem');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText(collect.title);
    await expect(rows.nth(0)).toContainText('Overdue by 7 days');
    await expect(rows.nth(0)).toContainText('Ana Popescu · 1');
    await expect(rows.nth(1)).toContainText(manual.title);
    await expect(rows.nth(1)).toContainText('Blocked');
    await expect(rows.nth(1)).toContainText('Overdue by 1 day');
    await expect(rows.nth(1)).toContainText('Unassigned');
    await expect(rows.nth(0)).toContainText(project.title);
    await expect(rows.nth(0)).toContainText(client.displayName);
    await expectNoHorizontalOverflow(page);
    await panel.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath(`${frame}-operational-home-overdue.png`),
      fullPage: true,
    });
    await panel
      .getByRole('button', { name: 'Close the overdue Tasks', exact: true })
      .click();
    await expect(panel).toHaveCount(0);
    await expect(overdueCard).toBeFocused();

    // Each row opens its Task in its Project.
    await overdueCard.click();
    await panel
      .getByRole('button', {
        name: `Open ${collect.title} in ${project.title} (${client.displayName})`,
        exact: true,
      })
      .click();
    await expect(projectsTarget).toBeFocused();
    const projectTasks = page
      .locator('.project-workspace')
      .getByRole('region', { name: 'Tasks', exact: true });
    await expect(
      projectTasks.getByRole('heading', { name: collect.title, exact: true }),
    ).toBeVisible();
    await expect(
      projectTasks.locator('dd').getByText(collect.dueDate, { exact: true }),
    ).toBeVisible();
    // The drill-downs reuse the mounted owners: one Project list read.
    expect(reads.projects).toBe(1);
    expect(reads.tasks).toEqual([signature.id, collect.id]);
    expect(reads.overdue).toBe(2);
    expect(reads.home).toBeGreaterThanOrEqual(frame === 'prisme' ? 3 : 1);
    for (const id of [project.id, collect.id])
      expect(page.url()).not.toContain(id);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`${frame}-operational-home-task.png`),
      fullPage: true,
    });
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}
