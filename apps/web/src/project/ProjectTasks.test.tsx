import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { deterministicBrowserIdentity } from '../access-composition';
import type { ActorContext } from '../access-types';
import { ProjectWorkspace } from './ProjectWorkspace';
import type { TaskView } from './task-response';

const actor: ActorContext = {
  internalUserId: 'owner',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Workspace',
  displayName: 'Owner',
  email: 'owner@example.test',
  active: true,
  workspacePermissions: ['client.manage'],
  activeCompany: {
    id: 'company',
    displayName: 'PRISMA-PRIM',
    projectPermissions: ['project.read'],
    taskPermissions: ['task.read', 'task.manage'],
    taskPermissionAssignmentId: 'task-grant',
    taskPermissionSetVersion: 'v1',
  },
};
const project = {
  id: 'project',
  title: 'ISO preparation',
  status: 'preparatory',
  companyId: 'company',
  clientAccountId: 'client',
  clientDisplayName: 'Synthetic Client',
  createdAt: '2026-09-19T00:00:00.000Z',
};
const attribution = {
  internalUserId: 'owner',
  workspaceMembershipId: 'member',
  displayName: 'Owner',
};
afterEach(() => vi.unstubAllGlobals());

it('creates an unassigned Task, reloads, edits, completes and reopens with attributable history while the Project stays preparatory', async () => {
  let task = {
    id: 'task',
    companyId: 'company',
    projectId: 'project',
    clientAccountId: 'client',
    title: 'Collect preparation notes',
    assignee: null,
    dueDate: null,
    status: 'todo',
    completion: null,
    version: 1,
    createdAt: '2026-09-19T00:00:00.000Z',
    updatedAt: '2026-09-19T00:00:00.000Z',
    createdBy: attribution,
  };
  let created = false;
  const events: unknown[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === 'POST' || options?.method === 'PATCH') {
        if (!created) {
          created = true;
          events.push({
            id: 'created',
            action: 'task.created',
            occurredAt: task.createdAt,
            actor: attribution,
            target: {
              type: 'task',
              taskId: 'task',
              taskTitle: task.title,
              companyId: 'company',
            },
            metadata: {
              version: 1,
              initial: { title: task.title, assignee: null, dueDate: null },
            },
          });
        } else if (options.method === 'PATCH') {
          task = { ...task, title: 'Review preparation notes', version: 2 };
          events.push({
            id: 'edited',
            action: 'task.updated',
            occurredAt: task.updatedAt,
            actor: attribution,
            target: {
              type: 'task',
              taskId: 'task',
              taskTitle: task.title,
              companyId: 'company',
            },
            metadata: {
              version: 2,
              changes: {
                title: {
                  before: 'Collect preparation notes',
                  after: task.title,
                },
              },
            },
          });
        } else {
          const complete = url.endsWith('/complete');
          task = {
            ...task,
            status: complete ? 'done' : 'todo',
            version: task.version + 1,
          };
          events.push({
            id: complete ? 'completed' : 'reopened',
            action: complete ? 'task.completed' : 'task.reopened',
            occurredAt: task.updatedAt,
            actor: attribution,
            target: {
              type: 'task',
              taskId: 'task',
              taskTitle: task.title,
              companyId: 'company',
            },
            metadata: {
              version: task.version,
              before: complete ? 'todo' : 'done',
              after: complete ? 'done' : 'todo',
            },
          });
        }
        return Response.json({
          ...task,
          completion:
            task.status === 'done'
              ? { actor: attribution, occurredAt: task.updatedAt }
              : null,
        });
      }
      if (url === '/api/clients')
        return Response.json([
          { id: 'client', displayName: 'Synthetic Client' },
        ]);
      if (url === '/api/projects') return Response.json([project]);
      if (url === '/api/projects/project') return Response.json(project);
      if (url.endsWith('/eligible-task-assignees'))
        return Response.json({ members: [] });
      if (url === '/api/projects/project/tasks')
        return Response.json({
          mutable: true,
          tasks: created
            ? [
                {
                  ...task,
                  completion:
                    task.status === 'done'
                      ? { actor: attribution, occurredAt: task.updatedAt }
                      : null,
                },
              ]
            : [],
        });
      if (url.endsWith('/history')) return Response.json({ events });
      if (url === '/api/tasks/task')
        return Response.json({
          mutable: true,
          task: {
            ...task,
            completion:
              task.status === 'done'
                ? { actor: attribution, occurredAt: task.updatedAt }
                : null,
          },
        });
      return new Response(null, { status: 403 });
    }),
  );
  render(
    <ProjectWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', {
      name: `${project.title} Client: ${project.clientDisplayName}`,
    }),
  );
  const tasks = await screen.findByRole('region', { name: 'Tasks' });
  fireEvent.change(await within(tasks).findByLabelText('Task title'), {
    target: { value: task.title },
  });
  fireEvent.click(within(tasks).getByRole('button', { name: 'Create Task' }));
  await within(tasks).findByRole('heading', { name: task.title });
  expect(
    within(tasks).getByText('Unassigned', { selector: 'dd' }),
  ).toBeInTheDocument();
  fireEvent.click(within(tasks).getByRole('button', { name: 'Reload Task' }));
  fireEvent.click(
    await within(tasks).findByRole('button', {
      name: 'Collect preparation notes',
    }),
  );
  fireEvent.change(await within(tasks).findByLabelText('Task title'), {
    target: { value: 'Review preparation notes' },
  });
  fireEvent.click(within(tasks).getByRole('button', { name: 'Save Task' }));
  await within(tasks).findByRole('heading', {
    name: 'Review preparation notes',
  });
  fireEvent.click(within(tasks).getByRole('button', { name: 'Mark done' }));
  await within(tasks).findByText(/Completion declared by Owner/);
  fireEvent.click(within(tasks).getByRole('button', { name: 'Reopen Task' }));
  await within(tasks).findByRole('button', { name: 'Mark done' });
  const history = within(tasks).getByRole('region', { name: 'Task history' });
  expect(within(history).getByText('Task created')).toBeInTheDocument();
  expect(within(history).getByText('Task edited')).toBeInTheDocument();
  expect(within(history).getByText('Completion declared')).toBeInTheDocument();
  expect(within(history).getByText('Task reopened')).toBeInTheDocument();
  expect(
    screen.getByText(
      'Preparation only. This record does not authorize work to start.',
    ),
  ).toBeInTheDocument();
  expect(screen.getByText('Preparatory')).toBeInTheDocument();
});

