import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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
  expect(listedTitles(tasks)).toEqual([
    'Collect preparation notes',
    'Archive preparation evidence',
    'Review archive notes',
  ]);
  const fetchCount = fetcher.mock.calls.length;

  expect(within(taskList).getByLabelText('Task status')).toHaveValue('all');
  fireEvent.change(within(taskList).getByLabelText('Search Tasks'), {
    target: { value: 'ARCHIVE' },
  });
  expect(listedTitles(tasks)).toEqual([
    'Archive preparation evidence',
    'Review archive notes',
  ]);

  fireEvent.change(within(taskList).getByLabelText('Task status'), {
    target: { value: 'done' },
  });
  expect(listedTitles(tasks)).toEqual(['Archive preparation evidence']);

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

const anaPop = {
  workspaceMembershipId: 'membership-ana',
  displayLabel: 'Ana Pop',
};
const ionRadu = {
  workspaceMembershipId: 'membership-ion',
  displayLabel: 'Ion Radu',
};
const responsibleTasks = [
  {
    ...savedTask,
    id: 'ana-todo',
    title: 'Collect Ana evidence',
    assignee: anaPop,
  },
  {
    ...savedTask,
    id: 'ana-done',
    title: 'Archive Ana evidence',
    assignee: anaPop,
    status: 'done',
    completion: { actor: attribution, occurredAt: savedTask.updatedAt },
  },
  {
    ...savedTask,
    id: 'ion-todo',
    title: 'Collect Ion evidence',
    assignee: ionRadu,
  },
  {
    ...savedTask,
    id: 'unassigned-todo',
    title: 'Review pending evidence',
    assignee: null,
  },
];
// Loading a Task detail remounts the list, so every helper queries the current nodes.
function listedTitles(tasks: HTMLElement) {
  return within(within(tasks).getByRole('navigation', { name: 'Tasks' }))
    .getAllByRole('listitem')
    .map((item) => within(item).getByRole('button').textContent);
}
function responsibleFilter(tasks: HTMLElement) {
  return within(tasks).getByLabelText('Task responsible member');
}
function responsibleLabels(tasks: HTMLElement) {
  return within(responsibleFilter(tasks))
    .getAllByRole('option')
    .map((option) => option.textContent);
}
function responsibleValue(select: HTMLElement, label: string, occurrence = 0) {
  const option = within(select)
    .getAllByRole('option')
    .flatMap((candidate) =>
      candidate instanceof HTMLOptionElement && candidate.textContent === label
        ? [candidate]
        : [],
    )[occurrence];
  if (!option) throw new Error(`Missing responsible member option ${label}`);
  return option.value;
}
function selectResponsible(
  tasks: HTMLElement,
  label: string,
  occurrence = 0,
): void {
  const select = responsibleFilter(tasks);
  fireEvent.change(select, {
    target: { value: responsibleValue(select, label, occurrence) },
  });
}
async function openFilteredTasks(
  taskActor: ActorContext = actor,
): Promise<HTMLElement> {
  render(
    <ProjectWorkspace
      actor={taskActor}
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
  return tasks;
}

it('filters loaded Tasks by responsible member and combines it with the title and status filters', async () => {
  const fetcher = fixture({
    read: (url) =>
      url === '/api/projects/project/tasks'
        ? Response.json({ mutable: true, tasks: responsibleTasks })
        : undefined,
  });
  const tasks = await openFilteredTasks();
  expect(responsibleFilter(tasks)).toHaveValue('all');
  // The eligible-member directory answers with no member, so every option below comes from loaded rows.
  expect(responsibleLabels(tasks)).toEqual([
    'All',
    'Unassigned',
    'Ana Pop',
    'Ion Radu',
  ]);
  expect(listedTitles(tasks)).toEqual([
    'Collect Ana evidence',
    'Archive Ana evidence',
    'Collect Ion evidence',
    'Review pending evidence',
  ]);
  const fetchCount = fetcher.mock.calls.length;

  selectResponsible(tasks, 'Unassigned');
  expect(listedTitles(tasks)).toEqual(['Review pending evidence']);

  selectResponsible(tasks, 'Ana Pop');
  expect(listedTitles(tasks)).toEqual([
    'Collect Ana evidence',
    'Archive Ana evidence',
  ]);
  fireEvent.change(within(tasks).getByLabelText('Task status'), {
    target: { value: 'todo' },
  });
  expect(listedTitles(tasks)).toEqual(['Collect Ana evidence']);

  fireEvent.change(within(tasks).getByLabelText('Search Tasks'), {
    target: { value: 'Ion' },
  });
  expect(
    within(tasks).getByText('No Tasks match the current filters.'),
  ).toBeInTheDocument();
  expect(
    within(tasks).queryByText('No manual Tasks for this Project yet.'),
  ).not.toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(fetchCount);
});

it('offers the responsible-member filter to a task.read-only actor without any eligible-member request', async () => {
  const fetcher = fixture({
    read: (url) =>
      url === '/api/projects/project/tasks'
        ? Response.json({ mutable: true, tasks: responsibleTasks })
        : undefined,
  });
  const activeCompany = actor.activeCompany;
  if (!activeCompany) throw new Error('Missing fixture Company');
  const reader: ActorContext = {
    ...actor,
    activeCompany: { ...activeCompany, taskPermissions: ['task.read'] },
  };
  const tasks = await openFilteredTasks(reader);
  // No member is eligible for this actor, yet every assigned member stays filterable.
  selectResponsible(tasks, 'Ion Radu');
  expect(listedTitles(tasks)).toEqual(['Collect Ion evidence']);
  expect(
    fetcher.mock.calls.some(([url]) => url.includes('eligible-task-assignees')),
  ).toBe(false);
  expect(screen.queryByLabelText('Task title')).not.toBeInTheDocument();
});

it('separates homonymous responsible members and keeps the open detail and draft when the filter hides its row', async () => {
  const homonym = {
    workspaceMembershipId: 'membership-ana-second',
    displayLabel: 'Ana Pop',
  };
  fixture({
    read: (url) => {
      if (url === '/api/projects/project/tasks')
        return Response.json({
          mutable: true,
          tasks: [
            responsibleTasks[0],
            {
              ...savedTask,
              id: 'homonym-todo',
              title: 'Draft homonym report',
              assignee: homonym,
            },
          ],
        });
      if (url === '/api/tasks/ana-todo')
        return Response.json({
          mutable: true,
          task: responsibleTasks[0],
        });
      return undefined;
    },
  });
  const tasks = await openFilteredTasks();
  expect(responsibleLabels(tasks)).toEqual([
    'All',
    'Unassigned',
    'Ana Pop',
    'Ana Pop',
  ]);
  const select = responsibleFilter(tasks);
  expect(responsibleValue(select, 'Ana Pop', 0)).not.toEqual(
    responsibleValue(select, 'Ana Pop', 1),
  );

  fireEvent.click(
    within(tasks).getByRole('button', { name: 'Collect Ana evidence' }),
  );
  await within(tasks).findByRole('heading', { name: 'Collect Ana evidence' });
  fireEvent.change(within(tasks).getByLabelText('Task title'), {
    target: { value: 'Unsaved correction' },
  });

  selectResponsible(tasks, 'Ana Pop', 1);
  expect(listedTitles(tasks)).toEqual(['Draft homonym report']);
  expect(
    within(tasks).getByRole('heading', { name: 'Collect Ana evidence' }),
  ).toBeInTheDocument();
  expect(within(tasks).getByLabelText('Task title')).toHaveValue(
    'Unsaved correction',
  );
});

it('resets the responsible-member filter to All when an authoritative refresh removes that member', async () => {
  let reassigned = false;
  const anaRow = () =>
    reassigned
      ? {
          ...responsibleTasks[0],
          assignee: null,
          status: 'done',
          completion: { actor: attribution, occurredAt: savedTask.updatedAt },
          version: 2,
        }
      : responsibleTasks[0];
  fixture({
    read: (url) => {
      if (url === '/api/projects/project/tasks')
        return Response.json({
          mutable: true,
          tasks: [anaRow(), responsibleTasks[2]],
        });
      if (url === '/api/tasks/ana-todo')
        return Response.json({ mutable: true, task: anaRow() });
      return undefined;
    },
    mutate: () => {
      reassigned = true;
      return Response.json(anaRow());
    },
  });
  const tasks = await openFilteredTasks();
  fireEvent.change(within(tasks).getByLabelText('Task status'), {
    target: { value: 'todo' },
  });
  selectResponsible(tasks, 'Ana Pop');
  fireEvent.click(
    within(tasks).getByRole('button', { name: 'Collect Ana evidence' }),
  );
  await within(tasks).findByRole('heading', { name: 'Collect Ana evidence' });

  fireEvent.click(within(tasks).getByRole('button', { name: 'Mark done' }));
  await within(tasks).findByRole('button', { name: 'Reopen Task' });
  expect(responsibleFilter(tasks)).toHaveValue('all');
  expect(within(tasks).getByLabelText('Task status')).toHaveValue('todo');
  expect(responsibleLabels(tasks)).toEqual(['All', 'Unassigned', 'Ion Radu']);
  expect(listedTitles(tasks)).toEqual(['Collect Ion evidence']);
  expect(
    within(tasks).getByRole('heading', { name: 'Collect Ana evidence' }),
  ).toBeInTheDocument();
});

const octoberTask = {
  ...savedTask,
  id: 'october-task',
  title: 'Collect October evidence',
  dueDate: '2026-10-05',
};
const novemberTask = {
  ...savedTask,
  id: 'november-task',
  title: 'Archive November evidence',
  dueDate: '2026-11-20',
  status: 'done',
  completion: { actor: attribution, occurredAt: savedTask.updatedAt },
};
const undatedTask = {
  ...savedTask,
  id: 'undated-task',
  title: 'Review pending evidence',
  dueDate: null,
};
const datedTasks = [octoberTask, novemberTask, undatedTask];
function datedFixture() {
  return fixture({
    read: (url) =>
      url === '/api/projects/project/tasks'
        ? Response.json({ mutable: true, tasks: datedTasks })
        : undefined,
  });
}
function dateFilter(tasks: HTMLElement) {
  const select = within(tasks).getByLabelText('Task date filter');
  if (!(select instanceof HTMLSelectElement))
    throw new Error('Missing date filter');
  return select;
}
function selectedDateOption(tasks: HTMLElement) {
  return dateFilter(tasks).selectedOptions[0]?.textContent;
}
function selectDateFilter(tasks: HTMLElement, label: string) {
  const select = dateFilter(tasks);
  const option = within(select)
    .getAllByRole('option')
    .find((candidate) => candidate.textContent === label);
  if (!(option instanceof HTMLOptionElement))
    throw new Error(`Missing date filter option ${label}`);
  fireEvent.change(select, { target: { value: option.value } });
}
type BoundLabel = 'Task date from' | 'Task date through';
function boundInput(tasks: HTMLElement, label: BoundLabel) {
  const input = within(tasks).getByLabelText(label);
  if (!(input instanceof HTMLInputElement))
    throw new Error(`Missing date bound ${label}`);
  return input;
}
// The component only reads badInput, and jsdom never raises it, so the control's own report is stubbed.
function reportBadInput(input: HTMLInputElement, badInput: boolean) {
  Object.defineProperty(input, 'validity', {
    configurable: true,
    value: { badInput },
  });
}
function enterBound(tasks: HTMLElement, label: BoundLabel, value: string) {
  const input = boundInput(tasks, label);
  reportBadInput(input, false);
  fireEvent.change(input, { target: { value } });
}
// A native calendar control answers an impossible day by keeping its value empty and reporting bad
// input, so leaving the control is the event that carries it. The browser journey types 30 February
// in a real control; jsdom applies only the value sanitization.
function enterImpossibleDay(tasks: HTMLElement, label: BoundLabel) {
  const input = boundInput(tasks, label);
  reportBadInput(input, true);
  fireEvent.blur(input);
}
function deleteRejectedDay(tasks: HTMLElement, label: BoundLabel) {
  const input = boundInput(tasks, label);
  reportBadInput(input, false);
  fireEvent.blur(input);
}
const invalidRange =
  'Enter calendar dates with the from date on or before the through date. No date filter is applied until then.';

it('finds loaded Tasks inside an inclusive calendar date range and combines it with the existing filters', async () => {
  const fetcher = datedFixture();
  const tasks = await openFilteredTasks();
  expect(selectedDateOption(tasks)).toBe('All dates');
  expect(listedTitles(tasks)).toEqual([
    'Collect October evidence',
    'Archive November evidence',
    'Review pending evidence',
  ]);
  const fetchCount = fetcher.mock.calls.length;

  selectDateFilter(tasks, 'Without a date');
  expect(listedTitles(tasks)).toEqual(['Review pending evidence']);

  // Empty bounds keep every dated Task in server order; an undated Task belongs to no range.
  selectDateFilter(tasks, 'Date range');
  expect(listedTitles(tasks)).toEqual([
    'Collect October evidence',
    'Archive November evidence',
  ]);

  enterBound(tasks, 'Task date from', '2026-10-05');
  enterBound(tasks, 'Task date through', '2026-11-20');
  expect(listedTitles(tasks)).toEqual([
    'Collect October evidence',
    'Archive November evidence',
  ]);

  enterBound(tasks, 'Task date through', '2026-11-19');
  expect(listedTitles(tasks)).toEqual(['Collect October evidence']);
  enterBound(tasks, 'Task date from', '2026-10-06');
  expect(
    within(tasks).getByText('No Tasks match the current filters.'),
  ).toBeInTheDocument();
  expect(
    within(tasks).queryByText('No manual Tasks for this Project yet.'),
  ).not.toBeInTheDocument();

  enterBound(tasks, 'Task date from', '');
  enterBound(tasks, 'Task date through', '');
  fireEvent.change(within(tasks).getByLabelText('Task status'), {
    target: { value: 'todo' },
  });
  expect(listedTitles(tasks)).toEqual(['Collect October evidence']);
  fireEvent.change(within(tasks).getByLabelText('Search Tasks'), {
    target: { value: 'november' },
  });
  expect(
    within(tasks).getByText('No Tasks match the current filters.'),
  ).toBeInTheDocument();
  expect(fetcher).toHaveBeenCalledTimes(fetchCount);
});

it('rejects an impossible or inverted date range without applying a partial range', async () => {
  let emptied = false;
  const fetcher = fixture({
    read: (url) =>
      url === '/api/projects/project/tasks'
        ? Response.json({ mutable: true, tasks: emptied ? [] : datedTasks })
        : undefined,
  });
  const tasks = await openFilteredTasks();
  const fetchCount = fetcher.mock.calls.length;
  selectDateFilter(tasks, 'Date range');
  enterBound(tasks, 'Task date from', '2026-11-01');
  enterBound(tasks, 'Task date through', '2026-10-01');
  expect(within(tasks).getByRole('alert')).toHaveTextContent(invalidRange);
  // The inverted range applies neither bound, so no Task is hidden by an unusable selection.
  expect(listedTitles(tasks)).toEqual([
    'Collect October evidence',
    'Archive November evidence',
    'Review pending evidence',
  ]);

  enterBound(tasks, 'Task date through', '2026-12-01');
  expect(within(tasks).queryByRole('alert')).not.toBeInTheDocument();
  expect(listedTitles(tasks)).toEqual(['Archive November evidence']);

  // A year outside 0001–9999 survives the control's sanitization and still makes the range unusable.
  enterBound(tasks, 'Task date from', '12026-10-05');
  expect(within(tasks).getByRole('alert')).toHaveTextContent(invalidRange);
  expect(listedTitles(tasks)).toEqual([
    'Collect October evidence',
    'Archive November evidence',
    'Review pending evidence',
  ]);
  expect(fetcher).toHaveBeenCalledTimes(fetchCount);

  // An empty Project hides the date controls, so their message cannot outlive them.
  emptied = true;
  fireEvent.click(within(tasks).getByRole('button', { name: 'Reload Tasks' }));
  await within(tasks).findByText('No manual Tasks for this Project yet.');
  expect(within(tasks).queryByRole('alert')).not.toBeInTheDocument();
  expect(
    within(tasks).queryByLabelText('Task date filter'),
  ).not.toBeInTheDocument();
});

const everyTaskTitle = [
  'Collect October evidence',
  'Archive November evidence',
  'Review pending evidence',
];
it.each([
  {
    rejected: 'Task date from' as const,
    kept: 'Task date through' as const,
    value: '2026-10-31',
    whenOpen: ['Collect October evidence'],
  },
  {
    rejected: 'Task date through' as const,
    kept: 'Task date from' as const,
    value: '2026-11-01',
    whenOpen: ['Archive November evidence'],
  },
])(
  'makes the whole range unusable when $rejected holds an impossible calendar day',
  async ({ rejected, kept, value, whenOpen }) => {
    const fetcher = datedFixture();
    const tasks = await openFilteredTasks();
    const fetchCount = fetcher.mock.calls.length;
    selectDateFilter(tasks, 'Date range');
    enterBound(tasks, kept, value);
    expect(listedTitles(tasks)).toEqual(whenOpen);

    // The rejected day leaves an empty control, which must not be read as the open bound above.
    enterImpossibleDay(tasks, rejected);
    expect(within(tasks).getByRole('alert')).toHaveTextContent(invalidRange);
    expect(listedTitles(tasks)).toEqual(everyTaskTitle);

    // Deleting the rejected entry stays valid and reopens that bound.
    deleteRejectedDay(tasks, rejected);
    expect(within(tasks).queryByRole('alert')).not.toBeInTheDocument();
    expect(listedTitles(tasks)).toEqual(whenOpen);
    expect(within(tasks).getByLabelText(kept)).toHaveValue(value);
    expect(fetcher).toHaveBeenCalledTimes(fetchCount);
  },
);

it('resets the date filter explicitly while keeping the other filters', async () => {
  datedFixture();
  const tasks = await openFilteredTasks();
  selectDateFilter(tasks, 'Date range');
  enterBound(tasks, 'Task date from', '2026-11-01');
  fireEvent.change(within(tasks).getByLabelText('Search Tasks'), {
    target: { value: 'evidence' },
  });
  expect(listedTitles(tasks)).toEqual(['Archive November evidence']);

  fireEvent.click(
    within(tasks).getByRole('button', { name: 'Reset date filter' }),
  );
  expect(selectedDateOption(tasks)).toBe('All dates');
  expect(
    within(tasks).queryByLabelText('Task date from'),
  ).not.toBeInTheDocument();
  expect(listedTitles(tasks)).toEqual([
    'Collect October evidence',
    'Archive November evidence',
    'Review pending evidence',
  ]);
  expect(within(tasks).getByLabelText('Search Tasks')).toHaveValue('evidence');

  selectDateFilter(tasks, 'Date range');
  expect(within(tasks).getByLabelText('Task date from')).toHaveValue('');
});

it('keeps the selected Task, its draft and the exact uncertain command while a date range hides its row', async () => {
  const commands: { key: string | null; body: unknown }[] = [];
  const corrected = {
    ...octoberTask,
    title: 'Unsaved correction',
    version: 2,
  };
  let replayed = false;
  fixture({
    read: (url) => {
      if (url === '/api/projects/project/tasks')
        return Response.json({ mutable: true, tasks: datedTasks });
      if (url === '/api/tasks/october-task')
        return Response.json({
          mutable: true,
          task: replayed ? corrected : octoberTask,
        });
      return undefined;
    },
    mutate: (_url, request) => {
      commands.push({
        key: new Headers(request.headers).get('idempotency-key'),
        body: JSON.parse(
          typeof request.body === 'string' ? request.body : '{}',
        ),
      });
      if (commands.length === 1) return new Response(null, { status: 500 });
      replayed = true;
      return Response.json(corrected);
    },
  });
  const tasks = await openFilteredTasks();
  fireEvent.click(
    within(tasks).getByRole('button', { name: 'Collect October evidence' }),
  );
  await within(tasks).findByRole('heading', {
    name: 'Collect October evidence',
  });
  fireEvent.change(within(tasks).getByLabelText('Task title'), {
    target: { value: 'Unsaved correction' },
  });
  fireEvent.click(within(tasks).getByRole('button', { name: 'Save Task' }));
  await within(tasks).findByRole('button', {
    name: 'Retry pending Task change',
  });

  selectDateFilter(tasks, 'Date range');
  enterBound(tasks, 'Task date from', '2026-11-01');
  expect(listedTitles(tasks)).toEqual(['Archive November evidence']);
  expect(
    within(tasks).getByRole('heading', { name: 'Collect October evidence' }),
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
  expect(within(tasks).getByLabelText('Task date from')).toHaveValue(
    '2026-11-01',
  );
  expect(listedTitles(tasks)).toEqual(['Archive November evidence']);
});

it('reapplies the date range to the authoritative rows after a completion refresh', async () => {
  let done = false;
  const october = () =>
    done
      ? {
          ...octoberTask,
          status: 'done',
          completion: { actor: attribution, occurredAt: savedTask.updatedAt },
          version: 2,
        }
      : octoberTask;
  fixture({
    read: (url) => {
      if (url === '/api/projects/project/tasks')
        return Response.json({
          mutable: true,
          tasks: [october(), novemberTask, undatedTask],
        });
      if (url === '/api/tasks/october-task')
        return Response.json({ mutable: true, task: october() });
      return undefined;
    },
    mutate: () => {
      done = true;
      return Response.json(october());
    },
  });
  const tasks = await openFilteredTasks();
  selectDateFilter(tasks, 'Date range');
  enterBound(tasks, 'Task date from', '2026-10-01');
  enterBound(tasks, 'Task date through', '2026-10-31');
  expect(listedTitles(tasks)).toEqual(['Collect October evidence']);
  fireEvent.click(
    within(tasks).getByRole('button', { name: 'Collect October evidence' }),
  );
  await within(tasks).findByRole('heading', {
    name: 'Collect October evidence',
  });

  fireEvent.click(within(tasks).getByRole('button', { name: 'Mark done' }));
  await within(tasks).findByRole('button', { name: 'Reopen Task' });
  expect(listedTitles(tasks)).toEqual(['Collect October evidence']);
  expect(within(tasks).getByLabelText('Task date from')).toHaveValue(
    '2026-10-01',
  );
  expect(within(tasks).getByLabelText('Task date through')).toHaveValue(
    '2026-10-31',
  );

  fireEvent.change(within(tasks).getByLabelText('Task status'), {
    target: { value: 'todo' },
  });
  expect(
    within(tasks).getByText('No Tasks match the current filters.'),
  ).toBeInTheDocument();
  expect(
    within(tasks).getByRole('heading', { name: 'Collect October evidence' }),
  ).toBeInTheDocument();
});

it('clears an obsolete date filter when the authorization context is replaced', async () => {
  datedFixture();
  const identity = deterministicBrowserIdentity();
  const view = render(<ProjectWorkspace actor={actor} identity={identity} />);
  fireEvent.click(
    await screen.findByRole('button', {
      name: `${project.title} Client: ${project.clientDisplayName}`,
    }),
  );
  const tasks = await screen.findByRole('region', { name: 'Tasks' });
  await within(tasks).findByRole('navigation', { name: 'Tasks' });
  selectDateFilter(tasks, 'Date range');
  enterBound(tasks, 'Task date from', '2026-11-01');
  expect(listedTitles(tasks)).toEqual(['Archive November evidence']);

  view.rerender(
    <ProjectWorkspace
      actor={{ ...actor, workspaceMembershipId: 'replacement' }}
      identity={identity}
    />,
  );
  fireEvent.click(
    await screen.findByRole('button', {
      name: `${project.title} Client: ${project.clientDisplayName}`,
    }),
  );
  const replaced = await screen.findByRole('region', { name: 'Tasks' });
  await within(replaced).findByRole('navigation', { name: 'Tasks' });
  expect(selectedDateOption(replaced)).toBe('All dates');
  expect(listedTitles(replaced)).toEqual([
    'Collect October evidence',
    'Archive November evidence',
    'Review pending evidence',
  ]);
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

const blockageReason = "Waiting for the Client's signed questionnaire";
const declaredAt = '2026-09-24T10:00:00.000Z';
const blockedTask = {
  ...savedTask,
  status: 'blocked',
  version: 2,
  blockage: {
    reason: blockageReason,
    actor: attribution,
    occurredAt: declaredAt,
  },
};
type ExecutionCommand = { url: string; key: string | null; body: unknown };
/** A stateful server stub for one Task that applies each transition and records its event. */
function executionFixture(
  options: {
    task?: Record<string, unknown>;
    mutable?: boolean;
    reply?: (
      command: ExecutionCommand,
    ) => Response | Promise<Response> | undefined;
  } = {},
) {
  let task: Record<string, unknown> = options.task ?? savedTask;
  const events: unknown[] = [];
  const commands: ExecutionCommand[] = [];
  const other = {
    ...savedTask,
    id: 'other-task',
    title: 'Another preparation Task',
  };
  fixture({
    mutable: options.mutable,
    read: (url) => {
      if (url === '/api/projects/project/tasks')
        return Response.json({
          mutable: options.mutable ?? true,
          tasks: [task, other],
        });
      if (url === '/api/tasks/task')
        return Response.json({ mutable: options.mutable ?? true, task });
      if (url === '/api/tasks/task/history') return Response.json({ events });
      return undefined;
    },
    mutate: (url, request) => {
      const body: unknown = JSON.parse(
        typeof request.body === 'string' ? request.body : '{}',
      );
      const command = {
        url,
        key: new Headers(request.headers).get('idempotency-key'),
        body,
      };
      commands.push(command);
      const reply = options.reply?.(command);
      if (reply) return reply;
      const input = body !== null && typeof body === 'object' ? body : {};
      const status = 'status' in input ? input.status : undefined;
      const reason = 'reason' in input ? input.reason : undefined;
      const before = task.status;
      const version = Number(task.version) + 1;
      const common = {
        ...savedTask,
        title: task.title,
        version,
        updatedAt: declaredAt,
      };
      const declaration = {
        reason,
        actor: attribution,
        occurredAt: declaredAt,
      };
      let meaning: Record<string, unknown>;
      if (url.endsWith('/status')) {
        task =
          status === 'blocked'
            ? { ...common, status, completion: null, blockage: declaration }
            : { ...common, status, completion: null };
        meaning = {
          action: 'task.status.changed',
          metadata: { version, before, after: status, reason: reason ?? null },
        };
      } else if (url.endsWith('/cancel')) {
        task = {
          ...common,
          status: 'cancelled',
          completion: null,
          cancellation: declaration,
        };
        meaning = {
          action: 'task.cancelled',
          metadata: { version, before, after: 'cancelled', reason },
        };
      } else if (url.endsWith('/complete')) {
        task = {
          ...common,
          status: 'done',
          completion: { actor: attribution, occurredAt: declaredAt },
        };
        meaning = {
          action: 'task.completed',
          metadata: { version, before, after: 'done' },
        };
      } else {
        task = { ...common, status: 'todo', completion: null };
        meaning = {
          action: 'task.reopened',
          metadata: { version, before, after: 'todo' },
        };
      }
      events.push({
        id: `event-${version}`,
        occurredAt: declaredAt,
        actor: attribution,
        target: {
          type: 'task',
          taskId: 'task',
          taskTitle: task.title,
          companyId: 'company',
        },
        ...meaning,
      });
      return Response.json(task);
    },
  });
  return commands;
}
const transitionNames = [
  'Mark to do',
  'Mark in progress',
  'Mark blocked',
  'Mark done',
  'Cancel Task',
  'Reopen Task',
];
function actionNames(tasks: HTMLElement) {
  return within(tasks)
    .getAllByRole('button')
    .map((button) => button.textContent ?? '')
    .filter((name) => transitionNames.includes(name));
}
function waitForState(tasks: HTMLElement, label: string) {
  return within(tasks).findByText(label, { selector: 'p.task-status' });
}

it('starts, blocks with a validated reason, resumes, cancels with a reason and reopens with state labels and reasoned history', async () => {
  const commands = executionFixture();
  render(
    <ProjectWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
    />,
  );
  const tasks = await openSavedTask();
  await waitForState(tasks, 'To do');
  expect(actionNames(tasks)).toEqual([
    'Mark in progress',
    'Mark blocked',
    'Mark done',
    'Cancel Task',
  ]);
  fireEvent.click(
    within(tasks).getByRole('button', { name: 'Mark in progress' }),
  );
  await waitForState(tasks, 'In progress');
  expect(commands.at(-1)).toMatchObject({
    url: '/api/tasks/task/status',
    body: { expectedVersion: 1, status: 'in_progress' },
  });
  expect(
    within(tasks).getByText('In progress', { selector: 'span.task-status' }),
  ).toBeInTheDocument();

  fireEvent.click(within(tasks).getByRole('button', { name: 'Mark blocked' }));
  const reason = within(tasks).getByLabelText('Blockage reason');
  expect(actionNames(tasks)).toEqual([]);
  fireEvent.click(within(tasks).getByRole('button', { name: 'Save blockage' }));
  expect(
    within(tasks).getByText('Enter a reason of 1–500 characters.'),
  ).toBeInTheDocument();
  expect(reason).toHaveAttribute('aria-invalid', 'true');
  fireEvent.change(reason, { target: { value: `  ${'x'.repeat(501)}  ` } });
  fireEvent.click(within(tasks).getByRole('button', { name: 'Save blockage' }));
  expect(commands).toHaveLength(1);
  fireEvent.change(reason, { target: { value: `  ${blockageReason}  ` } });
  fireEvent.click(within(tasks).getByRole('button', { name: 'Save blockage' }));
  await waitForState(tasks, 'Blocked');
  expect(commands.at(-1)).toMatchObject({
    url: '/api/tasks/task/status',
    body: { expectedVersion: 2, status: 'blocked', reason: blockageReason },
  });
  expect(
    within(tasks).getByText(blockageReason, { selector: 'dd' }),
  ).toBeInTheDocument();
  expect(within(tasks).getByText(/Blocked by Owner/)).toBeInTheDocument();
  expect(within(tasks).queryByLabelText('Blockage reason')).toBeNull();
  expect(actionNames(tasks)).toEqual([
    'Mark to do',
    'Mark in progress',
    'Mark done',
    'Cancel Task',
  ]);
  expect(within(tasks).getByLabelText('Task title')).toBeEnabled();

  fireEvent.click(
    within(tasks).getByRole('button', { name: 'Mark in progress' }),
  );
  await waitForState(tasks, 'In progress');
  expect(
    within(tasks).queryByText(blockageReason, { selector: 'dd' }),
  ).toBeNull();

  fireEvent.click(within(tasks).getByRole('button', { name: 'Cancel Task' }));
  fireEvent.change(within(tasks).getByLabelText('Cancellation reason'), {
    target: { value: 'Duplicate of A' },
  });
  fireEvent.click(
    within(tasks).getByRole('button', { name: 'Keep current state' }),
  );
  expect(within(tasks).queryByLabelText('Cancellation reason')).toBeNull();
  expect(commands).toHaveLength(3);
  fireEvent.click(within(tasks).getByRole('button', { name: 'Cancel Task' }));
  expect(within(tasks).getByLabelText('Cancellation reason')).toHaveValue('');
  fireEvent.change(within(tasks).getByLabelText('Cancellation reason'), {
    target: { value: 'Duplicate of A' },
  });
  fireEvent.click(
    within(tasks).getByRole('button', { name: 'Save cancellation' }),
  );
  await waitForState(tasks, 'Cancelled');
  expect(commands.at(-1)).toMatchObject({
    url: '/api/tasks/task/cancel',
    body: { expectedVersion: 4, reason: 'Duplicate of A' },
  });
  expect(
    within(tasks).getByText('Duplicate of A', { selector: 'dd' }),
  ).toBeInTheDocument();
  expect(within(tasks).getByText(/Cancelled by Owner/)).toBeInTheDocument();
  expect(actionNames(tasks)).toEqual(['Reopen Task']);
  expect(within(tasks).queryByLabelText('Task title')).toBeNull();

  fireEvent.click(within(tasks).getByRole('button', { name: 'Reopen Task' }));
  await waitForState(tasks, 'To do');
  fireEvent.click(within(tasks).getByRole('button', { name: 'Mark done' }));
  await waitForState(tasks, 'Done');
  expect(new Set(commands.map((command) => command.key)).size).toBe(6);

  const history = within(tasks).getByRole('region', { name: 'Task history' });
  const items = within(history).getAllByRole('listitem');
  expect(
    items.map((item) => item.querySelector('strong')?.textContent),
  ).toEqual([
    'Status changed',
    'Status changed',
    'Status changed',
    'Task cancelled',
    'Task reopened',
    'Completion declared',
  ]);
  const [started, blocked, , cancelled, reopened, completed] = items;
  expect(started).toHaveTextContent('Before: To do');
  expect(started).toHaveTextContent('After: In progress');
  expect(started).not.toHaveTextContent('Reason');
  expect(blocked).toHaveTextContent('After: Blocked');
  expect(blocked).toHaveTextContent(`Reason: ${blockageReason}`);
  expect(cancelled).toHaveTextContent('Before: In progress');
  expect(cancelled).toHaveTextContent('Reason: Duplicate of A');
  expect(reopened).toHaveTextContent('Before: Cancelled');
  expect(reopened).toHaveTextContent('After: To do');
  expect(completed).toHaveTextContent('After: Done');
});

it('counts reason characters as Unicode code points like the server', async () => {
  const commands = executionFixture();
  render(
    <ProjectWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
    />,
  );
  const tasks = await openSavedTask();
  // Each supplementary character is one character but two UTF-16 code units.
  const blockage = '😀'.repeat(500);
  const cancellation = '𝒜'.repeat(500);

  fireEvent.click(within(tasks).getByRole('button', { name: 'Mark blocked' }));
  const reason = within(tasks).getByLabelText('Blockage reason');
  fireEvent.change(reason, { target: { value: `  ${blockage}😀  ` } });
  fireEvent.click(within(tasks).getByRole('button', { name: 'Save blockage' }));
  expect(
    within(tasks).getByText('Enter a reason of 1–500 characters.'),
  ).toBeInTheDocument();
  expect(commands).toHaveLength(0);
  fireEvent.change(reason, { target: { value: `  ${blockage}  ` } });
  fireEvent.click(within(tasks).getByRole('button', { name: 'Save blockage' }));
  await waitForState(tasks, 'Blocked');
  expect(commands.at(-1)?.body).toEqual({
    expectedVersion: 1,
    status: 'blocked',
    reason: blockage,
  });
  expect(
    within(tasks).getByText(blockage, { selector: 'dd' }),
  ).toBeInTheDocument();

  fireEvent.click(within(tasks).getByRole('button', { name: 'Cancel Task' }));
  const cancellationField = within(tasks).getByLabelText('Cancellation reason');
  fireEvent.change(cancellationField, {
    target: { value: `${cancellation}𝒜` },
  });
  fireEvent.click(
    within(tasks).getByRole('button', { name: 'Save cancellation' }),
  );
  expect(
    within(tasks).getByText('Enter a reason of 1–500 characters.'),
  ).toBeInTheDocument();
  expect(commands).toHaveLength(1);
  fireEvent.change(cancellationField, { target: { value: cancellation } });
  fireEvent.click(
    within(tasks).getByRole('button', { name: 'Save cancellation' }),
  );
  await waitForState(tasks, 'Cancelled');
  expect(commands.at(-1)?.body).toEqual({
    expectedVersion: 2,
    reason: cancellation,
  });
  expect(
    within(tasks).getByText(cancellation, { selector: 'dd' }),
  ).toBeInTheDocument();
  const history = within(tasks).getByRole('region', { name: 'Task history' });
  expect(
    await within(history).findByText(`Reason: ${blockage}`),
  ).toBeInTheDocument();
  expect(
    within(history).getByText(`Reason: ${cancellation}`),
  ).toBeInTheDocument();
});

it('preserves the exact blockage payload and key for an explicit retry after an uncertain result', async () => {
  let attempts = 0;
  const commands = executionFixture({
    reply: () =>
      ++attempts === 1 ? new Response(null, { status: 502 }) : undefined,
  });
  render(
    <ProjectWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
    />,
  );
  const tasks = await openSavedTask();
  fireEvent.click(within(tasks).getByRole('button', { name: 'Mark blocked' }));
  fireEvent.change(within(tasks).getByLabelText('Blockage reason'), {
    target: { value: blockageReason },
  });
  fireEvent.click(within(tasks).getByRole('button', { name: 'Save blockage' }));
  await within(tasks).findByText(
    'The result is not confirmed. Retry the same change to safely recover its recorded result.',
  );
  for (const name of ['Mark in progress', 'Mark done', 'Cancel Task'])
    expect(within(tasks).getByRole('button', { name })).toBeDisabled();
  fireEvent.click(
    within(tasks).getByRole('button', { name: 'Retry pending Task change' }),
  );
  await waitForState(tasks, 'Blocked');
  expect(commands).toHaveLength(2);
  expect(commands[1]).toEqual(commands[0]);
  expect(commands[0]?.body).toEqual({
    expectedVersion: 1,
    status: 'blocked',
    reason: blockageReason,
  });
  expect(commands[0]?.key).toBeTruthy();
});

it('requires an explicit reload after a conflicting cancellation', async () => {
  const commands = executionFixture({
    reply: () => new Response(null, { status: 409 }),
  });
  render(
    <ProjectWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
    />,
  );
  const tasks = await openSavedTask();
  fireEvent.click(within(tasks).getByRole('button', { name: 'Cancel Task' }));
  fireEvent.change(within(tasks).getByLabelText('Cancellation reason'), {
    target: { value: 'Duplicate of A' },
  });
  fireEvent.click(
    within(tasks).getByRole('button', { name: 'Save cancellation' }),
  );
  await within(tasks).findByText(
    'This Task or its permissions changed. Reload the Task before making another change.',
  );
  expect(
    within(tasks).getByRole('button', { name: 'Mark in progress' }),
  ).toBeDisabled();
  fireEvent.click(within(tasks).getByRole('button', { name: 'Reload Task' }));
  await waitFor(() =>
    expect(
      within(tasks).getByRole('button', { name: 'Mark in progress' }),
    ).toBeEnabled(),
  );
  expect(commands).toHaveLength(1);
});

it('keeps a blocked Task and its declaration readable but offers no transition for a superseded original Client', async () => {
  executionFixture({ task: blockedTask, mutable: false });
  render(
    <ProjectWorkspace
      actor={actor}
      identity={deterministicBrowserIdentity()}
    />,
  );
  const tasks = await openSavedTask();
  await waitForState(tasks, 'Blocked');
  expect(
    within(tasks).getByText(
      'Read-only: the original Client has been superseded. Task history remains available.',
    ),
  ).toBeInTheDocument();
  expect(
    within(tasks).getByText(blockageReason, { selector: 'dd' }),
  ).toBeInTheDocument();
  expect(actionNames(tasks)).toEqual([]);
});

it('shows states and declarations to a task.read reader without offering transitions', async () => {
  executionFixture({
    task: {
      ...savedTask,
      status: 'cancelled',
      version: 2,
      cancellation: {
        reason: 'Duplicate of A',
        actor: attribution,
        occurredAt: declaredAt,
      },
    },
  });
  render(
    <ProjectWorkspace
      actor={{
        ...actor,
        activeCompany: actor.activeCompany && {
          ...actor.activeCompany,
          taskPermissions: ['task.read'],
        },
      }}
      identity={deterministicBrowserIdentity()}
    />,
  );
  const tasks = await openSavedTask();
  await waitForState(tasks, 'Cancelled');
  expect(within(tasks).getByText(/Cancelled by Owner/)).toBeInTheDocument();
  expect(
    within(tasks).getByText('Duplicate of A', { selector: 'dd' }),
  ).toBeInTheDocument();
  expect(actionNames(tasks)).toEqual([]);
});

it('drops an open reason draft and a late transition reply when the authorization context changes', async () => {
  let release: (response: Response) => void = () => undefined;
  const late = new Promise<Response>((resolve) => {
    release = resolve;
  });
  const commands = executionFixture({ reply: () => late });
  const identity = deterministicBrowserIdentity();
  const view = render(<ProjectWorkspace actor={actor} identity={identity} />);
  let tasks = await openSavedTask();
  fireEvent.click(within(tasks).getByRole('button', { name: 'Cancel Task' }));
  fireEvent.change(within(tasks).getByLabelText('Cancellation reason'), {
    target: { value: 'Unsaved reason' },
  });
  view.rerender(
    <ProjectWorkspace
      actor={{ ...actor, workspaceMembershipId: 'replacement' }}
      identity={identity}
    />,
  );
  tasks = await openSavedTask();
  await waitForState(tasks, 'To do');
  expect(within(tasks).queryByLabelText('Cancellation reason')).toBeNull();

  fireEvent.click(
    within(tasks).getByRole('button', { name: 'Mark in progress' }),
  );
  await waitFor(() => expect(commands).toHaveLength(1));
  view.rerender(
    <ProjectWorkspace
      actor={{ ...actor, workspaceMembershipId: 'second-replacement' }}
      identity={identity}
    />,
  );
  release(Response.json({ ...savedTask, status: 'in_progress', version: 2 }));
  tasks = await openSavedTask();
  await waitForState(tasks, 'To do');
  expect(within(tasks).queryByText('Task change recorded.')).toBeNull();
  expect(
    within(tasks).queryByText('In progress', { selector: 'p.task-status' }),
  ).toBeNull();
});

it('offers All plus the five states in the status filter and filters on the real state', async () => {
  const rows = [
    savedTask,
    {
      ...savedTask,
      id: 'started',
      title: 'Started work',
      status: 'in_progress',
    },
    { ...blockedTask, id: 'blocked', title: 'Blocked work' },
    {
      ...savedTask,
      id: 'finished',
      title: 'Finished work',
      status: 'done',
      completion: { actor: attribution, occurredAt: declaredAt },
    },
    {
      ...savedTask,
      id: 'dropped',
      title: 'Dropped work',
      status: 'cancelled',
      cancellation: {
        reason: 'Duplicate of A',
        actor: attribution,
        occurredAt: declaredAt,
      },
    },
  ];
  fixture({
    read: (url) =>
      url === '/api/projects/project/tasks'
        ? Response.json({ mutable: true, tasks: rows })
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
  const filter = await within(tasks).findByLabelText('Task status');
  expect(filter).toHaveValue('all');
  expect(
    within(filter)
      .getAllByRole('option')
      .map((option) => option.textContent),
  ).toEqual(['All', 'To do', 'In progress', 'Blocked', 'Done', 'Cancelled']);
  expect(
    Array.from(
      tasks.querySelectorAll('.task-list .task-status'),
      (label) => label.textContent,
    ),
  ).toEqual(['To do', 'In progress', 'Blocked', 'Done', 'Cancelled']);
  for (const [value, title] of [
    ['todo', 'Collect preparation notes'],
    ['in_progress', 'Started work'],
    ['blocked', 'Blocked work'],
    ['done', 'Finished work'],
    ['cancelled', 'Dropped work'],
  ]) {
    fireEvent.change(filter, { target: { value } });
    expect(listedTitles(tasks)).toEqual([title]);
  }
});

it('fails closed for an unknown Task state', async () => {
  fixture({
    read: (url) =>
      url === '/api/projects/project/tasks'
        ? Response.json({
            mutable: true,
            tasks: [{ ...savedTask, status: 'paused' }],
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
  await within(tasks).findByText(
    'Tasks could not be loaded. Reload to try again.',
  );
  expect(
    within(tasks).queryByRole('navigation', { name: 'Tasks' }),
  ).not.toBeInTheDocument();
});
