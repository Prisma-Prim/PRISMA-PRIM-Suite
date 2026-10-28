import { expect, test, type Page } from '@playwright/test';
import {
  actorContextFixture,
  operationalHomeFixture,
  preparatoryLifecycle,
  unassignedResponsibility,
} from './actor-context.fixture';
import { selectOption } from './select-option';
import type { AssignedTask, TaskEvent } from '../src/project/task-response';

const locales = [
  {
    code: 'ro',
    name: 'Română',
    title: 'Sarcinile mele',
    list: 'Sarcinile deschise atribuite dvs.',
    error: 'Sarcinile dvs. deschise nu au putut fi încărcate.',
    retry: 'Reîncercați',
    refresh: 'Actualizați Sarcinile mele',
    date: '30 sept. 2026',
    noDate: 'Fără termen',
    todo: 'De făcut',
    progress: 'În desfășurare',
    blocked: 'Blocată',
    critical: 'Critică',
    important: 'Importantă',
    normal: 'Normală',
    open: 'Deschideți',
    inProject: 'în',
  },
  {
    code: 'ru',
    name: 'Русский',
    title: 'Мои задачи',
    list: 'Открытые Задачи, назначенные вам',
    error: 'Не удалось загрузить ваши открытые Задачи.',
    retry: 'Повторить',
    refresh: 'Обновить Мои Задачи',
    date: '30 сент. 2026 г.',
    noDate: 'Без срока',
    todo: 'К выполнению',
    progress: 'В работе',
    blocked: 'Заблокирована',
    critical: 'Критический',
    important: 'Важный',
    normal: 'Обычный',
    open: 'Открыть',
    inProject: 'в',
  },
  {
    code: 'fr',
    name: 'Français',
    title: 'Mes Tâches',
    list: 'Tâches ouvertes qui vous sont attribuées',
    error: 'Vos Tâches ouvertes n’ont pas pu être chargées.',
    retry: 'Réessayer',
    refresh: 'Actualiser Mes Tâches',
    date: '30 sept. 2026',
    noDate: 'Sans échéance',
    todo: 'À faire',
    progress: 'En cours',
    blocked: 'Bloquée',
    critical: 'Critique',
    important: 'Importante',
    normal: 'Normale',
    open: 'Ouvrir',
    inProject: 'dans',
  },
  {
    code: 'en',
    name: 'English',
    title: 'My Tasks',
    list: 'Open Tasks assigned to you',
    error: 'Your open Tasks could not be loaded.',
    retry: 'Retry',
    refresh: 'Refresh My Tasks',
    date: 'Sep 30, 2026',
    noDate: 'No due date',
    todo: 'To do',
    progress: 'In progress',
    blocked: 'Blocked',
    critical: 'Critical',
    important: 'Important',
    normal: 'Normal',
    open: 'Open',
    inProject: 'in',
  },
] as const;
const company = {
  id: 'company-my-tasks-localization',
  displayName: 'Demo Company',
};
const client = {
  id: 'client-tasks',
  displayName: 'Client {project} — Клиент',
  relatedToActiveCompany: true,
};
const project = {
  id: 'project-tasks',
  companyId: company.id,
  clientAccountId: client.id,
  clientDisplayName: client.displayName,
  title: 'Pregătire {task} — Проект',
  status: 'preparatory',
  createdAt: '2026-09-19T08:00:00.000Z',
};
const actor = {
  internalUserId: actorContextFixture.internalUserId,
  workspaceMembershipId: actorContextFixture.workspaceMembershipId,
  displayName: actorContextFixture.displayName,
};
const first: AssignedTask = {
  description: null,
  id: 'task-exact',
  companyId: company.id,
  projectId: project.id,
  clientAccountId: client.id,
  title: 'Chestionar {inițial} — Проверка',
  assignee: {
    workspaceMembershipId: actor.workspaceMembershipId,
    displayLabel: actor.displayName,
  },
  dueDate: '2026-09-30',
  priority: 'critical',
  status: 'todo',
  completion: null,
  version: 1,
  createdAt: '2026-09-19T09:00:00.000Z',
  updatedAt: '2026-09-19T09:00:00.000Z',
  createdBy: actor,
  project: {
    id: project.id,
    title: project.title,
    clientDisplayName: client.displayName,
  },
};
const second: AssignedTask = {
  ...first,
  id: 'task-progress',
  title: 'Plan {client} — План',
  dueDate: '2026-10-05',
  priority: 'normal',
  status: 'in_progress',
  version: 2,
};
const last: AssignedTask = {
  ...first,
  id: 'task-blocked',
  title: 'Fără termen {task} — Проверить',
  dueDate: null,
  priority: 'important',
  status: 'blocked',
  version: 2,
  blockage: {
    reason: 'Lipsă {sursă}',
    actor,
    occurredAt: '2026-09-20T09:00:00.000Z',
  },
};
const tasks = [first, second, last];
const creation: TaskEvent = {
  id: 'task-created',
  action: 'task.created',
  occurredAt: first.createdAt,
  actor,
  target: {
    type: 'task',
    taskId: first.id,
    taskTitle: first.title,
    companyId: company.id,
  },
  metadata: {
    version: 1,
    initial: {
      title: first.title,
      assignee: first.assignee,
      dueDate: first.dueDate,
      priority: first.priority,
    },
  },
};
async function installRoutes(page: Page) {
  const state: {
    assignedReads: Array<string | undefined>;
    projectReads: string[];
    taskReads: string[];
    writes: string[];
  } = { assignedReads: [], projectReads: [], taskReads: [], writes: [] };
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') {
      state.writes.push(`${request.method()} ${path}`);
      return route.fulfill({ status: 409 });
    }
    if (path === '/api/access/current-actor')
      return route.fulfill({
        json: {
          ...actorContextFixture,
          ...(request.headers()['x-company-context-id'] === company.id
            ? {
                activeCompany: {
                  ...company,
                  clientPermissions: ['client.read'],
                  projectPermissions: ['project.read'],
                  taskPermissions: ['task.read'],
                  taskPermissionSetVersion: 'v1',
                  taskPermissionAssignmentId: 'task-read-grant',
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
          active_clients: 1,
          open_projects: 1,
          overdue_tasks: 0,
        }),
      });
    if (path === '/api/clients') return route.fulfill({ json: [client] });
    if (path === '/api/assigned-tasks') {
      state.assignedReads.push(request.headers()['x-company-context-id']);
      return state.assignedReads.length === 1
        ? route.fulfill({ status: 503 })
        : route.fulfill({ json: { tasks } });
    }
    if (path === '/api/projects') return route.fulfill({ json: [project] });
    if (path === `/api/projects/${project.id}`) {
      state.projectReads.push(project.id);
      return route.fulfill({ json: project });
    }
    if (path === `/api/projects/${project.id}/tasks`)
      return route.fulfill({ json: { mutable: true, tasks } });
    if (path === `/api/projects/${project.id}/responsible`)
      return route.fulfill({ json: unassignedResponsibility });
    if (path === `/api/projects/${project.id}/lifecycle`)
      return route.fulfill({ json: preparatoryLifecycle });
    if (path === `/api/tasks/${first.id}`) {
      state.taskReads.push(first.id);
      return route.fulfill({ json: { mutable: true, task: first } });
    }
    if (path === `/api/tasks/${first.id}/history`)
      return route.fulfill({ json: { events: [creation] } });
    return route.fulfill({ status: 404 });
  });
  return state;
}