const savedTask = {
  id: 'task',
  companyId: 'company',
  projectId: 'project',
  clientAccountId: 'client',
  title: 'Collect preparation notes',
  assignee: null,
  dueDate: null,
  status: 'todo',
  completion: null,
  version: 1,
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z',
  createdBy: attribution,
};
function fixture(
  options: {
    mutable?: boolean;
    read?: (url: string) => Response | Promise<Response> | undefined;
    mutate?: (
      url: string,
      request: RequestInit,
    ) => Response | Promise<Response>;
  } = {},
) {
  const fetcher = vi.fn(async (url: string, request?: RequestInit) => {
    if (request?.method === 'POST' || request?.method === 'PATCH')
      return options.mutate?.(url, request) ?? Response.json(savedTask);
    const overridden = options.read?.(url);
    if (overridden) return overridden;
    if (url === '/api/clients')
      return Response.json([{ id: 'client', displayName: 'Synthetic Client' }]);
    if (url === '/api/projects') return Response.json([project]);
    if (url === '/api/projects/project') return Response.json(project);
    if (url.endsWith('/eligible-task-assignees'))
      return Response.json({ members: [] });
    if (url.endsWith('/tasks'))
      return Response.json({
        mutable: options.mutable ?? true,
        tasks: [
          savedTask,
          { ...savedTask, id: 'other-task', title: 'Another preparation Task' },
        ],
      });
    if (url.endsWith('/history')) return Response.json({ events: [] });
    if (url.startsWith('/api/tasks/'))
      return Response.json({
        mutable: options.mutable ?? true,
        task: url.endsWith('/other-task')
          ? {
              ...savedTask,
              id: 'other-task',
              title: 'Another preparation Task',
            }
          : savedTask,
      });
    return new Response(null, { status: 403 });
  });
  vi.stubGlobal('fetch', fetcher);
  return fetcher;
}
async function openSavedTask() {
  fireEvent.click(
    await screen.findByRole('button', {
      name: `${project.title} Client: ${project.clientDisplayName}`,
    }),
  );
  fireEvent.click(await screen.findByRole('button', { name: savedTask.title }));
  await screen.findByRole('heading', { name: savedTask.title });
  return screen.getByRole('region', { name: 'Tasks' });
}

