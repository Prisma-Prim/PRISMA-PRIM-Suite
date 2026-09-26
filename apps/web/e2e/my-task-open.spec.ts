import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  actorContextFixture,
  preparatoryLifecycle,
  unassignedResponsibility,
} from './actor-context.fixture';
import type { TaskEvent, TaskView } from '../src/project/task-response';

const company = { id: 'company-my-task-open', displayName: 'PRISMA-PRIM' };
const atelier = {
  id: 'client-atelier',
  displayName: 'Atelier Demo SRL',
  relatedToActiveCompany: true,
};
const beta = {
  id: 'client-beta',
  displayName: 'Beta Demo SRL',
  relatedToActiveCompany: true,
};
// Its Client was superseded, so it is no longer offered for registration.
const gamma = { id: 'client-gamma', displayName: 'Gamma Demo SRL' };
const sharedTitle = 'Pregătire demo';
function projectFor(client: { id: string; displayName: string }, id: string) {
  return {
    id,
    companyId: company.id,
    clientAccountId: client.id,
    clientDisplayName: client.displayName,
    title: sharedTitle,
    status: 'preparatory',
    createdAt: '2026-09-19T08:00:00.000Z',
  };
}
const atelierProject = projectFor(atelier, 'project-atelier');
const betaProject = projectFor(beta, 'project-beta');
const archivedProject = {
  ...projectFor(gamma, 'project-gamma'),
  title: 'Arhivă demo',
};
const projects = [atelierProject, betaProject, archivedProject];
const actor = {
  internalUserId: actorContextFixture.internalUserId,
  workspaceMembershipId: actorContextFixture.workspaceMembershipId,
  displayName: actorContextFixture.displayName,
};
const me = {
  workspaceMembershipId: actorContextFixture.workspaceMembershipId,
  displayLabel: actorContextFixture.displayName,
};
const taskTitle = 'Chestionar inițial';
function taskFor(owner: typeof atelierProject, id: string, dueDate: string) {
  return {
    id,
    companyId: company.id,
    projectId: owner.id,
    clientAccountId: owner.clientAccountId,
    title: taskTitle,
    assignee: me,
    dueDate,
    priority: 'normal',
    status: 'todo',
    completion: null,
    version: 1,
    createdAt: '2026-09-19T09:00:00.000Z',
    updatedAt: '2026-09-19T09:00:00.000Z',
    createdBy: actor,
  } satisfies TaskView;
}
const atelierTask = taskFor(atelierProject, 'task-atelier', '2026-09-30');
const betaTask = taskFor(betaProject, 'task-beta', '2026-10-05');
const archivedTask = taskFor(archivedProject, 'task-gamma', '2026-10-12');
const tasks = [atelierTask, betaTask, archivedTask];
const readOnlyNotice =
  'Read-only: the original Client has been superseded. Task history remains available.';

function created(task: TaskView): TaskEvent {
  return {
    id: `${task.id}-created`,
    action: 'task.created',
    occurredAt: task.createdAt,
    actor,
    target: {
      type: 'task',
      taskId: task.id,
      taskTitle: task.title,
      companyId: company.id,
    },
    metadata: {
      version: 1,
      initial: {
        title: task.title,
        assignee: task.assignee,
        dueDate: task.dueDate,
      },
    },
  };
}

/**
 * One Company with two same-titled Projects and a Project under a superseded
 * original Client, each holding one same-titled Task assigned to the reader.
 * Every read and command is recorded.
 */
