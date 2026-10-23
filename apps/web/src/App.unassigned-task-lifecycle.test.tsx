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
  id: 'exact-task',
  companyId: company.id,
  projectId: project.id,
  clientAccountId: project.clientAccountId,
  title: 'Undated exact preparation',
  assignee: null,
  dueDate: null,
  priority: 'important',
  status: 'todo',
  completion: null,
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
  } = {
    actor,
    hold: false,
    queueRows: [task],
    currentTask: task,
    mutable: true,
    closed: false,
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
      if (path === '/api/access/current-actor')
        return Response.json({
          ...state.actor,
          activeCompany: { ...state.actor.activeCompany, ...currentCompany },
        });
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
      if (path === '/api/unassigned-tasks') {
        const response = Response.json({
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
      if (path === `/api/projects/${project.id}/tasks`)
        return Response.json({
          mutable: state.mutable,
          tasks: [state.currentTask],
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
  localStorage.clear();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/?frame=prisme#unassigned-tasks');
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  Element.prototype.scrollIntoView = scroll;
  window.history.replaceState(null, '', '/');
});
const queue = () => screen.getByRole('region', { name: 'Unassigned Tasks' });
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
    screen.queryByRole('region', { name: 'Unassigned Tasks' }),
  ).not.toBeInTheDocument();
  api.state.queueRows = [];
  navigate('Unassigned Tasks');
  expect(
    await screen.findByText(
      'No readable open unassigned Tasks in this Company.',
    ),
  ).toBeVisible();
  expect(
    api.calls
      .filter((call) => call.path === '/api/unassigned-tasks')
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
  navigate('Unassigned Tasks');
  await ready();
  expect(
    api.calls
      .filter((call) => call.path === '/api/unassigned-tasks')
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
  await screen.findByText('No readable open unassigned Tasks in this Company.');
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
      api.calls.filter((call) => call.path === '/api/unassigned-tasks'),
    ).toHaveLength(2);
  },
);