it('filters loaded Tasks locally by title and current status while preserving server order', async () => {
  const completedTask = {
    ...savedTask,
    id: 'completed-task',
    title: 'Archive preparation evidence',
    status: 'done',
    completion: {
      actor: attribution,
      occurredAt: savedTask.updatedAt,
    },
  };
  const fetcher = fixture({
    read: (url) =>
      url === '/api/projects/project/tasks'
        ? Response.json({
            mutable: true,
            tasks: [
              savedTask,
              completedTask,
              { ...savedTask, id: 'last-task', title: 'Review archive notes' },
            ],
          })
        : undefined,
  });
  render(
    <ProjectWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', {
      name: `${project.title} Client: ${project.clientDisplayName}`,
    }),
  );
  const tasks = await screen.findByRole('region', { name: 'Tasks' });
  const taskList = await within(tasks).findByRole('navigation', {
    name: 'Tasks',
  });
  expect(
    within(taskList)
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual([
    'Collect preparation notes',
    'Archive preparation evidence',
    'Review archive notes',
  ]);
  const fetchCount = fetcher.mock.calls.length;

  expect(within(taskList).getByLabelText('Task status')).toHaveValue('all');
  fireEvent.change(within(taskList).getByLabelText('Search Tasks'), {
    target: { value: 'ARCHIVE' },
  });
  expect(
    within(taskList)
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['Archive preparation evidence', 'Review archive notes']);

  fireEvent.change(within(taskList).getByLabelText('Task status'), {
    target: { value: 'done' },
  });
  expect(
    within(taskList)
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).toEqual(['Archive preparation evidence']);

  fireEvent.change(within(taskList).getByLabelText('Search Tasks'), {
    target: { value: 'missing title' },
  });
  expect(
    within(taskList).getByText('No Tasks match the current filters.'),
  ).toBeInTheDocument();
  expect(
    within(taskList).queryByText('No manual Tasks for this Project yet.'),
  ).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(fetchCount);
});

it('keeps the selected detail, draft and exact retry command when filters hide its list item', async () => {
  const commands: { key: string | null; body: unknown }[] = [];
  let replayed = false;
  fixture({
    mutate: (_url, request) => {
      commands.push({
        key: new Headers(request.headers).get('idempotency-key'),
        body: JSON.parse(
          typeof request.body === 'string' ? request.body : '{}',
        ),
      });
      if (commands.length === 1) return new Response(null, { status: 500 });
      replayed = true;
      return Response.json({
        ...savedTask,
        title: 'Unsaved correction',
        version: 2,
      });
    },
    read: (url) =>
      replayed && url === '/api/tasks/task'
        ? Response.json({
            mutable: true,
            task: {
              ...savedTask,
              title: 'Unsaved correction',
              version: 2,
            },
          })
        : undefined,
  });
  render(
    <ProjectWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
    />,
  );
  const tasks = await openSavedTask();
  fireEvent.change(within(tasks).getByLabelText('Task title'), {
    target: { value: 'Unsaved correction' },
  });
  fireEvent.click(within(tasks).getByRole('button', { name: 'Save Task' }));
  await within(tasks).findByRole('button', {
    name: 'Retry pending Task change',
  });

  fireEvent.change(within(tasks).getByLabelText('Search Tasks'), {
    target: { value: 'another' },
  });
  expect(
    within(tasks).queryByRole('button', { name: savedTask.title }),
  ).not.toBeInTheDocument();
  expect(
    within(tasks).getByRole('heading', { name: savedTask.title }),
  ).toBeInTheDocument();
  expect(within(tasks).getByLabelText('Task title')).toHaveValue(
    'Unsaved correction',
  );

  fireEvent.click(
    within(tasks).getByRole('button', { name: 'Retry pending Task change' }),
  );
  await within(tasks).findByRole('heading', { name: 'Unsaved correction' });
  expect(commands).toHaveLength(2);
  expect(commands[0]).toEqual(commands[1]);
  expect(commands[0]?.body).toEqual({
    expectedVersion: 1,
    title: 'Unsaved correction',
  });
  expect(commands[0]?.key).toBeTruthy();
});