async function installServer(page: Page) {
  const state = {
    assignedReads: 0,
    projectReads: [] as string[],
    taskReads: [] as string[],
    commands: [] as string[],
  };
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') {
      state.commands.push(`${request.method()} ${path}`);
      return route.fulfill({ status: 409 });
    }
    if (path === '/api/access/current-actor')
      return route.fulfill({
        json: {
          ...actorContextFixture,
          workspacePermissions: ['client.manage'],
          ...(request.headers()['x-company-context-id']
            ? {
                activeCompany: {
                  ...company,
                  projectPermissions: ['project.read'],
                  taskPermissions: ['task.read', 'task.manage'],
                  taskPermissionAssignmentId: 'task-grant',
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
      return route.fulfill({ json: [atelier, beta] });
    if (path === '/api/documents') return route.fulfill({ json: [] });
    if (path.endsWith('/documents'))
      return route.fulfill({ json: { mutable: true, documents: [] } });
    if (path === '/api/assigned-tasks') {
      state.assignedReads += 1;
      return route.fulfill({
        json: {
          tasks: tasks.map((task) => {
            const owner = projects.find(
              (candidate) => candidate.id === task.projectId,
            );
            if (!owner) throw new Error('Invalid Task fixture');
            return {
              ...task,
              project: {
                id: owner.id,
                title: owner.title,
                clientDisplayName: owner.clientDisplayName,
              },
            };
          }),
        },
      });
    }
    if (path === '/api/projects') return route.fulfill({ json: projects });
    for (const owner of projects) {
      const mutable = owner !== archivedProject;
      const ownerPath = `/api/projects/${owner.id}`;
      if (path === ownerPath) {
        state.projectReads.push(owner.id);
        return route.fulfill({ json: owner });
      }
      if (path === `${ownerPath}/tasks`)
        return route.fulfill({
          json: {
            mutable,
            tasks: tasks.filter((task) => task.projectId === owner.id),
          },
        });
      if (path === `${ownerPath}/eligible-task-assignees`)
        return route.fulfill({ json: { members: [me] } });
      if (path === `${ownerPath}/responsible`)
        return route.fulfill({
          json: { ...unassignedResponsibility, mutable },
        });
      if (path === `${ownerPath}/lifecycle`)
        return route.fulfill({
          json: { ...preparatoryLifecycle, mutable },
        });
    }
    for (const task of tasks) {
      const mutable = task !== archivedTask;
      const taskPath = `/api/tasks/${task.id}`;
      if (path === taskPath) {
        state.taskReads.push(task.id);
        return route.fulfill({ json: { mutable, task } });
      }
      if (path === `${taskPath}/history`)
        return route.fulfill({ json: { events: [created(task)] } });
    }
    return route.fulfill({ status: 404 });
  });
  return state;
}

async function navigate(page: Page, testInfo: TestInfo, section: string) {
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Primary navigation' })
    .getByRole('link', { name: section, exact: true })
    .click();
}

async function capture(page: Page, testInfo: TestInfo, filename: string) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath(filename),
    fullPage: true,
  });
}

function openName(project: { title: string; clientDisplayName: string }) {
  return `Open ${taskTitle} in ${project.title} (${project.clientDisplayName})`;
}

