import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import type { TaskView } from './project/task-response';
import { preparatoryLifecycle } from './project/project-lifecycle.test-fixtures';
import { changeValue } from './test/select-option';

const company = { id: 'queue-company', displayName: 'PRISMA-PRIM' };
const otherCompany = { id: 'other-company', displayName: 'BIC' };
const actor: ActorContext = {
  internalUserId: 'reader',
  workspaceMembershipId: 'member',
  workspaceId: 'workspace',
  workspaceName: 'Preparation Workspace',
  displayName: 'Ada',
  email: 'ada@example.test',
  active: true,
  workspacePermissions: [],
  activeCompany: {
    ...company,
    clientPermissions: ['client.read'],
    projectPermissions: ['project.read'],
    taskPermissions: ['task.read'],
    taskPermissionAssignmentId: 'read-grant',
    taskPermissionSetVersion: 'v1',
  },
};
const project = {
  id: 'exact-project',
  companyId: company.id,
  clientAccountId: 'original-client',
  clientDossierId: 'original-client',
  clientDisplayName: 'Original Client',
  title: 'Exact preparation',
  status: 'preparatory',
  createdAt: '2026-09-19T00:00:00.000Z',
};
const task: TaskView = {
  description: null,
  id: 'exact-task',
  companyId: company.id,
  projectId: project.id,
  clientAccountId: project.clientAccountId,
  title: 'Undated exact preparation',
  assignee: null,
  dueDate: null,
  priority: 'important',
  status: 'blocked',
  completion: null,
  blockage: {
    reason: 'Literal native blockage DEMO',
    actor: {
      internalUserId: actor.internalUserId,
      workspaceMembershipId: actor.workspaceMembershipId,
      displayName: actor.displayName,
    },
    occurredAt: '2026-10-28T00:00:00.000Z',
  },
  version: 1,
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z',
  createdBy: {
    internalUserId: actor.internalUserId,
    workspaceMembershipId: actor.workspaceMembershipId,
    displayName: actor.displayName,
  },
};
function installServer() {
  const state: {
    actor: ActorContext;
    hold: boolean;
    queueRows: TaskView[];
    currentTask: TaskView;
    mutable: boolean;
    closed: boolean;
    queueStatus: number;
    writeReply: ((init: RequestInit) => Promise<Response>) | null;
    createdTask: TaskView | null;
    actorResponse: ((value: ActorContext) => unknown) | null;
  } = {
    actor,
    hold: false,
    queueRows: [task],
    currentTask: task,
    mutable: true,
    closed: false,
    queueStatus: 200,
    writeReply: null,
    createdTask: null,
    actorResponse: null,
  };
  const calls: Array<{
    path: string;
    method: string;
    offset: number;
    companyId: string | null;
  }> = [];
  const held: Array<{
    signal: AbortSignal | null | undefined;
    response: Response;
    answer: (response: Response) => void;
  }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString(), window.location.origin);
      const companyId = new Headers(init?.headers).get('x-company-context-id');
      const path = url.pathname;
      calls.push({
        path,
        method: init?.method ?? 'GET',
        offset: Number(url.searchParams.get('offset')),
        companyId,
      });
      const currentCompany =
        companyId === otherCompany.id ? otherCompany : company;
      if (path === '/api/access/current-actor') {
        const value = {
          ...state.actor,
          activeCompany: { ...state.actor.activeCompany, ...currentCompany },
        };
        return Response.json(
          state.actorResponse ? state.actorResponse(value) : value,
        );
      }
      if (path === '/api/companies')
        return Response.json([company, otherCompany]);
      if (path === '/api/activity-log') return Response.json({ events: [] });
      if (path === '/api/assigned-tasks') return Response.json({ tasks: [] });
      if (path === '/api/operational-home')
        return Response.json({
          companyId: currentCompany.id,
          today: '2026-10-21',
          summaries: [],
        });
      if (path === '/api/clients') return Response.json([]);
      const currentProject = {
        ...project,
        status: state.closed ? 'completed' : 'preparatory',
      };
      if (path === '/api/projects')
        return Response.json(
          currentCompany.id === company.id ? [currentProject] : [],
        );
      if (path === '/api/blocked-tasks') {
        const response =
          state.queueStatus !== 200
            ? new Response(null, { status: state.queueStatus })
            : Response.json({
                companyId: currentCompany.id,
                offset: 0,
                pageSize: 25,
                hasNextPage: false,
                tasks:
                  currentCompany.id === company.id
                    ? state.queueRows.map((row) => ({
                        ...row,
                        project: {
                          id: project.id,
                          title: 'Listed preparation label',
                          clientDisplayName: project.clientDisplayName,
                        },
                      }))
                    : [],
              });
        if (state.hold)
          return new Promise<Response>((answer) =>
            held.push({ signal: init?.signal, response, answer }),
          );
        return response;
      }
      if (path === `/api/projects/${project.id}`)
        return Response.json(currentProject);
      if (
        path === `/api/projects/${project.id}/tasks` &&
        init?.method === 'POST'
      )
        return state.writeReply
          ? state.writeReply(init)
          : new Response(null, { status: 503 });
      if (path.endsWith('/eligible-task-assignees'))
        return Response.json({ members: [] });
      if (state.createdTask && path === `/api/tasks/${state.createdTask.id}`)
        return Response.json({ mutable: true, task: state.createdTask });
      if (
        state.createdTask &&
        path === `/api/tasks/${state.createdTask.id}/history`
      )
        return Response.json({ events: [] });
      if (path === `/api/projects/${project.id}/tasks`)
        return Response.json({
          mutable: state.mutable,
          tasks: [
            state.currentTask,
            ...(state.createdTask ? [state.createdTask] : []),
          ],
        });
      if (path === `/api/projects/${project.id}/lifecycle`)
        return Response.json(
          state.closed
            ? {
                status: 'completed',
                lifecycleRevision: 1,
                mutable: false,
                start: null,
                transitions: [],
              }
            : preparatoryLifecycle,
        );
      if (path === `/api/tasks/${task.id}`)
        return Response.json({
          mutable: state.mutable,
          task: state.currentTask,
        });
      if (path === `/api/tasks/${task.id}/history`)
        return Response.json({ events: [] });
      throw new Error(`Unexpected public App request: ${path}`);
    }),
  );
  return {
    state,
    calls,
    held,
    async release() {
      const pending = held.shift();
      if (!pending) throw new Error('No held queue read');
      await act(async () => pending.answer(pending.response));
    },
  };
}
const scroll = Element.prototype.scrollIntoView;
beforeEach(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(
      (query: string) =>
        ({
          matches: true,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(() => false),
        }) satisfies MediaQueryList,
    ),
  );
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/?frame=prisme#blocked-tasks');
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Element.prototype.scrollIntoView = scroll;
  window.history.replaceState(null, '', '/');
});
const queue = () => screen.getByRole('region', { name: 'Blocked Tasks' });
function navigate(name: string) {
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).getByRole('link', { name }),
  );
}
async function ready() {
  await screen.findByRole('heading', { name: task.title });
}

