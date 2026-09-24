import { expect, test } from '@playwright/test';
import {
  actorContextFixture,
  unassignedResponsibility,
} from './actor-context.fixture';
import type { TaskEvent, TaskView } from '../src/project/task-response';

test('manages manual Tasks through the production shell with retained retry and attributable read-only history', async ({
  page,
}, testInfo) => {
  const company = { id: 'task-company', displayName: 'PRISMA-PRIM' };
  const client = {
    id: 'task-client',
    displayName: 'Synthetic Client',
    relatedToActiveCompany: true,
  };
  const project = {
    id: 'task-project',
    companyId: company.id,
    clientAccountId: client.id,
    clientDisplayName: client.displayName,
    title: 'ISO preparation',
    status: 'preparatory',
    createdAt: '2026-09-19T00:00:00.000Z',
  };
  const actor = {
    internalUserId: actorContextFixture.internalUserId,
    workspaceMembershipId: actorContextFixture.workspaceMembershipId,
    displayName: actorContextFixture.displayName,
  };
  const member = {
    workspaceMembershipId: 'eligible-responsible-member',
    displayLabel: 'Mira Popescu',
  };
  let task: TaskView | null = null;
  let superseded = false;
  let denied = false;
  let conflict = false;
  let completionUncertain = true;
  const events: TaskEvent[] = [];
  const receipts = new Map<string, TaskView>();
  const completionKeys: string[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/access/current-actor')
      return route.fulfill({
        json: {
          ...actorContextFixture,
          workspacePermissions: ['company.manage', 'client.manage'],
          ...(request.headers()['x-company-context-id']
            ? {
                activeCompany: {
                  ...company,
                  projectPermissions: ['project.read'],
                  taskPermissions: ['task.read', 'task.manage'],
                  taskPermissionAssignmentId: 'task-manager-grant',
                  taskPermissionSetVersion: 'v1',
                },
              }
            : {}),
        },
      });
    if (path === '/api/companies') return route.fulfill({ json: [company] });
    if (path === '/api/clients') return route.fulfill({ json: [client] });
    if (path === '/api/activity-log')
      return route.fulfill({ json: { events: denied ? [] : events } });
    if (path === '/api/projects') return route.fulfill({ json: [project] });
    if (path === `/api/projects/${project.id}`)
      return route.fulfill({ json: project });
    if (path === `/api/projects/${project.id}/responsible`)
      return route.fulfill({ json: unassignedResponsibility });
    if (!path.includes('/tasks') && !path.endsWith('/eligible-task-assignees'))
      return route.fulfill({ status: 403 });
    expect(request.headers()['x-company-context-id']).toBe(company.id);
    if (denied) return route.fulfill({ status: 403 });
    if (request.method() === 'POST' || request.method() === 'PATCH') {
      const key = request.headers()['idempotency-key'];
      expect(key).toBeTruthy();
      if (!key) throw new Error('Missing request key');
      if (conflict && path.endsWith('/complete'))
        return route.fulfill({ status: 409 });
      if (path.endsWith('/complete')) completionKeys.push(key);
      const receipt = receipts.get(key);
      if (receipt) return route.fulfill({ json: receipt });
      const body: unknown = request.postDataJSON();
      if (!isRecord(body)) throw new Error('Invalid command fixture');
      if (!task) {
        expect(body).toEqual({
          title: 'Collect preparation notes',
          assigneeMembershipId: null,
          dueDate: null,
        });
        task = {
          id: 'manual-task',
          companyId: company.id,
          projectId: project.id,
          clientAccountId: client.id,
          title: 'Collect preparation notes',
          assignee: null,
          dueDate: null,
          status: 'todo',
          completion: null,
          version: 1,
          createdAt: project.createdAt,
          updatedAt: project.createdAt,
          createdBy: actor,
        };
        events.push({
          id: 'created',
          action: 'task.created',
          occurredAt: project.createdAt,
          actor,
          target: {
            type: 'task',
            taskId: task.id,
            taskTitle: task.title,
            companyId: company.id,
          },
          metadata: {
            version: 1,
            initial: { title: task.title, assignee: null, dueDate: null },
          },
        });
      } else {
        expect(body.expectedVersion).toBe(task.version);
        const before = task;
        const version = task.version + 1;
        const common = {
          id: `event-${version}`,
          occurredAt: project.createdAt,
          actor,
          target: {
            type: 'task',
            taskId: task.id,
            taskTitle: task.title,
            companyId: company.id,
          } satisfies TaskEvent['target'],
        };
        if (request.method() === 'PATCH') {
          expect(
            typeof body.title === 'string' || body.title === undefined,
          ).toBe(true);
          task = {
            ...task,
            title: typeof body.title === 'string' ? body.title : task.title,
            assignee:
              body.assigneeMembershipId === member.workspaceMembershipId
                ? member
                : body.assigneeMembershipId === null
                  ? null
                  : task.assignee,
            dueDate:
              typeof body.dueDate === 'string'
                ? body.dueDate
                : body.dueDate === null
                  ? null
                  : task.dueDate,
            version,
          };
          events.push({
            ...common,
            action: 'task.updated',
            metadata: {
              version,
              changes: {
                ...(before.title !== task.title
                  ? { title: { before: before.title, after: task.title } }
                  : {}),
                ...(before.assignee !== task.assignee
                  ? {
                      assignee: {
                        before: before.assignee,
                        after: task.assignee,
                      },
                    }
                  : {}),
                ...(before.dueDate !== task.dueDate
                  ? { dueDate: { before: before.dueDate, after: task.dueDate } }
                  : {}),
              },
            },
          });
        } else if (path.endsWith('/complete')) {
          task = {
            ...task,
            status: 'done',
            completion: { actor, occurredAt: project.createdAt },
            version,
          };
          events.push({
            ...common,
            action: 'task.completed',
            metadata: { version, before: 'todo', after: 'done' },
          });
        } else {
          task = { ...task, status: 'todo', completion: null, version };
          events.push({
            ...common,
            action: 'task.reopened',
            metadata: { version, before: 'done', after: 'todo' },
          });
        }
      }
      receipts.set(key, task);
      if (path.endsWith('/complete') && completionUncertain) {
        completionUncertain = false;
        return route.fulfill({ status: 500 });
      }
      return route.fulfill({ json: task });
    }
    if (path.endsWith('/eligible-task-assignees'))
      return route.fulfill({ json: { members: [member] } });
    if (path === `/api/projects/${project.id}/tasks`)
      return route.fulfill({
        json: { mutable: !superseded, tasks: task ? [task] : [] },
      });
    if (path.endsWith('/history')) return route.fulfill({ json: { events } });
    return route.fulfill({ json: { mutable: !superseded, task } });
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
  await page
    .getByRole('button', {
      name: `${project.title} Client: ${project.clientDisplayName}`,
    })
    .click();
  const tasks = page.getByRole('region', { name: 'Tasks', exact: true });
  await expect(
    tasks.getByText('No manual Tasks for this Project yet.'),
  ).toBeVisible();
  await tasks.getByLabel('Task title').fill('Collect preparation notes');
  await tasks.getByRole('button', { name: 'Create Task', exact: true }).click();
  await expect(
    tasks.getByRole('heading', {
      name: 'Collect preparation notes',
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    tasks.locator('dd').getByText('Unassigned', { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole('button', {
      name: `${project.title} Client: ${project.clientDisplayName}`,
    })
    .click();
  await tasks
    .getByRole('button', { name: 'Collect preparation notes', exact: true })
    .click();
  await tasks
    .locator('form')
    .getByLabel('Responsible member')
    .selectOption(member.workspaceMembershipId);
  await tasks.getByLabel('Due date').fill('2026-10-15');
  await tasks.getByRole('button', { name: 'Save Task', exact: true }).click();
  await expect(
    tasks.locator('dd').getByText(member.displayLabel, { exact: true }),
  ).toBeVisible();
  await tasks.getByLabel('Task title').fill('Review preparation notes');
  await tasks.getByLabel('Due date').fill('2026-10-20');
  await tasks.getByRole('button', { name: 'Save Task', exact: true }).click();
  await expect(
    tasks.getByRole('heading', { name: 'Review preparation notes' }),
  ).toBeVisible();
  await tasks.getByRole('button', { name: 'Mark done' }).click();
  await expect(
    tasks.getByRole('button', { name: 'Retry pending Task change' }),
  ).toBeVisible();
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Projects', exact: true }).click();
  if (testInfo.project.name === 'narrow')
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Use classic frame' }).click();
  await page.getByRole('button', { name: 'Try Prisme' }).click();
  await tasks
    .getByRole('button', { name: 'Retry pending Task change' })
    .click();
  await expect(
    tasks.getByText(`Completion declared by ${actor.displayName}`, {
      exact: false,
    }),
  ).toBeVisible();
  expect(completionKeys).toHaveLength(2);
  expect(completionKeys[0]).toBe(completionKeys[1]);
  expect(
    events.filter((event) => event.action === 'task.completed'),
  ).toHaveLength(1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('tasks-done.png'),
    fullPage: true,
  });
  await tasks.getByRole('button', { name: 'Reopen Task' }).click();
  await expect(tasks.getByRole('button', { name: 'Mark done' })).toBeVisible();
  const history = tasks.getByRole('region', { name: 'Task history' });
  await expect(
    history.getByText('Task reopened', { exact: true }),
  ).toBeVisible();
  await expect(
    history.getByText('Completion declared', { exact: true }),
  ).toBeVisible();
  await expect(history.getByText('Before: 2026-10-15')).toBeVisible();
  await expect(page.getByText('Preparatory', { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      'Preparation only. This record does not authorize work to start.',
    ),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('tasks-history.png'),
    fullPage: true,
  });
  conflict = true;
  await tasks.getByRole('button', { name: 'Mark done' }).click();
  await expect(tasks.getByRole('status')).toHaveText(
    'This Task or its permissions changed. Reload the Task before making another change.',
  );
  await expect(tasks.getByRole('button', { name: 'Mark done' })).toBeDisabled();
  await tasks.getByRole('button', { name: 'Reload Task' }).click();
  await expect(tasks.getByRole('button', { name: 'Mark done' })).toBeEnabled();
  superseded = true;
  await tasks.getByRole('button', { name: 'Reload Task' }).click();
  await expect(
    tasks.getByText(
      'Read-only: the original Client has been superseded. Task history remains available.',
    ),
  ).toBeVisible();
  await expect(tasks.getByRole('button', { name: 'Mark done' })).toHaveCount(0);
  await expect(history).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('tasks-read-only.png'),
    fullPage: true,
  });
  denied = true;
  await tasks.getByRole('button', { name: 'Reload Task' }).click();
  await expect(tasks.getByRole('alert')).toHaveText(
    'Task, Project and Client read access are required for this Company.',
  );
  await expect(history).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('tasks-denied.png'),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
