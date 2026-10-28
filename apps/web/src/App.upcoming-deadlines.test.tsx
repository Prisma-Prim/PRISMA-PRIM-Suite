import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from './test/render-with-interface-locale';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { deterministicBrowserIdentity } from './access-composition';
import type { ActorContext } from './access-types';
import { changeValue } from './test/select-option';

const company = { id: 'company-upcoming', displayName: 'PRISMA-PRIM' };
const otherCompany = { id: 'company-other', displayName: 'BIC' };
const project = {
  id: 'project-upcoming',
  title: 'Preparation – Știință / Имя',
  clientAccountId: 'client-upcoming',
  clientDisplayName: 'Literal {Client}',
  companyId: company.id,
  clientDossierId: 'client-upcoming',
  status: 'preparatory',
  createdAt: '2026-09-19T08:00:00.000Z',
};
const author = {
  internalUserId: 'ada',
  workspaceMembershipId: 'member-ada',
  displayName: 'Ada',
};
function task(index: number) {
  return {
    description: null,
    id: `task-${String(index).padStart(2, '0')}`,
    title: `Task ${String(index).padStart(2, '0')} — Literal`,
    companyId: company.id,
    projectId: project.id,
    clientAccountId: project.clientAccountId,
    assignee: {
      workspaceMembershipId: author.workspaceMembershipId,
      displayLabel: 'Ada',
    },
    dueDate: index === 25 ? '2026-10-04' : '2026-09-27',
    priority: 'important',
    status: 'todo',
    completion: null,
    version: 1,
    createdAt: '2026-09-19T09:00:00.000Z',
    updatedAt: '2026-09-19T09:00:00.000Z',
    createdBy: author,
    project: {
      id: project.id,
      title: project.title,
      clientDisplayName: project.clientDisplayName,
    },
  };
}
function actor(companyId = company.id): ActorContext {
  return {
    ...author,
    workspaceId: 'workspace',
    workspaceName: 'Workspace',
    email: 'ada@example.test',
    active: true,
    workspacePermissions: [],
    activeCompany: {
      ...(companyId === company.id ? company : otherCompany),
      clientPermissions: ['client.read'],
      clientPermissionAssignmentId: 'client-grant',
      clientPermissionSetVersion: 'v1',
      projectPermissions: ['project.read'],
      taskPermissions: ['task.read', 'task.manage'],
      taskPermissionAssignmentId: 'task-grant',
      taskPermissionSetVersion: 'v1',
    },
  };
}
function server() {
  const state = {
    total: 26,
    today: '2026-09-27',
    throughDate: '2026-10-04',
    status: 200,
    searchStatus: 200,
    actor: (companyId: string) => actor(companyId),
    transform: (value: unknown): unknown => value,
  };
  const calls: Array<{
    path: string;
    offset: number;
    companyId: string | null;
  }> = [];
  const held: Array<{
    answer: (response: Response) => void;
    response: Response;
    signal: AbortSignal | null | undefined;
  }> = [];
  let hold = false;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input.toString(), window.location.origin);
      const companyId =
        new Headers(init?.headers).get('x-company-context-id') ?? company.id;
      if (url.pathname === '/api/access/current-actor')
        return Response.json(state.actor(companyId));
      if (url.pathname === '/api/companies')
        return Response.json([company, otherCompany]);
      if (url.pathname === '/api/activity-log')
        return Response.json({ events: [] });
      if (url.pathname === '/api/operational-home')
        return Response.json({
          companyId,
          today: state.today,
          summaries: state
            .actor(companyId)
            .activeCompany?.taskPermissions?.includes('task.read')
            ? [{ kind: 'overdue_tasks', count: 0 }]
            : [],
        });
      if (url.pathname === '/api/due-soon-tasks') {
        const offset = Number(url.searchParams.get('offset') ?? 0);
        calls.push({ path: url.pathname, offset, companyId });
        const value = {
          companyId,
          today: state.today,
          throughDate: state.throughDate,
          total: state.total,
          offset,
          pageSize: 25,
          tasks: Array.from(
            { length: Math.min(25, Math.max(0, state.total - offset)) },
            (_, index) => ({
              ...task(offset + index),
              dueDate: offset + index === 25 ? state.throughDate : state.today,
            }),
          ),
        };
        const response =
          state.status === 200
            ? Response.json(state.transform(value))
            : new Response(null, { status: state.status });
        if (hold)
          return new Promise<Response>((answer) =>
            held.push({ answer, response, signal: init?.signal }),
          );
        return response;
      }
      if (url.pathname === '/api/projects') return Response.json([project]);
      if (url.pathname === `/api/projects/${project.id}`)
        return Response.json(project);
      if (url.pathname === `/api/projects/${project.id}/tasks`)
        return Response.json({
          mutable: true,
          tasks: Array.from({ length: 26 }, (_, index) => task(index)),
        });
      if (url.pathname === `/api/tasks/task-25`)
        return Response.json({ mutable: true, task: task(25) });
      if (url.pathname.endsWith('/history'))
        return Response.json({ events: [] });
      if (url.pathname.endsWith('eligible-task-assignees'))
        return Response.json({ members: [] });
      if (url.pathname === '/api/assigned-tasks')
        return Response.json({ tasks: [] });
      if (url.pathname === '/api/clients/search')
        return state.searchStatus === 403
          ? new Response(null, { status: 403 })
          : Response.json([]);
      if (url.pathname === '/api/clients') return Response.json([]);
      return new Response(null, { status: 404 });
    }),
  );
  return {
    state,
    calls,
    held,
    hold: () => {
      hold = true;
    },
    unhold: () => {
      hold = false;
    },
    release: async () => {
      const next = held.shift();
      if (!next) throw new Error('Expected held request');
      await act(async () => {
        next.answer(next.response);
      });
    },
  };
}
const originalScrollIntoView = Element.prototype.scrollIntoView;
const trigger = () =>
  screen.getByRole('button', { name: 'Show my upcoming deadlines' });