it('refreshes filtered navigation after complete and reopen while keeping the open detail readable', async () => {
  let currentTask: TaskView = { ...savedTask, status: 'todo' };
  fixture({
    read: (url) => {
      if (url === '/api/projects/project/tasks')
        return Response.json({ mutable: true, tasks: [currentTask] });
      if (url === '/api/tasks/task')
        return Response.json({ mutable: true, task: currentTask });
      return undefined;
    },
    mutate: (url) => {
      const done = url.endsWith('/complete');
      currentTask = done
        ? {
            ...currentTask,
            status: 'done',
            completion: {
              actor: attribution,
              occurredAt: savedTask.updatedAt,
            },
            version: currentTask.version + 1,
          }
        : {
            ...currentTask,
            status: 'todo',
            completion: null,
            version: currentTask.version + 1,
          };
      return Response.json(currentTask);
    },
  });
  render(
    <ProjectWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', {
      name: `${project.title} Client: ${project.clientDisplayName}`,
    }),
  );
  const tasks = await screen.findByRole('region', { name: 'Tasks' });
  await within(tasks).findByRole('navigation', { name: 'Tasks' });
  fireEvent.change(within(tasks).getByLabelText('Task status'), {
    target: { value: 'todo' },
  });
  fireEvent.click(within(tasks).getByRole('button', { name: savedTask.title }));
  await within(tasks).findByRole('heading', { name: savedTask.title });

  fireEvent.click(within(tasks).getByRole('button', { name: 'Mark done' }));
  await within(tasks).findByRole('button', { name: 'Reopen Task' });
  expect(
    within(tasks).getByText('No Tasks match the current filters.'),
  ).toBeInTheDocument();
  expect(
    within(tasks).getByRole('heading', { name: savedTask.title }),
  ).toBeInTheDocument();

  fireEvent.change(within(tasks).getByLabelText('Task status'), {
    target: { value: 'done' },
  });
  expect(
    within(tasks).getByRole('button', { name: savedTask.title }),
  ).toBeInTheDocument();
  fireEvent.click(within(tasks).getByRole('button', { name: 'Reopen Task' }));
  await within(tasks).findByRole('button', { name: 'Mark done' });
  expect(
    within(tasks).getByText('No Tasks match the current filters.'),
  ).toBeInTheDocument();
  expect(
    within(tasks).getByRole('heading', { name: savedTask.title }),
  ).toBeInTheDocument();
});

it('keeps the original edit key and expected version across Task navigation and reads current state after a historical replay', async () => {
  const commands: { key: string | null; body: unknown }[] = [];
  let replayed = false;
  fixture({
    mutate: (_url, request) => {
      commands.push({
        key: new Headers(request.headers).get('idempotency-key'),
        body: JSON.parse(
          typeof request.body === 'string' ? request.body : '{}',
        ),
      });
      if (commands.length === 1) return new Response(null, { status: 500 });
      replayed = true;
      return Response.json({
        ...savedTask,
        title: 'My correction',
        version: 2,
      });
    },
    read: (url) =>
      replayed && url === '/api/tasks/task'
        ? Response.json({
            mutable: true,
            task: {
              ...savedTask,
              title: 'Later correction by colleague',
              version: 3,
            },
          })
        : undefined,
  });
  render(
    <ProjectWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
    />,
  );
  const tasks = await openSavedTask();
  fireEvent.change(within(tasks).getByLabelText('Task title'), {
    target: { value: 'My correction' },
  });
  fireEvent.click(within(tasks).getByRole('button', { name: 'Save Task' }));
  await within(tasks).findByRole('button', {
    name: 'Retry pending Task change',
  });
  fireEvent.click(
    within(tasks).getByRole('button', { name: 'Another preparation Task' }),
  );
  await within(tasks).findByRole('heading', {
    name: 'Another preparation Task',
  });
  expect(
    within(tasks).getByRole('button', { name: 'Save Task' }),
  ).toBeDisabled();
  fireEvent.click(
    within(tasks).getByRole('button', { name: 'Retry pending Task change' }),
  );
  await within(tasks).findByRole('heading', {
    name: 'Later correction by colleague',
  });
  expect(commands).toHaveLength(2);
  expect(commands[0]).toEqual(commands[1]);
  expect(commands[0]?.body).toEqual({
    expectedVersion: 1,
    title: 'My correction',
  });
  expect(commands[0]?.key).toBeTruthy();
});