// A western timezone must not shift an exact calendar due date to the prior day.
test.use({ timezoneId: 'Pacific/Honolulu' });
for (const locale of locales) {
  test(`reads, recovers and opens exact My Tasks in ${locale.code}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(90_000);
    const server = await installRoutes(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    if (testInfo.project.name === 'narrow')
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await selectOption(page.getByLabel('Active Company', { exact: true }), {
      label: company.displayName,
    });
    await page
      .getByRole('navigation', { name: 'Primary navigation' })
      .getByRole('link', { name: 'My Tasks', exact: true })
      .click();
    const workspace = page.locator('.my-tasks');
    await expect(workspace.getByRole('alert')).toHaveText(locales[3].error);
    const picker = page
      .locator('.interface-locale-control')
      .getByRole('combobox');
    await selectOption(picker, { label: locale.name });
    await expect(workspace.getByRole('alert')).toHaveText(locale.error);
    expect(server.assignedReads).toEqual([company.id]);
    await workspace
      .getByRole('button', { name: locale.retry, exact: true })
      .click();
    const list = workspace.getByRole('list', { name: locale.list });
    await expect(
      workspace.getByRole('button', { name: locale.refresh, exact: true }),
    ).toBeVisible();
    await expect(list.getByRole('listitem')).toHaveCount(3);
    await expect(list.getByRole('heading')).toHaveText(
      tasks.map((task) => task.title),
    );
    await expect(list.locator('time').first()).toHaveText(locale.date);
    await expect(list.locator('time').first()).toHaveAttribute(
      'datetime',
      '2026-09-30',
    );
    const rows = list.getByRole('listitem');
    await expect(
      rows.nth(0).getByText(locale.todo, { exact: true }),
    ).toBeVisible();
    await expect(
      rows.nth(0).getByText(locale.critical, { exact: true }),
    ).toBeVisible();
    await expect(
      rows.nth(1).getByText(locale.progress, { exact: true }),
    ).toBeVisible();
    await expect(
      rows.nth(1).getByText(locale.normal, { exact: true }),
    ).toBeVisible();
    await expect(
      rows.nth(2).getByText(locale.blocked, { exact: true }),
    ).toBeVisible();
    await expect(
      rows.nth(2).getByText(locale.important, { exact: true }),
    ).toBeVisible();
    await expect(
      rows.nth(2).getByText(locale.noDate, { exact: true }),
    ).toBeVisible();
    await expect(rows.nth(2).locator('time')).toHaveCount(0);
    const alternate = locale.code === 'en' ? locales[0] : locales[3];
    await selectOption(picker, { label: alternate.name });
    await expect(
      workspace
        .getByRole('list', { name: alternate.list })
        .getByRole('heading'),
    ).toHaveText(tasks.map((task) => task.title));
    await selectOption(picker, { label: locale.name });
    expect(server.assignedReads).toEqual([company.id, company.id]);
    expect(server.writes).toEqual([]);
    await expect(
      workspace.getByRole('heading', { name: locale.title, exact: true }),
    ).toBeVisible();
    await expect(
      rows.nth(0).getByText(project.title, { exact: true }),
    ).toBeVisible();
    await expect(
      rows.nth(0).getByText(client.displayName, { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`my-tasks-${locale.code}-list.png`),
      fullPage: true,
    });
    const openName = `${locale.open} ${first.title} ${locale.inProject} ${project.title} (${client.displayName})`;
    const open = rows
      .nth(0)
      .getByRole('button', { name: openName, exact: true });
    await expect(open).toHaveText(locale.open);
    await open.focus();
    await page.keyboard.press('Enter');
    const projects = page.locator('.project-workspace');
    await expect(projects).toBeFocused();
    await expect(page).toHaveURL(/#projects$/u);
    await expect(
      projects.getByRole('article', { name: project.title }),
    ).toBeVisible();
    await expect(
      projects.getByRole('heading', { name: first.title, exact: true }),
    ).toBeVisible();
    expect(server.projectReads).toEqual([project.id]);
    expect(server.taskReads).toEqual([first.id]);
    expect(server.assignedReads).toEqual([company.id, company.id]);
    expect(server.writes).toEqual([]);
    await page.goto('/#my-tasks');
    await page.reload();
    await expect(
      page
        .locator('.my-tasks')
        .getByRole('list', { name: locale.list })
        .getByRole('heading'),
    ).toHaveText(tasks.map((task) => task.title));
    expect(server.assignedReads).toEqual([company.id, company.id, company.id]);
    await expect(picker).toHaveAttribute('title', locale.name);
    await expect(page.locator('html')).toHaveAttribute('lang', locale.code);
    expect(server.writes).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`my-tasks-${locale.code}-reloaded.png`),
      fullPage: true,
    });
  });
}