const panel = () =>
  screen.getByRole('region', { name: 'My upcoming deadlines — PRISMA-PRIM' });
async function open() {
  fireEvent.click(
    await screen.findByRole('button', { name: 'Show my upcoming deadlines' }),
  );
  await within(panel()).findByText('Task 00 — Literal');
}
describe('Personal upcoming deadlines through App', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');
    Element.prototype.scrollIntoView = vi.fn();
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
  });
  afterEach(() => {
    Element.prototype.scrollIntoView = originalScrollIntoView;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/');
  });
  it('opens the complete lazy page, traverses the last row and restores focus on close', async () => {
    const api = server();
    render(<App identity={deterministicBrowserIdentity()} />);
    await screen.findByRole('button', { name: 'Show my upcoming deadlines' });
    expect(api.calls).toHaveLength(0);
    await open();
    expect(within(panel()).getAllByRole('listitem')).toHaveLength(25);
    expect(trigger()).toHaveAttribute('aria-controls', panel().id);
    expect(within(panel()).getByRole('heading', { level: 4 })).toHaveFocus();
    expect(
      within(panel()).getByRole('button', { name: 'Previous page' }),
    ).toBeDisabled();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Next page' }));
    await within(panel()).findByText('Task 25 — Literal');
    expect(within(panel()).getAllByRole('listitem')).toHaveLength(1);
    expect(
      within(panel()).getByRole('button', { name: 'Next page' }),
    ).toBeDisabled();
    fireEvent.click(
      within(panel()).getByRole('button', {
        name: 'Close my upcoming deadlines',
      }),
    );
    expect(trigger()).toHaveFocus();
    expect(api.calls.map((call) => call.offset)).toEqual([0, 25]);
  });
  it('opens the exact Task from the last page through the owning Project panel', async () => {
    const api = server();
    render(<App identity={deterministicBrowserIdentity()} />);
    await open();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Next page' }));
    await within(panel()).findByText('Task 25 — Literal');
    fireEvent.click(
      within(panel()).getByRole('button', { name: /^Open Task 25/u }),
    );
    const detail = await screen.findByRole('article', {
      name: project.title,
    });
    expect(detail).toBeVisible();
    const tasksRegion = await screen.findByRole('region', {
      name: 'Tasks',
    });
    await within(tasksRegion).findByRole('heading', {
      name: 'Task 25 — Literal',
    });
    expect(window.location.hash).toBe('#projects');
    expect(window.location.href).not.toMatch(/task-25|project-upcoming/u);
    expect(api.calls.map((call) => call.offset)).toEqual([0, 25]);
  });
  it('preserves legitimate server order when sub-millisecond creation times have equal public ISO values and reversed ids', async () => {
    const api = server();
    api.state.total = 2;
    api.state.transform = (value) => {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Expected fixture object');
      return { ...value, tasks: [task(1), task(0)] };
    };
    render(<App identity={deterministicBrowserIdentity()} />);
    await open();
    expect(
      within(panel())
        .getAllByRole('heading', { level: 5 })
        .map((heading) => heading.textContent),
    ).toEqual(['Task 01 — Literal', 'Task 00 — Literal']);
    expect(within(panel()).getAllByRole('listitem')).toHaveLength(2);
  });
  it('clears failed later pages, retries their offset, refreshes zero and restarts zero at server-date rollover', async () => {
    const api = server();
    render(<App identity={deterministicBrowserIdentity()} />);
    await open();
    api.state.status = 503;
    fireEvent.click(within(panel()).getByRole('button', { name: 'Next page' }));
    await within(panel()).findByRole('alert');
    expect(within(panel()).queryAllByRole('listitem')).toHaveLength(0);
    expect(panel()).not.toHaveTextContent('Showing 1–25');
    api.state.status = 200;
    fireEvent.click(
      within(panel()).getByRole('button', { name: 'Retry loading deadlines' }),
    );
    await within(panel()).findByText('Task 25 — Literal');
    expect(api.calls.map((call) => call.offset)).toEqual([0, 25, 25]);
    fireEvent.click(
      within(panel()).getByRole('button', { name: 'Refresh deadlines' }),
    );
    await within(panel()).findByText('Task 00 — Literal');
    api.state.today = '2026-09-28';
    api.state.throughDate = '2026-10-05';
    fireEvent.click(within(panel()).getByRole('button', { name: 'Next page' }));
    await waitFor(() =>
      expect(api.calls.map((call) => call.offset)).toEqual([
        0, 25, 25, 0, 25, 0,
      ]),
    );
    await within(panel()).findByText('Task 00 — Literal');
    expect(
      within(panel()).queryByText('Task 25 — Literal'),
    ).not.toBeInTheDocument();
    expect(panel().querySelector('time')).toHaveAttribute(
      'dateTime',
      '2026-09-28',
    );
  });

  it('retires a held reply on close and a newer request without restoring stale rows', async () => {
    const api = server();
    api.state.total = 1;
    api.hold();
    render(<App identity={deterministicBrowserIdentity()} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Show my upcoming deadlines' }),
    );
    await waitFor(() => expect(api.held).toHaveLength(1));
    fireEvent.click(
      within(panel()).getByRole('button', {
        name: 'Close my upcoming deadlines',
      }),
    );
    fireEvent.click(trigger());
    await waitFor(() => expect(api.held).toHaveLength(2));
    await api.release();
    expect(within(panel()).queryAllByRole('listitem')).toHaveLength(0);
    expect(within(panel()).getByRole('status')).toHaveTextContent(
      'Loading your deadlines',
    );
    await api.release();
    await within(panel()).findByText('Task 00 — Literal');
  });

  it('retires a held page on Company change and does not reuse its rows in the new Company', async () => {
    const api = server();
    api.hold();
    render(<App identity={deterministicBrowserIdentity()} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Show my upcoming deadlines' }),
    );
    await waitFor(() => expect(api.held).toHaveLength(1));
    changeValue(
      screen.getByLabelText('Active Company', { exact: true }),
      otherCompany.id,
    );
    await waitFor(() =>
      expect(
        screen.getByLabelText('Active Company', { exact: true }),
      ).toHaveValue(otherCompany.id),
    );
    await api.release();
    expect(screen.queryByText('Task 00 — Literal')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('region', {
        name: 'My upcoming deadlines — PRISMA-PRIM',
      }),
    ).not.toBeInTheDocument();
    api.unhold();
    api.state.total = 0;
    fireEvent.click(
      await screen.findByRole('button', { name: 'Show my upcoming deadlines' }),
    );
    const other = screen.getByRole('region', {
      name: 'My upcoming deadlines — BIC',
    });
    await within(other).findByText(
      'You have no open Tasks in this date range.',
    );
    expect(api.calls.map((call) => call.companyId)).toEqual([
      company.id,
      otherCompany.id,
    ]);
  });

  it('retires replies after captured authority or membership changes and after a new session owner', async () => {
    window.history.replaceState(null, '', '/?frame=classic');
    const api = server();
    api.hold();
    const view = render(<App identity={deterministicBrowserIdentity()} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Show my upcoming deadlines' }),
    );
    await waitFor(() => expect(api.held).toHaveLength(1));
    api.state.actor = (companyId: string) => {
      const current = actor(companyId);
      if (!current.activeCompany) throw new Error('Expected Company');
      return {
        ...current,
        activeCompany: { ...current.activeCompany, taskPermissions: [] },
      };
    };
    api.state.searchStatus = 403;
    changeValue(screen.getByLabelText('Find a shared Client'), 'Synthetic');
    const search = screen.getByRole('button', {
      name: 'Search Clients',
    });
    await waitFor(() => expect(search).toBeEnabled());
    fireEvent.click(search);
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Show my upcoming deadlines' }),
      ).not.toBeInTheDocument(),
    );
    expect(api.held[0]?.signal?.aborted).toBe(true);
    await api.release();
    expect(screen.queryByText('Task 00 — Literal')).not.toBeInTheDocument();
    api.state.actor = (companyId: string) => actor(companyId);
    view.rerender(<App identity={deterministicBrowserIdentity()} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Show my upcoming deadlines' }),
    );
    await waitFor(() => expect(api.held).toHaveLength(1));
    api.state.actor = (companyId: string) => ({
      ...actor(companyId),
      workspaceMembershipId: 'replacement-membership',
    });
    view.rerender(<App identity={deterministicBrowserIdentity()} />);
    expect(api.held[0]?.signal?.aborted).toBe(true);
    await api.release();
    expect(screen.queryByText('Task 00 — Literal')).not.toBeInTheDocument();
  });

  it('retires a pending page when the current Home read withdraws Task access', async () => {
    const api = server();
    render(<App identity={deterministicBrowserIdentity()} />);
    await open();
    api.hold();
    fireEvent.click(
      within(panel()).getByRole('button', { name: 'Refresh deadlines' }),
    );
    await waitFor(() => expect(api.held).toHaveLength(1));
    api.state.actor = (companyId: string) => {
      const current = actor(companyId);
      if (!current.activeCompany) throw new Error('Expected Company');
      return {
        ...current,
        activeCompany: { ...current.activeCompany, taskPermissions: [] },
      };
    };
    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh Company summary' }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Show my upcoming deadlines' }),
      ).not.toBeInTheDocument(),
    );
    await api.release();
    expect(screen.queryByText('Task 00 — Literal')).not.toBeInTheDocument();
  });

  it('suppresses a held later page after a newer refresh on the same panel', async () => {
    const api = server();
    render(<App identity={deterministicBrowserIdentity()} />);
    await open();
    api.hold();
    fireEvent.click(within(panel()).getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(api.held).toHaveLength(1));
    fireEvent.click(
      within(panel()).getByRole('button', { name: 'Refresh deadlines' }),
    );
    await waitFor(() => expect(api.held).toHaveLength(2));
    await api.release();
    expect(
      within(panel()).queryByText('Task 25 — Literal'),
    ).not.toBeInTheDocument();
    expect(within(panel()).queryAllByRole('listitem')).toHaveLength(0);
    await api.release();
    await within(panel()).findByText('Task 00 — Literal');
    expect(within(panel()).getAllByRole('listitem')).toHaveLength(25);
    expect(api.calls.map((call) => call.offset)).toEqual([0, 25, 0]);
  });

  it('removes rows and actions when the real session is rejected', async () => {
    const api = server();
    const view = render(<App identity={deterministicBrowserIdentity()} />);
    await open();
    api.state.status = 401;
    fireEvent.click(
      within(panel()).getByRole('button', { name: 'Refresh deadlines' }),
    );
    await waitFor(() =>
      expect(sessionStorage.getItem('deterministic-auth-state')).toBe(
        'signed-out',
      ),
    );
    expect(screen.queryByText('Task 00 — Literal')).not.toBeInTheDocument();
    expect(within(panel()).queryAllByRole('listitem')).toHaveLength(0);
    view.rerender(<App identity={deterministicBrowserIdentity()} />);
    await waitFor(() =>
      expect(
        screen.queryByRole('button', { name: 'Show my upcoming deadlines' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('keeps genuine empty, out-of-range and forbidden states distinct', async () => {
    const api = server();
    api.state.total = 0;
    render(<App identity={deterministicBrowserIdentity()} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Show my upcoming deadlines' }),
    );
    await within(panel()).findByText(
      'You have no open Tasks in this date range.',
    );
    api.state.total = 26;
    fireEvent.click(
      within(panel()).getByRole('button', { name: 'Refresh deadlines' }),
    );
    await within(panel()).findByText('Task 00 — Literal');
    api.state.total = 2;
    fireEvent.click(within(panel()).getByRole('button', { name: 'Next page' }));
    await within(panel()).findByText(
      'This page no longer contains Tasks. Go back or refresh the list.',
    );
    expect(
      within(panel()).getByRole('button', { name: 'Previous page' }),
    ).toBeEnabled();
    api.state.status = 403;
    fireEvent.click(
      within(panel()).getByRole('button', { name: 'Refresh deadlines' }),
    );
    await within(panel()).findByText(
      'Deadlines are unavailable with your current access.',
    );
    expect(within(panel()).queryAllByRole('listitem')).toHaveLength(0);
    expect(within(panel()).queryByText(/Total:/u)).not.toBeInTheDocument();
  });

  it.each([
    { name: 'foreign Company', value: { companyId: 'foreign' } },
    { name: 'incorrect date range', value: { throughDate: '2026-10-05' } },
    { name: 'wrong offset', value: { offset: 25 } },
    { name: 'unsupported page size', value: { pageSize: 100 } },
    { name: 'inconsistent total', value: { total: 0 } },
    {
      name: 'foreign assignee',
      value: {
        tasks: [
          {
            ...task(0),
            assignee: {
              workspaceMembershipId: 'colleague',
              displayLabel: 'Other',
            },
          },
        ],
      },
    },
    {
      name: 'closed Task',
      value: {
        tasks: [
          {
            ...task(0),
            status: 'done',
            completion: {
              actor: author,
              occurredAt: '2026-09-27T10:00:00.000Z',
            },
          },
        ],
      },
    },
    {
      name: 'outside date window',
      value: { tasks: [{ ...task(0), dueDate: '2026-10-05' }] },
    },
    { name: 'duplicate Task', value: { total: 2, tasks: [task(0), task(0)] } },
    {
      name: 'unordered dates',
      value: { total: 2, tasks: [task(25), task(0)] },
    },
    {
      name: 'unordered creation times',
      value: {
        total: 2,
        tasks: [
          {
            ...task(0),
            createdAt: '2026-09-19T09:00:01.000Z',
            updatedAt: '2026-09-19T09:00:01.000Z',
          },
          task(1),
        ],
      },
    },
  ])('refuses $name before exposing any rows or count', async ({ value }) => {
    const api = server();
    api.state.total = 1;
    api.state.transform = (unknown) => {
      if (!unknown || typeof unknown !== 'object' || Array.isArray(unknown))
        throw new Error('Expected fixture object');
      return { ...unknown, ...value };
    };
    render(<App identity={deterministicBrowserIdentity()} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Show my upcoming deadlines' }),
    );
    await within(panel()).findByRole('alert');
    expect(within(panel()).queryAllByRole('listitem')).toHaveLength(0);
    expect(panel()).not.toHaveTextContent('Total:');
    expect(panel()).not.toHaveTextContent('Task 00 — Literal');
  });
});
