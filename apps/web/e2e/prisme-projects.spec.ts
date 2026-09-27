import { expectSelectAppearance } from './select-appearance';
import { enterClassicCompatibility } from './classic-compatibility';
import { expectValue, selectOption } from './select-option';
import { expect, test, type Page } from '@playwright/test';
import type { ProjectLifecycle } from '../src/project/project-lifecycle-response';
import type { TaskView } from '../src/project/task-response';
import {
  actorContextFixture,
  preparatoryLifecycle,
  operationalHomeFixture,
} from './actor-context.fixture';

const ana = {
  workspaceMembershipId: 'ana-membership',
  displayLabel: 'Ana-Maria Ionescu-Vasilescu Șerbănescu · 3F',
};
const exceptionReason =
  'Lucrările încep pe baza acordului preliminar semnat; Oferta aprobată și Contractul sunt în curs de finalizare cu departamentul juridic al clientului.';
const holdReason =
  'Clientul a cerut o pauză până la confirmarea datei auditului de certificare ISO 9001 de către organismul de certificare.';
const completionNote =
  'Certification preparation delivered; final report handed over to the Client.';

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

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
  let lifecycle: ProjectLifecycle = preparatoryLifecycle;
  const transitions: unknown[] = [];
  let taskCreated = false;
  let task: TaskView = {
    id: 'task-project-completion',
    companyId: company.id,
    projectId: createdProject.id,
    clientAccountId: client.id,
    title: 'Prepare the certification interview',
    assignee: null,
    dueDate: null,
    priority: 'normal',
    status: 'todo',
    completion: null,
    version: 1,
    createdAt: '2026-09-26T10:00:00.000Z',
    updatedAt: '2026-09-26T10:00:00.000Z',
    createdBy: {
      internalUserId: actorContextFixture.internalUserId,
      workspaceMembershipId: actorContextFixture.workspaceMembershipId,
      displayName: actorContextFixture.displayName,
    },
  };

  /** Applies one section 23 transition to the created Project. */
  function transition(body: unknown): unknown {
    const occurredAt = new Date(
      Date.UTC(2026, 8, 26, 10, lifecycle.lifecycleRevision),
    ).toISOString();
    const actor = { displayName: actorContextFixture.displayName };
    const lifecycleRevision = lifecycle.lifecycleRevision + 1;
    if (typeof body !== 'object' || body === null || !('action' in body))
      throw new Error('Unexpected lifecycle command.');
    transitions.push(body);
    switch (body.action) {
      case 'activate':
        lifecycle = {
          status: 'active',
          lifecycleRevision,
          mutable: true,
          start: {
            declaredAt: occurredAt,
            declaredBy: actor,
            declaration: {
              approvedOffer: 'missing',
              contractOrPrecontract: 'missing',
              projectPlan: 'present',
              initialDocuments: 'present',
              deadlines: 'present',
              financialConditions: 'missing',
              risks: 'present',
            },
            exception: {
              reason: exceptionReason,
              completionResponsible: ana,
              completionDueDate: '2026-10-15',
            },
          },
          transitions: [
            {
              action: 'activate',
              lifecycleRevision,
              from: 'preparatory',
              to: 'active',
              occurredAt,
              actor,
              withStartException: true,
            },
          ],
        };
        break;
      case 'hold':
        lifecycle = {
          ...lifecycle,
          status: 'on_hold',
          lifecycleRevision,
          transitions: [
            {
              action: 'hold',
              lifecycleRevision,
              from: 'active',
              to: 'on_hold',
              occurredAt,
              actor,
              reason: holdReason,
            },
            ...lifecycle.transitions,
          ],
        };
        break;
      case 'resume':
        lifecycle = {
          ...lifecycle,
          status: 'active',
          lifecycleRevision,
          transitions: [
            {
              action: 'resume',
              lifecycleRevision,
              from: 'on_hold',
              to: 'active',
              occurredAt,
              actor,
            },
            ...lifecycle.transitions,
          ],
        };
        break;
      case 'complete':
        lifecycle = {
          ...lifecycle,
          status: 'completed',
          lifecycleRevision,
          mutable: false,
          transitions: [
            {
              action: 'complete',
              lifecycleRevision,
              from: 'active',
              to: 'completed',
              occurredAt,
              actor,
              note:
                'note' in body && typeof body.note === 'string'
                  ? body.note
                  : '',
            },
            ...lifecycle.transitions,
          ],
        };
        break;
      default:
        throw new Error('Unexpected lifecycle action.');
    }
    const [last] = lifecycle.transitions;
    return {
      projectId: createdProject.id,
      action: last?.action,
      from: last?.from,
      to: last?.to,
      lifecycleRevision,
    };
  }

  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const companyContext = request.headers()['x-company-context-id'];
    const created = { ...createdProject, status: lifecycle.status };
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
                  projectApproverPermissions: [
                    'project.lifecycle.transition',
                    'project.close',
                  ],
                  projectApproverPermissionAssignmentId: 'approver-grant',
                  projectApproverPermissionSetVersion: 'v1',
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
    if (path === '/api/operational-home')
      return route.fulfill({
        json: operationalHomeFixture(company.id, {
          active_clients: 1,
          open_projects: projects.length,
          overdue_tasks: 0,
        }),
      });
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
      return route.fulfill({ status: 201, json: created });
    }
    if (path === '/api/projects')
      return route.fulfill({
        json: projects.map((row) => (row.id === created.id ? created : row)),
      });
    if (path === `/api/projects/${existingProject.id}`)
      return route.fulfill({ json: existingProject });
    if (path === `/api/projects/${createdProject.id}`)
      return route.fulfill({ json: created });
    if (
      path === `/api/projects/${createdProject.id}/tasks` &&
      request.method() === 'POST'
    ) {
      expect(request.postDataJSON()).toMatchObject({ title: task.title });
      taskCreated = true;
      return route.fulfill({ status: 201, json: task });
    }
    if (path === `/api/projects/${createdProject.id}/tasks`) {
      reads.tasks += 1;
      return route.fulfill({
        json: {
          mutable: lifecycle.mutable,
          tasks: taskCreated ? [task] : [],
        },
      });
    }
    if (path === `/api/projects/${createdProject.id}/eligible-task-assignees`)
      return route.fulfill({ json: { members: [] } });
    if (path === `/api/projects/${createdProject.id}/responsible`)
      return route.fulfill({
        json: {
          responsible: ana,
          revision: 1,
          lastChange: {
            actorDisplayName: actorContextFixture.displayName,
            occurredAt: '2026-09-26T09:00:00.000Z',
          },
          mutable: lifecycle.mutable,
        },
      });
    if (path === `/api/projects/${createdProject.id}/lifecycle`)
      return route.fulfill({ json: lifecycle });
    if (
      path ===
      `/api/projects/${createdProject.id}/eligible-start-exception-members`
    )
      return route.fulfill({ json: { members: [ana] } });
    if (
      path === `/api/projects/${createdProject.id}/lifecycle-transitions` &&
      request.method() === 'POST'
    ) {
      expect(request.headers()['idempotency-key']).toBeTruthy();
      const command: unknown = request.postDataJSON();
      if (
        typeof command === 'object' &&
        command !== null &&
        'action' in command &&
        command.action === 'complete' &&
        taskCreated &&
        task.status !== 'done' &&
        task.status !== 'cancelled'
      )
        return route.fulfill({
          status: 409,
          json: {
            statusCode: 409,
            code: 'project_open_tasks',
            message:
              'Complete or cancel every open Task of this Project first.',
          },
        });
      return route.fulfill({ json: transition(command) });
    }
    if (path === `/api/projects/${createdProject.id}/documents`) {
      reads.documents += 1;
      return route.fulfill({
        json: { mutable: lifecycle.mutable, documents: [] },
      });
    }
    if (
      path === `/api/tasks/${task.id}/complete` &&
      request.method() === 'POST'
    ) {
      task = {
        ...task,
        status: 'done',
        version: 2,
        completion: {
          actor: task.createdBy,
          occurredAt: '2026-09-26T10:05:00.000Z',
        },
        updatedAt: '2026-09-26T10:05:00.000Z',
      };
      return route.fulfill({ status: 201, json: task });
    }
    if (path === `/api/tasks/${task.id}`)
      return route.fulfill({
        json: { mutable: lifecycle.mutable, task },
      });
    if (path === `/api/tasks/${task.id}/history`)
      return route.fulfill({ json: { events: [] } });
    if (path === '/api/documents') return route.fulfill({ json: [] });
    return route.fulfill({ status: 404 });
  });

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?frame=prisme#projects');
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(
    page.getByLabel('Active Company', { exact: true }),
    company.id,
  );
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Close navigation' }).click();
  await page.goto('/?frame=prisme#projects');

  await expect(page.getByLabel('Project title')).toBeVisible();
  const projectList = page.getByRole('list', { name: 'Projects' });
  await expect(
    projectList
      .getByRole('listitem')
      .filter({ hasText: existingProject.title })
      .getByText('Preparatory', { exact: true }),
  ).toBeVisible();
  await page.getByLabel('Project title').fill(createdProject.title);
  await expectSelectAppearance(page.getByLabel('Client', { exact: true }));
  await selectOption(page.getByLabel('Client', { exact: true }), client.id);
  // The preparation notice stays beside the registration form.
  await expect(
    page
      .locator('form')
      .getByText(
        'Preparation only. This record does not authorize work to start.',
      ),
  ).toBeVisible();
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
  const article = page.getByRole('article', { name: createdProject.title });
  await expect(
    article.getByText(`Client: ${client.displayName}`),
  ).toBeVisible();
  await expect(
    article.getByText(
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
  await expectSelectAppearance(
    tasksPanel.getByRole('combobox', { name: 'Priority', exact: true }),
  );
  const readsAfterOpen = { ...reads };

  await documentsTab.click();
  await expect(documentsTab).toBeFocused();
  await expect(documentsPanel).toBeVisible();
  await expect(tasksPanel).toBeHidden();
  await expect(
    documentsPanel.getByText('No working Documents attached.'),
  ).toBeVisible();
  await tasksTab.click();
  await expectValue(tasksPanel.getByLabel('Task title'), taskDraft);

  // Activate with a start exception, then hold and resume (issue #406).
  const lifecycleSection = article.getByRole('region', { name: 'Lifecycle' });
  await expect(
    lifecycleSection.getByText('Preparatory', { exact: true }),
  ).toBeVisible();
  await lifecycleSection
    .getByRole('button', { name: 'Activate Project' })
    .click();
  const declaration = lifecycleSection.getByRole('form', {
    name: 'Start declaration',
  });
  for (const item of [
    'Approved Offer',
    'Contract or precontract',
    'Financial conditions',
  ])
    await declaration
      .getByRole('group', { name: item })
      .getByRole('radio', { name: 'Missing' })
      .check();
  for (const item of [
    'Project plan',
    'Initial documents',
    'Deadlines',
    'Relevant risks',
  ])
    await declaration
      .getByRole('group', { name: item })
      .getByRole('radio', { name: 'Present' })
      .press('Space');
  await declaration.getByLabel('Start exception reason').fill(exceptionReason);
  await expectValue(
    declaration.getByLabel('To be completed by'),
    ana.workspaceMembershipId,
  );
  await declaration.getByLabel('Completion deadline').fill('2026-10-15');
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('prisme-projects-activation-form.png'),
    fullPage: true,
  });
  await declaration.getByRole('button', { name: 'Activate' }).focus();
  await page.keyboard.press('Enter');

  await expect(
    lifecycleSection.getByText('Start declaration — declared, not verified'),
  ).toBeVisible();
  await expect(lifecycleSection).toContainText(
    `To be completed by ${ana.displayLabel} by 2026-10-15`,
  );
  await expect(article.getByText('Active', { exact: true })).toHaveCount(2);
  await expect(
    projectList
      .getByRole('listitem')
      .filter({ hasText: createdProject.title })
      .getByText('Active', { exact: true }),
  ).toBeVisible();
  await expect(
    article.getByText(
      'Preparation only. This record does not authorize work to start.',
    ),
  ).toHaveCount(0);

  await lifecycleSection.getByRole('button', { name: 'Put on hold' }).click();
  await lifecycleSection.getByLabel('Hold reason').fill(holdReason);
  await lifecycleSection
    .getByRole('button', { name: 'Put Project on hold' })
    .click();
  await expect(lifecycleSection).toContainText(`Hold reason${holdReason}`);
  await expect(article.getByText('On hold', { exact: true })).toHaveCount(2);
  await lifecycleSection
    .getByRole('button', { name: 'Resume Project' })
    .click();
  await lifecycleSection
    .getByRole('button', { name: 'Confirm resumption' })
    .click();
  await expect(
    lifecycleSection.getByRole('button', { name: 'Put on hold' }),
  ).toBeVisible();
  const history = lifecycleSection.getByRole('list');
  await expect(history.getByRole('listitem')).toHaveCount(3);
  await expect(history.getByRole('listitem').first()).toContainText('Resumed');
  expect(transitions).toEqual([
    {
      action: 'activate',
      expectedLifecycleRevision: 0,
      declaration: {
        approvedOffer: 'missing',
        contractOrPrecontract: 'missing',
        projectPlan: 'present',
        initialDocuments: 'present',
        deadlines: 'present',
        financialConditions: 'missing',
        risks: 'present',
      },
      startException: {
        reason: exceptionReason,
        completionMembershipId: ana.workspaceMembershipId,
        completionDueDate: '2026-10-15',
      },
    },
    { action: 'hold', expectedLifecycleRevision: 1, reason: holdReason },
    { action: 'resume', expectedLifecycleRevision: 2 },
  ]);
  // No transition re-read or rebased the open Task draft.
  await expect(tasksPanel.getByLabel('Task title')).toHaveValue(taskDraft);
  await expectNoHorizontalOverflow(page);
  await lifecycleSection.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('prisme-projects-lifecycle.png'),
    fullPage: true,
  });

  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await enterClassicCompatibility(page);
  await expectValue(page.getByLabel('Task title'), taskDraft);
  await expect(
    page
      .locator('#project-documents-panel')
      .getByRole('region', { name: 'Working Documents', exact: true }),
  ).toBeVisible();
  const classicLifecycle = page.getByRole('region', { name: 'Lifecycle' });
  await expect(
    classicLifecycle.getByText('Start declaration — declared, not verified'),
  ).toBeVisible();
  await expect(classicLifecycle.getByRole('listitem')).toHaveCount(3);
  await expect(
    classicLifecycle.getByRole('button', { name: 'Put on hold' }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('prisme-projects-lifecycle-classic.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Try Prisme' }).click();
  await expectValue(tasksPanel.getByLabel('Task title'), taskDraft);
  expect(reads).toEqual(readsAfterOpen);

  // Complete the Project only after its open Task is done (issue #407).
  await tasksPanel.getByRole('button', { name: 'Create Task' }).click();
  await expect(
    tasksPanel.getByRole('heading', { name: taskDraft, exact: true }),
  ).toBeVisible();
  await lifecycleSection
    .getByRole('button', { name: 'Complete Project' })
    .click();
  await lifecycleSection.getByLabel('Completion note').fill(completionNote);
  await lifecycleSection
    .getByRole('button', { name: 'Complete Project' })
    .click();
  await expect(
    lifecycleSection.getByText(
      'Complete or cancel every open Task of this Project first.',
    ),
  ).toBeVisible();
  await lifecycleSection.getByRole('button', { name: 'Show Tasks' }).click();
  await expect(tasksTab).toHaveAttribute('aria-selected', 'true');
  await expectValue(
    lifecycleSection.getByLabel('Completion note'),
    completionNote,
  );
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('prisme-projects-completion-blocked.png'),
    fullPage: true,
  });

  await tasksPanel.getByRole('button', { name: 'Mark done' }).click();
  await expect(tasksPanel.locator('.task-panel > .task-status')).toHaveText(
    'Done',
  );
  await lifecycleSection
    .getByRole('button', { name: 'Complete Project' })
    .click();
  await expect(
    article.getByText(
      'This Project is completed. Its Tasks, Documents and responsible member are read-only; its history remains available.',
    ),
  ).toBeVisible();
  await expect(lifecycleSection).toContainText(`Note${completionNote}`);
  await expect(tasksPanel.getByLabel('Task title')).toHaveCount(0);
  await expect(
    documentsPanel.getByRole('button', { name: 'Attach working Document' }),
  ).toHaveCount(0);
  await expect(
    article.getByRole('button', { name: 'Change', exact: true }),
  ).toHaveCount(0);
  await expect(
    projectList.getByRole('listitem').filter({ hasText: createdProject.title }),
  ).toHaveCount(0);
  await page.getByLabel('Include closed Projects').check();
  await expect(
    projectList
      .getByRole('listitem')
      .filter({ hasText: createdProject.title })
      .getByText('Completed', { exact: true }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('prisme-projects-completed.png'),
    fullPage: true,
  });

  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await enterClassicCompatibility(page);
  await expect(
    page.getByText(
      'This Project is completed. Its Tasks, Documents and responsible member are read-only; its history remains available.',
    ),
  ).toBeVisible();
  await expect(page.getByRole('region', { name: 'Lifecycle' })).toContainText(
    `Note${completionNote}`,
  );
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('prisme-projects-completed-classic.png'),
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Try Prisme' }).click();
  expect(transitions.at(-1)).toEqual({
    action: 'complete',
    expectedLifecycleRevision: 3,
    note: completionNote,
  });

  const rawIds = [
    company.id,
    client.id,
    existingProject.id,
    createdProject.id,
    ana.workspaceMembershipId,
  ];
  for (const id of rawIds)
    await expect(page.getByText(id, { exact: true })).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath('prisme-projects-detail.png'),
    fullPage: true,
  });
});