it('opens the exact current Task through fresh Project and Task reads, preserves focus and returns to a fresh queue', async () => {
  const api = installServer();
  render(<App identity={deterministicBrowserIdentity()} />);
  await ready();
  api.state.currentTask = { ...task, title: 'Fresh exact title', version: 2 };
  fireEvent.click(
    within(queue()).getByRole('button', { name: /^Open Undated exact/u }),
  );
  const projects = await screen.findByRole('region', { name: 'Projects' });
  expect(
    await within(projects).findByRole('heading', { name: 'Fresh exact title' }),
  ).toBeVisible();
  await waitFor(() => expect(projects).toHaveFocus());
  expect(
    api.calls.filter((call) => call.path === `/api/projects/${project.id}`),
  ).toHaveLength(1);
  expect(
    api.calls.filter((call) => call.path === `/api/tasks/${task.id}`),
  ).toHaveLength(1);
  expect(
    api.calls.filter((call) => call.path === `/api/tasks/${task.id}/history`),
  ).toHaveLength(1);
  expect(
    api.calls.some((call) => call.path.includes('eligible-task-assignees')),
  ).toBe(false);
  expect(
    within(projects).queryByText('Listed preparation label'),
  ).not.toBeInTheDocument();
  expect(window.location.href).not.toContain(task.id);
  expect(JSON.stringify(window.history.state)).not.toContain(project.id);
  expect(
    screen.queryByRole('region', { name: 'Blocked Tasks' }),
  ).not.toBeInTheDocument();
  api.state.queueRows = [];
  navigate('Blocked Tasks');
  expect(
    await screen.findByText(
      'No current blocked Tasks are readable in this Company.',
    ),
  ).toBeVisible();
  expect(
    api.calls
      .filter((call) => call.path === '/api/blocked-tasks')
      .map((call) => call.offset),
  ).toEqual([0, 0]);
  expect(api.calls.every((call) => call.method === 'GET')).toBe(true);
});