for (const frame of ['classic', 'prisme'] as const)
  test(`${frame} opens the exact assigned Task in its Project from My Tasks and keeps other drafts`, async ({
    page,
  }, testInfo) => {
    const server = await installServer(page);
    const narrowPrisme =
      frame === 'prisme' && testInfo.project.name === 'narrow';
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/?frame=${frame}#projects`);
    if (narrowPrisme)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await page
      .getByLabel('Active Company', { exact: true })
      .selectOption(company.id);
    if (narrowPrisme)
      await page.getByRole('button', { name: 'Close navigation' }).click();
    await page.goto(`/?frame=${frame}#projects`);

    const workspace = page.locator('.project-workspace');
    const projectTasks = workspace.getByRole('region', {
      name: 'Tasks',
      exact: true,
    });
    const myTasks = page.locator('.my-tasks');
    const projectRow = (client: { displayName: string }) =>
      workspace.getByRole('button', {
        name: `${sharedTitle} Client: ${client.displayName}`,
        exact: true,
      });

    // A draft in Atelier's Task, chosen by hand.
    const draft = 'Colectare chestionar semnat';
    await projectRow(atelier).click();
    await projectTasks
      .getByRole('button', { name: taskTitle, exact: true })
      .click();
    await expect(
      projectTasks.locator('dd').getByText(atelierTask.dueDate, {
        exact: true,
      }),
    ).toBeVisible();
    await projectTasks.getByLabel('Task title').fill(draft);

    if (frame === 'prisme') await navigate(page, testInfo, 'My Tasks');
    const rows = myTasks.getByRole('listitem');
    await expect(rows).toHaveCount(3);
    const openBeta = rows
      .filter({ has: page.locator(`time[datetime="${betaTask.dueDate}"]`) })
      .getByRole('button', { name: openName(betaProject), exact: true });
    await expect(openBeta).toHaveText('Open');
    await capture(page, testInfo, `my-task-open-${frame}-rows.png`);
    // Only Refresh re-reads My Tasks; opening its rows never does.
    const listReads = server.assignedReads;

    // Keyboard activation moves focus to the Projects section.
    await openBeta.focus();
    await page.keyboard.press('Enter');
    await expect(workspace).toBeFocused();
    await expect(page).toHaveURL(/#projects$/u);
    const opened = workspace.getByRole('article', { name: sharedTitle });
    await expect(opened.getByText(`Client: ${beta.displayName}`)).toBeVisible();
    await expect(
      projectTasks.getByRole('heading', { name: taskTitle, exact: true }),
    ).toBeVisible();
    await expect(
      projectTasks.locator('dd').getByText(betaTask.dueDate, { exact: true }),
    ).toBeVisible();
    await expect(projectTasks.getByLabel('Task title')).toHaveValue(taskTitle);
    await expect(
      projectTasks.getByRole('region', { name: 'Task history' }),
    ).toBeVisible();
    if (frame === 'prisme')
      await expect(
        workspace.getByRole('tab', { name: 'Tasks', exact: true }),
      ).toHaveAttribute('aria-selected', 'true');
    await expect(workspace).toBeFocused();
    expect(server.projectReads).toEqual([atelierProject.id, betaProject.id]);
    expect(server.taskReads).toEqual([atelierTask.id, betaTask.id]);
    for (const id of [betaProject.id, betaTask.id]) {
      expect(page.url()).not.toContain(id);
      expect(
        JSON.stringify(await page.evaluate(() => history.state)),
      ).not.toContain(id);
      await expect(page.locator('body')).not.toContainText(id);
    }
    await capture(page, testInfo, `my-task-open-${frame}-opened.png`);

    // A Task under a superseded original Client opens read-only.
    if (frame === 'prisme') await navigate(page, testInfo, 'My Tasks');
    await myTasks
      .getByRole('button', { name: openName(archivedProject), exact: true })
      .click();
    await expect(workspace).toBeFocused();
    await expect(
      workspace
        .getByRole('article', { name: archivedProject.title })
        .getByText(`Client: ${gamma.displayName}`),
    ).toBeVisible();
    await expect(projectTasks.getByText(readOnlyNotice)).toBeVisible();
    await expect(
      projectTasks.locator('dd').getByText(archivedTask.dueDate, {
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      projectTasks.getByRole('region', { name: 'Task history' }),
    ).toBeVisible();
    await expect(projectTasks.getByLabel('Task title')).toHaveCount(0);
    await expect(
      projectTasks.getByRole('button', { name: /Save Task|Mark done/u }),
    ).toHaveCount(0);
    await capture(page, testInfo, `my-task-open-${frame}-read-only.png`);

    // Returning to Atelier's Project by hand finds its Task draft intact.
    await projectRow(atelier).click();
    await expect(projectTasks.getByLabel('Task title')).toHaveValue(draft);
    expect(server.taskReads).toEqual([
      atelierTask.id,
      betaTask.id,
      archivedTask.id,
    ]);
    expect(server.assignedReads).toBe(listReads);
    expect(server.commands).toEqual([]);
  });