it('requires an explicit reload after a conflict, including after selecting a different Task', async () => {
  fixture({ mutate: () => new Response(null, { status: 409 }) });
  render(
    <ProjectWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
    />,
  );
  const tasks = await openSavedTask();
  fireEvent.click(within(tasks).getByRole('button', { name: 'Mark done' }));
  await within(tasks).findByText(
    'This Task or its permissions changed. Reload the Task before making another change.',
  );
  expect(
    within(tasks).getByRole('button', { name: 'Mark done' }),
  ).toBeDisabled();
  fireEvent.click(
    within(tasks).getByRole('button', { name: 'Another preparation Task' }),
  );
  await within(tasks).findByRole('heading', {
    name: 'Another preparation Task',
  });
  expect(
    within(tasks).getByRole('button', { name: 'Mark done' }),
  ).toBeDisabled();
  fireEvent.click(within(tasks).getByRole('button', { name: 'Reload Task' }));
  await within(tasks).findByRole('heading', {
    name: 'Another preparation Task',
  });
  expect(
    within(tasks).getByRole('button', { name: 'Mark done' }),
  ).toBeEnabled();
});

it('preserves useful drafts when changing Tasks and returning', async () => {
  fixture();
  render(
    <ProjectWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
    />,
  );
  const tasks = await openSavedTask();
  fireEvent.change(within(tasks).getByLabelText('Task title'), {
    target: { value: 'Unsaved correction' },
  });
  fireEvent.change(within(tasks).getByLabelText('Due date'), {
    target: { value: '2026-10-15' },
  });
  fireEvent.click(
    within(tasks).getByRole('button', { name: 'Another preparation Task' }),
  );
  await within(tasks).findByRole('heading', {
    name: 'Another preparation Task',
  });
  fireEvent.click(within(tasks).getByRole('button', { name: savedTask.title }));
  await within(tasks).findByRole('heading', { name: savedTask.title });
  expect(within(tasks).getByLabelText('Task title')).toHaveValue(
    'Unsaved correction',
  );
  expect(within(tasks).getByLabelText('Due date')).toHaveValue('2026-10-15');
});

it('keeps a superseded original Client read-only with Task history and no assignee query', async () => {
  const fetcher = fixture({ mutable: false });
  render(
    <ProjectWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
    />,
  );
  const tasks = await openSavedTask();
  expect(
    within(tasks).getByText(
      'Read-only: the original Client has been superseded. Task history remains available.',
    ),
  ).toBeInTheDocument();
  expect(
    within(tasks).getByRole('region', { name: 'Task history' }),
  ).toBeInTheDocument();
  expect(
    within(tasks).queryByRole('button', { name: 'Mark done' }),
  ).not.toBeInTheDocument();
  expect(within(tasks).queryByLabelText('Task title')).not.toBeInTheDocument();
  expect(
    fetcher.mock.calls.some(([url]) => url.includes('eligible-task-assignees')),
  ).toBe(false);
});

it('preserves an ineligible historical assignee while allowing a title-only correction', async () => {
  const assignee = {
    workspaceMembershipId: 'former-member',
    displayLabel: 'Former responsible member',
  };
  let command: unknown;
  fixture({
    read: (url) =>
      url === '/api/tasks/task'
        ? Response.json({ mutable: true, task: { ...savedTask, assignee } })
        : undefined,
    mutate: (_url, request) => {
      command = JSON.parse(
        typeof request.body === 'string' ? request.body : '{}',
      );
      return Response.json({
        ...savedTask,
        assignee,
        title: 'Corrected title',
        version: 2,
      });
    },
  });
  render(
    <ProjectWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
    />,
  );
  const tasks = await openSavedTask();
  expect(
    within(tasks).getByRole('option', { name: assignee.displayLabel }),
  ).toBeDisabled();
  fireEvent.change(within(tasks).getByLabelText('Task title'), {
    target: { value: 'Corrected title' },
  });
  fireEvent.click(within(tasks).getByRole('button', { name: 'Save Task' }));
  await within(tasks).findByText('Task change recorded.');
  expect(command).toEqual({ expectedVersion: 1, title: 'Corrected title' });
});