it.each(['closed Project', 'historical original Client'] as const)(
  'opens a discoverable Task as existing read-only detail for a %s',
  async (kind) => {
    const api = installServer();
    api.state.mutable = false;
    api.state.closed = kind === 'closed Project';
    api.state.actor = {
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        ...company,
        taskPermissions: ['task.read', 'task.manage'],
      },
    };
    render(<App identity={deterministicBrowserIdentity()} />);
    await ready();
    fireEvent.click(
      within(queue()).getByRole('button', { name: /^Open Undated exact/u }),
    );
    const tasks = await screen.findByRole('region', { name: 'Tasks' });
    expect(
      await within(tasks).findByRole('heading', { name: task.title }),
    ).toBeVisible();
    expect(
      within(tasks).getByText(
        kind === 'closed Project'
          ? 'Read-only: this Project is closed. Task history remains available.'
          : 'Read-only: the original Client has been superseded. Task history remains available.',
      ),
    ).toBeVisible();
    expect(
      within(tasks).queryByRole('button', { name: 'Save Task' }),
    ).not.toBeInTheDocument();
    expect(
      api.calls.some((call) => call.path.includes('eligible-task-assignees')),
    ).toBe(false);
    expect(api.calls.every((call) => call.method === 'GET')).toBe(true);
  },
);

it('retires a held queue when navigating away and starts zero on return', async () => {
  const api = installServer();
  api.state.hold = true;
  render(<App identity={deterministicBrowserIdentity()} />);
  await waitFor(() => expect(api.held).toHaveLength(1));
  navigate('Projects');
  await waitFor(() => expect(api.held[0]?.signal?.aborted).toBe(true));
  api.state.hold = false;
  await api.release();
  expect(
    screen.queryByRole('heading', { name: task.title }),
  ).not.toBeInTheDocument();
  navigate('Blocked Tasks');
  await ready();
  expect(
    api.calls
      .filter((call) => call.path === '/api/blocked-tasks')
      .map((call) => call.offset),
  ).toEqual([0, 0]);
});

it('retires Company A rows and late replies across Company switching without replaying an opening', async () => {
  const api = installServer();
  api.state.hold = true;
  render(<App identity={deterministicBrowserIdentity()} />);
  await waitFor(() => expect(api.held).toHaveLength(1));
  api.state.hold = false;
  changeValue(
    screen.getByLabelText('Active Company', { exact: true }),
    otherCompany.id,
  );
  await screen.findByText(
    'No current blocked Tasks are readable in this Company.',
  );
  expect(api.held[0]?.signal?.aborted).toBe(true);
  await api.release();
  expect(
    screen.queryByRole('heading', { name: task.title }),
  ).not.toBeInTheDocument();
  expect(
    api.calls.some((call) => call.path === `/api/projects/${project.id}`),
  ).toBe(false);
});

