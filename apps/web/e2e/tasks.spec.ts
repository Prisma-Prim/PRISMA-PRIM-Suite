import { enterClassicCompatibility } from './classic-compatibility';
import { expectValue, selectOption } from './select-option';
import { expect, test } from '@playwright/test';
import {
  actorContextFixture,
  preparatoryLifecycle,
  operationalHomeFixture,
  unassignedResponsibility,
} from './actor-context.fixture';
import {
  taskPriorities,
  type TaskEvent,
  type TaskPriority,
  type TaskView,
} from '../src/project/task-response';

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
    if (path === '/api/operational-home')
      return route.fulfill({
        json: operationalHomeFixture(company.id, {
          active_clients: 1,
          open_projects: 1,
          overdue_tasks: 0,
        }),
      });
    if (path === '/api/clients') return route.fulfill({ json: [client] });
    if (path === '/api/activity-log')
      return route.fulfill({ json: { events: denied ? [] : events } });
    if (path === '/api/projects') return route.fulfill({ json: [project] });
    if (path === `/api/projects/${project.id}`)
      return route.fulfill({ json: project });
    if (path === `/api/projects/${project.id}/responsible`)
      return route.fulfill({ json: unassignedResponsibility });
    if (path === `/api/projects/${project.id}/lifecycle`)
      return route.fulfill({ json: preparatoryLifecycle });
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
          priority: 'critical',
        });
        task = {
          id: 'manual-task',
          companyId: company.id,
          projectId: project.id,
          clientAccountId: client.id,
          title: 'Collect preparation notes',
          assignee: null,
          dueDate: null,
          priority: 'critical',
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
            initial: {
              title: task.title,
              assignee: null,
              dueDate: null,
              priority: task.priority,
            },
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
            priority:
              taskPriorities.find((priority) => priority === body.priority) ??
              task.priority,
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
                ...(before.priority !== task.priority
                  ? {
                      priority: {
                        before: before.priority,
                        after: task.priority,
                      },
                    }
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
  await selectOption(
    page.getByLabel('Active Company', { exact: true }),
    company.id,
  );
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
  const priority = tasks.locator('form').getByLabel('Priority');
  await expectValue(priority, 'normal');
  await selectOption(priority, { label: 'Critical' });
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
  await expect(
    tasks
      .getByRole('navigation', { name: 'Tasks' })
      .getByText('Priority: Critical', { exact: true }),
  ).toBeVisible();
  await tasks
    .getByRole('button', { name: 'Collect preparation notes', exact: true })
    .click();
  await expect(
    tasks.locator('dd').getByText('Critical', { exact: true }),
  ).toBeVisible();
  await selectOption(
    tasks.locator('form').getByLabel('Responsible member'),
    member.workspaceMembershipId,
  );
  await tasks.getByLabel('Due date').fill('2026-10-15');
  await selectOption(priority, { label: 'Important' });
  await tasks.getByRole('button', { name: 'Save Task', exact: true }).click();
  await expect(
    tasks.locator('dd').getByText(member.displayLabel, { exact: true }),
  ).toBeVisible();
  await expect(
    tasks.locator('dd').getByText('Important', { exact: true }),
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
  await enterClassicCompatibility(page);
  await page.getByRole('button', { name: 'Try Prisme' }).click();
  await tasks
    .getByRole('button', { name: 'Retry pending Task change' })
    .click();
  await expect(
    tasks.getByText(`Completion declared by ${actor.displayName}`, {
      exact: false,
    }),
  ).toBeVisible();
  // A done Task keeps its priority visible but offers no priority control.
  await expect(
    tasks.locator('dd').getByText('Important', { exact: true }),
  ).toBeVisible();
  await expect(priority).toHaveCount(0);
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
  await expect(history.getByText('Before: Oct 15, 2026')).toBeVisible();
  await expect(tasks.locator('.task-facts time')).toHaveAttribute(
    'datetime',
    '2026-10-20',
  );
  await expect(tasks.getByLabel('Due date')).toHaveValue('2026-10-20');
  await expect(history.getByText('Priority: Critical')).toBeVisible();
  await expect(history.getByText('Critical → Important')).toBeVisible();
  const detail = page.getByRole('article', { name: project.title });
  await expect(
    detail
      .getByRole('region', { name: 'Lifecycle' })
      .getByText('Preparatory', { exact: true }),
  ).toBeVisible();
  await expect(
    detail.getByText(
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
test('tracks Task execution with reasoned blockage and cancellation across reload, reopening and My Tasks', async ({
  page,
}, testInfo) => {
  const narrow = testInfo.project.name === 'narrow';
  const company = { id: 'execution-company', displayName: 'PRISMA-PRIM' };
  const client = {
    id: 'execution-client',
    displayName: 'Synthetic Client',
    relatedToActiveCompany: true,
  };
  const project = {
    id: 'execution-project',
    companyId: company.id,
    clientAccountId: client.id,
    clientDisplayName: client.displayName,
    title: 'ISO preparation',
    status: 'preparatory',
    createdAt: '2026-09-24T00:00:00.000Z',
  };
  const actor = {
    internalUserId: actorContextFixture.internalUserId,
    workspaceMembershipId: actorContextFixture.workspaceMembershipId,
    displayName: actorContextFixture.displayName,
  };
  const assignee = {
    workspaceMembershipId: actor.workspaceMembershipId,
    displayLabel: actor.displayName,
  };
  const blockageReason = "Waiting for the Client's signed questionnaire";
  const cancellationReason = 'Duplicate of A';
  const priority: TaskPriority = 'critical';
  const common = {
    id: 'execution-task',
    companyId: company.id,
    projectId: project.id,
    clientAccountId: client.id,
    title: 'Collect signed questionnaire',
    assignee,
    dueDate: '2026-10-15',
    priority,
    createdAt: project.createdAt,
    updatedAt: project.createdAt,
    createdBy: actor,
  };
  let task: TaskView = {
    ...common,
    status: 'todo',
    completion: null,
    version: 1,
  };
  const target = {
    type: 'task',
    taskId: common.id,
    taskTitle: common.title,
    companyId: company.id,
  } satisfies TaskEvent['target'];
  const events: TaskEvent[] = [
    {
      id: 'created',
      action: 'task.created',
      occurredAt: project.createdAt,
      actor,
      target,
      metadata: {
        version: 1,
        initial: {
          title: common.title,
          assignee,
          dueDate: common.dueDate,
          priority: common.priority,
        },
      },
    },
  ];
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
    if (path === '/api/operational-home')
      return route.fulfill({
        json: operationalHomeFixture(company.id, {
          active_clients: 1,
          open_projects: 1,
          overdue_tasks: 0,
        }),
      });
    if (path === '/api/clients') return route.fulfill({ json: [client] });
    if (path === '/api/activity-log')
      return route.fulfill({ json: { events: [...events].reverse() } });
    if (path === '/api/projects') return route.fulfill({ json: [project] });
    if (path === `/api/projects/${project.id}`)
      return route.fulfill({ json: project });
    if (path === `/api/projects/${project.id}/responsible`)
      return route.fulfill({ json: unassignedResponsibility });
    if (path === `/api/projects/${project.id}/lifecycle`)
      return route.fulfill({ json: preparatoryLifecycle });
    if (path === '/api/assigned-tasks')
      return route.fulfill({
        json: {
          tasks:
            task.status === 'done' || task.status === 'cancelled'
              ? []
              : [
                  {
                    ...task,
                    project: {
                      id: project.id,
                      title: project.title,
                      clientDisplayName: client.displayName,
                    },
                  },
                ],
        },
      });
    if (path === `/api/projects/${project.id}/eligible-task-assignees`)
      return route.fulfill({ json: { members: [assignee] } });
    if (path === `/api/projects/${project.id}/tasks`)
      return route.fulfill({ json: { mutable: true, tasks: [task] } });
    if (path === `/api/tasks/${common.id}/history`)
      return route.fulfill({ json: { events } });
    if (path === `/api/tasks/${common.id}` && request.method() === 'GET')
      return route.fulfill({ json: { mutable: true, task } });
    if (request.method() !== 'POST' || !path.startsWith('/api/tasks/'))
      return route.fulfill({ status: 403 });
    expect(request.headers()['x-company-context-id']).toBe(company.id);
    expect(request.headers()['idempotency-key']).toBeTruthy();
    const body: unknown = request.postDataJSON();
    if (!isRecord(body)) throw new Error('Invalid command fixture');
    expect(body.expectedVersion).toBe(task.version);
    const version = task.version + 1;
    const declared = { actor, occurredAt: '2026-09-24T10:00:00.000Z' };
    const before = task.status;
    const moved = { ...common, version, updatedAt: declared.occurredAt };
    const event = { id: `event-${version}`, ...declared, target };
    if (
      path.endsWith('/status') &&
      before !== 'done' &&
      before !== 'cancelled'
    ) {
      if (body.status === 'blocked' && typeof body.reason === 'string') {
        task = {
          ...moved,
          status: 'blocked',
          completion: null,
          blockage: { ...declared, reason: body.reason },
        };
        events.push({
          ...event,
          action: 'task.status.changed',
          metadata: { version, before, after: 'blocked', reason: body.reason },
        });
      } else if (body.status === 'todo' || body.status === 'in_progress') {
        expect(body).not.toHaveProperty('reason');
        task = { ...moved, status: body.status, completion: null };
        events.push({
          ...event,
          action: 'task.status.changed',
          metadata: { version, before, after: body.status, reason: null },
        });
      } else return route.fulfill({ status: 400 });
    } else if (
      path.endsWith('/cancel') &&
      before !== 'done' &&
      before !== 'cancelled' &&
      typeof body.reason === 'string'
    ) {
      task = {
        ...moved,
        status: 'cancelled',
        completion: null,
        cancellation: { ...declared, reason: body.reason },
      };
      events.push({
        ...event,
        action: 'task.cancelled',
        metadata: { version, before, after: 'cancelled', reason: body.reason },
      });
    } else if (
      path.endsWith('/complete') &&
      before !== 'done' &&
      before !== 'cancelled'
    ) {
      task = { ...moved, status: 'done', completion: declared };
      events.push({
        ...event,
        action: 'task.completed',
        metadata: { version, before, after: 'done' },
      });
    } else if (
      path.endsWith('/reopen') &&
      (before === 'done' || before === 'cancelled')
    ) {
      task = { ...moved, status: 'todo', completion: null };
      events.push({
        ...event,
        action: 'task.reopened',
        metadata: { version, before, after: 'todo' },
      });
    } else return route.fulfill({ status: 409 });
    return route.fulfill({ json: task });
  });
  const navigate = async (label: string) => {
    if (narrow)
      await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('link', { name: label, exact: true }).click();
  };
  const openTask = async () => {
    await page
      .getByRole('button', {
        name: `${project.title} Client: ${project.clientDisplayName}`,
      })
      .click();
    await tasks
      .getByRole('button', { name: common.title, exact: true })
      .click();
  };
  const tasks = page.getByRole('region', { name: 'Tasks', exact: true });
  const state = tasks.locator('.task-panel .task-status');
  const myTasks = page.getByRole('region', { name: 'My Tasks', exact: true });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?frame=prisme#projects');
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await selectOption(
    page.getByLabel('Active Company', { exact: true }),
    company.id,
  );
  if (narrow)
    await page.getByRole('button', { name: 'Close navigation' }).click();
  await page.goto('/?frame=prisme#projects');
  await openTask();
  await expect(state).toHaveText('To do');

  await tasks.getByRole('button', { name: 'Mark in progress' }).click();
  await expect(state).toHaveText('In progress');
  await tasks.getByRole('button', { name: 'Mark blocked' }).click();
  await tasks.getByRole('button', { name: 'Save blockage' }).click();
  await expect(
    tasks.getByText('Enter a reason of 1–500 characters.'),
  ).toBeVisible();
  await tasks.getByLabel('Blockage reason').fill(`  ${blockageReason}  `);
  await tasks.getByRole('button', { name: 'Save blockage' }).click();
  await expect(state).toHaveText('Blocked');

  await page.reload();
  await openTask();
  await expect(state).toHaveText('Blocked');
  await expect(
    tasks.locator('dd').getByText(blockageReason, { exact: true }),
  ).toBeVisible();
  await expect(
    tasks.getByText(`Blocked by ${actor.displayName}`, { exact: false }),
  ).toBeVisible();
  // A move changes no priority; the blocked Task keeps it editable.
  const priorityFact = tasks
    .locator('.task-panel dd')
    .getByText('Critical', { exact: true });
  await expect(priorityFact).toBeVisible();
  await expectValue(tasks.getByLabel('Priority'), 'critical');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('tasks-blocked.png'),
    fullPage: true,
  });

  await navigate('My Tasks');
  await myTasks.getByRole('button', { name: 'Refresh My Tasks' }).click();
  const assignedRow = myTasks.getByRole('listitem').filter({
    has: page.getByRole('heading', { name: common.title, exact: true }),
  });
  await expect(assignedRow.getByText('Blocked', { exact: true })).toBeVisible();
  await expect(
    assignedRow.getByText('Critical', { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('tasks-my-tasks-blocked.png'),
    fullPage: true,
  });

  await navigate('Projects');
  await tasks.getByRole('button', { name: 'Mark in progress' }).click();
  await expect(state).toHaveText('In progress');
  await tasks.getByRole('button', { name: 'Cancel Task' }).click();
  await tasks.getByLabel('Cancellation reason').fill(cancellationReason);
  await tasks.getByRole('button', { name: 'Save cancellation' }).click();
  await expect(state).toHaveText('Cancelled');
  await expect(
    tasks.locator('dd').getByText(cancellationReason, { exact: true }),
  ).toBeVisible();
  await expect(tasks.getByLabel('Task title')).toHaveCount(0);
  // A cancelled Task keeps its priority readable without a priority control.
  await expect(priorityFact).toBeVisible();
  await expect(tasks.getByLabel('Priority')).toHaveCount(0);

  await navigate('My Tasks');
  await myTasks.getByRole('button', { name: 'Refresh My Tasks' }).click();
  await expect(
    myTasks.getByText('No open Tasks assigned to you'),
  ).toBeVisible();
  await expect(
    myTasks.getByRole('heading', { name: common.title, exact: true }),
  ).toHaveCount(0);

  await navigate('Activity Log');
  const activity = page.getByRole('region', {
    name: 'Activity Log',
    exact: true,
  });
  await expect(
    activity.getByText(`${actor.displayName} cancelled a Task`, {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    activity
      .getByText(`${actor.displayName} changed a Task's status`, {
        exact: true,
      })
      .first(),
  ).toBeVisible();

  await navigate('Projects');
  await tasks.getByRole('button', { name: 'Reopen Task' }).click();
  await expect(state).toHaveText('To do');
  await tasks.getByRole('button', { name: 'Mark done' }).click();
  await expect(state).toHaveText('Done');
  const history = tasks.getByRole('region', { name: 'Task history' });
  await expect(
    history.getByText('Task cancelled', { exact: true }),
  ).toBeVisible();
  await expect(
    history.getByText(`Reason: ${cancellationReason}`, { exact: true }),
  ).toBeVisible();
  await expect(
    history.getByText(`Reason: ${blockageReason}`, { exact: true }),
  ).toBeVisible();
  await expect(history.getByText('Before: Cancelled')).toBeVisible();
  expect(events.map((event) => event.action)).toEqual([
    'task.created',
    'task.status.changed',
    'task.status.changed',
    'task.status.changed',
    'task.cancelled',
    'task.reopened',
    'task.completed',
  ]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath('tasks-execution-history.png'),
    fullPage: true,
  });
  if (narrow)
    await page.getByRole('button', { name: 'Open navigation' }).click();
  await enterClassicCompatibility(page);
  await expect(state).toHaveText('Done');
  await expect(
    tasks.getByRole('button', { name: 'Reopen Task', exact: true }),
  ).toBeVisible();
  await expect(
    history.getByText('Task cancelled', { exact: true }),
  ).toBeVisible();
  await tasks.getByRole('button', { name: 'Reopen Task', exact: true }).click();
  await expect(state).toHaveText('To do');
  await tasks.getByRole('button', { name: 'Mark blocked' }).click();
  await tasks.getByLabel('Blockage reason').fill(blockageReason);
  await tasks.getByRole('button', { name: 'Save blockage' }).click();
  await expect(state).toHaveText('Blocked');
  await tasks.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('tasks-classic-blocked.png'),
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