it('shows a missing Task without stale detail or actions and allows another listed Task to open', async () => {
  let missing = false;
  fixture({
    read: (url) =>
      missing && url === '/api/tasks/task'
        ? new Response(null, { status: 404 })
        : undefined,
  });
  render(
    <ProjectWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
    />,
  );
  const tasks = await openSavedTask();
  missing = true;
  fireEvent.click(within(tasks).getByRole('button', { name: 'Reload Task' }));
  await within(tasks).findByText(
    'This Task could not be found. Reload the Task or choose another Task from the list.',
  );
  expect(
    within(tasks).queryByText(
      'Task, Project and Client read access are required for this Company.',
    ),
  ).not.toBeInTheDocument();
  expect(
    within(tasks).queryByRole('heading', { name: savedTask.title }),
  ).not.toBeInTheDocument();
  expect(
    within(tasks).queryByRole('region', { name: 'Task history' }),
  ).not.toBeInTheDocument();
  expect(within(tasks).queryByLabelText('Task title')).not.toBeInTheDocument();
  expect(
    within(tasks).queryByRole('button', {
      name: /Save Task|Mark done|Reopen Task/,
    }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    within(tasks).getByRole('button', { name: 'Another preparation Task' }),
  );
  await within(tasks).findByRole('heading', {
    name: 'Another preparation Task',
  });
});

it.each(['/api/projects/project/tasks', '/api/tasks/task'])(
  'removes Task detail and history when the server denies a reload at %s',
  async (deniedPath) => {
    let denied = false;
    fixture({
      read: (url) =>
        denied && url === deniedPath
          ? new Response(null, { status: 403 })
          : undefined,
    });
    render(
      <ProjectWorkspace
        actor={actor}
        identity={deterministicBrowserIdentity()}
      />,
    );
    const tasks = await openSavedTask();
    denied = true;
    fireEvent.click(within(tasks).getByRole('button', { name: 'Reload Task' }));
    await within(tasks).findByText(
      'Task, Project and Client read access are required for this Company.',
    );
    expect(
      within(tasks).queryByRole('heading', { name: savedTask.title }),
    ).not.toBeInTheDocument();
    expect(
      within(tasks).queryByRole('region', { name: 'Task history' }),
    ).not.toBeInTheDocument();
  },
);

it.each(['Company', 'membership', 'identity', 'assignment', 'permission'])(
  'suppresses a pending Task mutation response after %s replacement',
  async (context) => {
    let resolve: (response: Response) => void = () => undefined;
    fixture({
      mutate: () =>
        new Promise<Response>((settle) => {
          resolve = settle;
        }),
    });
    const identity = deterministicBrowserIdentity();
    const view = render(<ProjectWorkspace actor={actor} identity={identity} />);
    const tasks = await openSavedTask();
    fireEvent.click(within(tasks).getByRole('button', { name: 'Mark done' }));
    const activeCompany = actor.activeCompany;
    if (!activeCompany) throw new Error('Missing fixture Company');
    const changed: ActorContext =
      context === 'Company'
        ? { ...actor, activeCompany: { ...activeCompany, id: 'other-company' } }
        : context === 'membership'
          ? { ...actor, workspaceMembershipId: 'replacement' }
          : context === 'assignment'
            ? {
                ...actor,
                activeCompany: {
                  ...activeCompany,
                  taskPermissionAssignmentId: 'replacement',
                },
              }
            : context === 'permission'
              ? {
                  ...actor,
                  activeCompany: { ...activeCompany, taskPermissions: [] },
                }
              : actor;
    view.rerender(
      <ProjectWorkspace
        actor={changed}
        identity={
          context === 'identity' ? deterministicBrowserIdentity() : identity
        }
      />,
    );
    resolve(
      Response.json({
        ...savedTask,
        title: 'Late hidden result',
        status: 'done',
        completion: { actor: attribution, occurredAt: savedTask.updatedAt },
        version: 2,
      }),
    );
    await screen.findByRole('button', {
      name: `${project.title} Client: ${project.clientDisplayName}`,
    });
    expect(screen.queryByText('Task change recorded.')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Retry pending Task change' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'Late hidden result' }),
    ).not.toBeInTheDocument();
  },
);

it('fails closed for malformed Task history', async () => {
  fixture({
    read: (url) =>
      url.endsWith('/history')
        ? Response.json({
            events: [
              {
                id: 'event',
                action: 'task.completed',
                actor: attribution,
                occurredAt: savedTask.updatedAt,
                target: {
                  type: 'task',
                  taskId: 'other-company-task',
                  taskTitle: 'Other Company Task',
                  companyId: 'other-company',
                },
                metadata: { version: 2, before: 'todo', after: 'done' },
              },
            ],
          })
        : undefined,
  });
  render(
    <ProjectWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', {
      name: `${project.title} Client: ${project.clientDisplayName}`,
    }),
  );
  fireEvent.click(await screen.findByRole('button', { name: savedTask.title }));
  const tasks = screen.getByRole('region', { name: 'Tasks' });
  await within(tasks).findByText(
    'Tasks could not be loaded. Reload to try again.',
  );
  expect(
    within(tasks).queryByRole('region', { name: 'Task history' }),
  ).not.toBeInTheDocument();
});