it.each(['identity replacement', 'signed-out session'] as const)(
  'retires pending rows through the real App after %s and cannot revive them on return',
  async (change) => {
    const api = installServer();
    api.state.hold = true;
    const initial = deterministicBrowserIdentity();
    const view = render(<App identity={initial} />);
    await waitFor(() => expect(api.held).toHaveLength(1));
    api.state.hold = false;
    api.state.queueRows = [{ ...task, title: 'Replacement session Task' }];
    api.state.actor = {
      ...actor,
      internalUserId: 'replacement-reader',
      workspaceMembershipId: 'replacement-member',
    };
    const replacement = deterministicBrowserIdentity();
    view.rerender(
      <App
        identity={
          change === 'signed-out session'
            ? {
                ...replacement,
                signedIn: false,
                signedOutView: <p>Session ended</p>,
              }
            : replacement
        }
      />,
    );
    await waitFor(() => expect(api.held[0]?.signal?.aborted).toBe(true));
    if (change === 'signed-out session') {
      expect(screen.getByText('Session ended')).toBeVisible();
      view.rerender(<App identity={replacement} />);
    }
    await screen.findByRole('heading', { name: 'Replacement session Task' });
    await api.release();
    expect(
      screen.queryByRole('heading', { name: task.title }),
    ).not.toBeInTheDocument();
    expect(
      api.calls.filter((call) => call.path === '/api/blocked-tasks'),
    ).toHaveLength(2);
  },
);

it.each(
  ['Company', 'session', 'grant'].flatMap((change) =>
    [200, 403].map((status) => ({ change, status })),
  ),
)(
  'suppresses late$status across actual App $change A→B→A without stale opening',
  async ({ change, status }) => {
    const api = installServer();
    api.state.hold = true;
    api.state.queueStatus = status;
    const original = deterministicBrowserIdentity(),
      replacement = deterministicBrowserIdentity();
    const view = render(<App identity={original} />);
    await waitFor(() => expect(api.held).toHaveLength(1));
    api.state.hold = false;
    api.state.queueStatus = 200;
    if (change === 'Company') {
      changeValue(
        screen.getByLabelText('Active Company', { exact: true }),
        otherCompany.id,
      );
      await screen.findByText(
        'No current blocked Tasks are readable in this Company.',
      );
    } else {
      api.state.queueRows = [{ ...task, title: 'Other current session' }];
      api.state.actor =
        change === 'session'
          ? {
              ...actor,
              internalUserId: 'other-person',
              workspaceMembershipId: 'other-membership',
            }
          : {
              ...actor,
              activeCompany: {
                ...actor.activeCompany,
                ...company,
                taskPermissions: [],
              },
            };
      view.rerender(<App identity={replacement} />);
      if (change === 'session')
        await screen.findByRole('heading', { name: 'Other current session' });
      else
        await waitFor(() => {
          expect(
            screen.getByRole('navigation', { name: 'Primary navigation' }),
          ).toBeVisible();
          expect(
            screen.queryByRole('link', { name: 'Blocked Tasks' }),
          ).not.toBeInTheDocument();
        });
    }
    expect(api.held[0]?.signal?.aborted).toBe(true);
    api.state.actor = actor;
    api.state.queueRows = [{ ...task, title: 'Current A after round trip' }];
    if (change === 'Company')
      changeValue(
        screen.getByLabelText('Active Company', { exact: true }),
        company.id,
      );
    else view.rerender(<App identity={original} />);
    await screen.findByRole('heading', { name: 'Current A after round trip' });
    await api.release();
    expect(
      screen.getByRole('heading', { name: 'Current A after round trip' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('heading', { name: task.title }),
    ).not.toBeInTheDocument();
    expect(
      api.calls.some((call) => call.path === `/api/projects/${project.id}`),
    ).toBe(false);
  },
);

it.each(['task', 'project', 'client', 'captured version'])(
  'withholds the actual App entry without underlying %s read authority',
  async (kind) => {
    const api = installServer();
    api.state.actor = {
      ...actor,
      activeCompany: {
        ...actor.activeCompany,
        ...company,
        ...(kind === 'task' ? { taskPermissions: [] } : {}),
        ...(kind === 'project' ? { projectPermissions: [] } : {}),
        ...(kind === 'client' ? { clientPermissions: [] } : {}),
      },
    };
    if (kind === 'captured version')
      api.state.actorResponse = (value) => ({
        ...value,
        activeCompany: {
          ...value.activeCompany,
          taskPermissionSetVersion: 'unknown',
        },
      });
    render(<App identity={deterministicBrowserIdentity()} />);
    if (kind === 'captured version') {
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'We could not verify your access. Please try again.',
      );
      expect(
        screen.queryByRole('navigation', { name: 'Primary navigation' }),
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    } else {
      const navigation = await screen.findByRole('navigation', {
        name: 'Primary navigation',
      });
      expect(
        within(navigation).queryByRole('link', {
          name: 'Blocked Tasks',
        }),
      ).not.toBeInTheDocument();
    }
    expect(api.calls.some((call) => call.path === '/api/blocked-tasks')).toBe(
      false,
    );
    expect(
      screen.queryByRole('heading', { name: task.title }),
    ).not.toBeInTheDocument();
  },
);

it('preserves the exact pending and uncertain native creation across discovery/opening and retries only its original intent', async () => {
  const api = installServer();
  api.state.actor = {
    ...actor,
    activeCompany: {
      ...actor.activeCompany,
      ...company,
      taskPermissions: ['task.read', 'task.manage'],
    },
  };
  window.history.replaceState(null, '', '/?frame=prisme#projects');
  const writes: Array<{ body: string | undefined; key: string | null }> = [];
  let release: ((response: Response) => void) | undefined;
  api.state.writeReply = async (init) => {
    writes.push({
      body: typeof init.body === 'string' ? init.body : undefined,
      key: new Headers(init.headers).get('idempotency-key'),
    });
    if (writes.length === 1)
      return new Promise<Response>((resolve) => {
        release = resolve;
      });
    const created: TaskView = {
      description: null,
      id: 'created-task',
      companyId: company.id,
      projectId: project.id,
      clientAccountId: project.clientAccountId,
      title: 'Independent native creation DEMO',
      assignee: null,
      dueDate: null,
      priority: 'normal',
      status: 'todo',
      completion: null,
      version: 1,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      createdBy: task.createdBy,
    };
    api.state.createdTask = created;
    return Response.json(created, { status: 201 });
  };
  render(<App identity={deterministicBrowserIdentity()} />);
  const projects = await screen.findByRole('region', { name: 'Projects' });
  fireEvent.click(
    await within(projects).findByRole('button', {
      name: `${project.title} Client: ${project.clientDisplayName}`,
    }),
  );
  const title = await screen.findByRole('textbox', { name: 'Task title' });
  await waitFor(() => expect(title).toBeEnabled());
  fireEvent.change(title, {
    target: { value: 'Independent native creation DEMO' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create Task' }));
  await waitFor(() => expect(writes).toHaveLength(1));
  navigate('Blocked Tasks');
  await ready();
  fireEvent.click(
    within(queue()).getByRole('button', { name: /^Open Undated exact/u }),
  );
  await waitFor(() => expect(window.location.hash).toBe('#projects'));
  expect(screen.getByRole('textbox', { name: 'Task title' })).toHaveValue(
    'Independent native creation DEMO',
  );
  expect(screen.getByRole('textbox', { name: 'Task title' })).toBeDisabled();
  expect(api.calls.some((call) => call.path === `/api/tasks/${task.id}`)).toBe(
    false,
  );
  const complete = release;
  if (!complete) throw new Error('Held native public command required.');
  await act(async () => complete(new Response(null, { status: 503 })));
  const retry = await screen.findByRole('button', {
    name: 'Retry pending Task change',
  });
  fireEvent.click(retry);
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1]).toEqual(writes[0]);
  expect(JSON.parse(writes[1]?.body ?? '{}')).toMatchObject({
    title: 'Independent native creation DEMO',
  });
  await screen.findByRole('heading', {
    name: 'Independent native creation DEMO',
  });
});
