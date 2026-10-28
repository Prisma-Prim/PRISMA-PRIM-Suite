import {
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
import { changeValue } from './test/select-option';
import { preparatoryLifecycle } from './project/project-lifecycle.test-fixtures';
import { CurrentWorkLocaleProbe } from './mission-plan/current-work-app.test-support';
import { teamTasksQueryFixture } from './project/team-tasks.test-fixture';

const f = teamTasksQueryFixture();
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
  window.history.replaceState(null, '', '/#team-tasks');
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});
function server() {
  const calls: URL[] = [];
  const state: {
    status: number;
    page: unknown;
    actor: ActorContext;
    hold: ((resolve: (r: Response) => void) => void) | null;
    pages: Map<number, unknown>;
    currentTask: typeof f.task;
    writes: { path: string; body: string; key: string | null }[];
    writeStatus: number;
    actorHold: ((resolve: (r: Response) => void) => void) | null;
  } = {
    status: 200,
    page: f.page,
    actor: f.actor,
    hold: null,
    pages: new Map(),
    currentTask: f.task,
    writes: [],
    writeStatus: 503,
    actorHold: null,
  };
  const project = {
    ...f.task.project,
    companyId: f.company.id,
    clientAccountId: f.task.clientAccountId,
    status: 'preparatory',
    createdAt: f.task.createdAt,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const u = new URL(input.toString(), window.location.origin);
      calls.push(u);
      if (u.pathname === '/api/access/current-actor') {
        if (state.actorHold) {
          const hold = state.actorHold;
          state.actorHold = null;
          return new Promise<Response>(hold);
        }
        return Response.json(state.actor);
      }
      if (u.pathname === '/api/companies') return Response.json([f.company]);
      if (u.pathname === '/api/activity-log')
        return Response.json({ events: [] });
      if (u.pathname === '/api/clients') return Response.json([]);
      if (u.pathname === '/api/projects') return Response.json([project]);
      if (u.pathname === `/api/projects/${project.id}`)
        return Response.json(project);
      if (u.pathname.endsWith('/lifecycle'))
        return Response.json(preparatoryLifecycle);
      if (u.pathname.endsWith('/eligible-task-assignees'))
        return Response.json({ members: [f.task.assignee] });
      if (u.pathname === `/api/projects/${project.id}/tasks`)
        return Response.json({ mutable: true, tasks: [state.currentTask] });
      if (u.pathname === `/api/tasks/${f.task.id}/history`)
        return Response.json({ events: [] });
      if (u.pathname === `/api/tasks/${f.task.id}`) {
        if (init.method === 'PATCH') {
          state.writes.push({
            path: u.pathname,
            body: String(init.body),
            key: new Headers(init.headers).get('idempotency-key'),
          });
          return Response.json(
            state.writeStatus === 200 ? state.currentTask : {},
            { status: state.writeStatus },
          );
        }
        return Response.json({ mutable: true, task: state.currentTask });
      }
      if (u.pathname === '/api/assigned-tasks')
        return Response.json({ tasks: [] });
      if (u.pathname === '/api/operational-home')
        return Response.json({
          companyId: f.company.id,
          today: '2026-10-28',
          summaries: [],
        });
      if (u.pathname === '/api/team-tasks') {
        if (state.hold) return new Promise<Response>(state.hold);
        return state.status === 200
          ? Response.json(
              state.pages.get(Number(u.searchParams.get('offset'))) ??
                state.page,
            )
          : new Response(null, { status: state.status });
      }
      throw new Error('Unexpected request ' + u.pathname);
    }),
  );
  return { calls, state };
}
it('enters the actual App and applies literal criteria only deliberately', async () => {
  const api = server();
  render(<App identity={deterministicBrowserIdentity()} />);
  const region = await screen.findByRole('region', { name: 'Team Tasks' });
  await within(region).findByRole('heading', { name: f.task.title });
  const count = api.calls.length;
  changeValue(
    within(region).getByRole('combobox', { name: 'Responsibility' }),
    'name',
  );
  fireEvent.change(within(region).getByLabelText('Responsible name contains'), {
    target: { value: '  ȘTEFAN  ' },
  });
  expect(api.calls).toHaveLength(count);
  api.state.page = {
    ...f.page,
    appliedFilters: {
      ...f.page.appliedFilters,
      responsibility: 'name',
      assigneeName: 'ȘTEFAN',
    },
  };
  fireEvent.click(
    within(region).getByRole('button', { name: 'Apply criteria' }),
  );
  await waitFor(() =>
    expect(
      api.calls.filter((u) => u.pathname === '/api/team-tasks'),
    ).toHaveLength(2),
  );
  await within(region).findByRole('heading', { name: f.task.title });
  expect(api.calls.at(-1)?.searchParams.get('assigneeName')).toBe('ȘTEFAN');
});

function navigate(name: string) {
  fireEvent.click(
    within(
      screen.getByRole('navigation', { name: 'Primary navigation' }),
    ).getByRole('link', { name }),
  );
}
const region = () => screen.getByRole('region', { name: 'Team Tasks' });
async function ready() {
  await within(
    await screen.findByRole('region', { name: 'Team Tasks' }),
  ).findAllByRole('heading', { name: f.task.title });
}
it.each(['classic', 'prisme'])(
  'retains literal draft/applied criteria/page through actual hidden %s panels and reads freshly on return',
  async (frame) => {
    window.history.replaceState(null, '', `/?frame=${frame}#team-tasks`);
    const api = server();
    const first = {
      ...f.page,
      hasNextPage: true,
      tasks: Array.from({ length: 25 }, (_, i) => ({
        ...f.task,
        id: f.id(String(100 + i)),
      })),
    };
    api.state.page = first;
    api.state.pages.set(25, { ...f.page, offset: 25 });
    render(<App identity={deterministicBrowserIdentity()} />);
    await ready();
    fireEvent.click(
      within(region()).getByRole('button', { name: 'Next page' }),
    );
    await waitFor(() =>
      expect(within(region()).getAllByRole('listitem')).toHaveLength(1),
    );
    changeValue(
      within(region()).getByRole('combobox', { name: 'Responsibility' }),
      'name',
    );
    const draft = within(region()).getByLabelText('Responsible name contains');
    fireEvent.change(draft, { target: { value: '  Unsaved literal Ж  ' } });
    fireEvent.click(
      within(region()).getByRole('button', { name: /^Open Exact team work/ }),
    );
    const projects = await screen.findByRole('region', { name: 'Projects' });
    await within(projects).findByDisplayValue(f.task.title);
    expect(regionHidden().contains(draft)).toBe(true);
    expect(draft).toBeInTheDocument();
    const nativeTitle = within(projects).getByLabelText('Task title');
    fireEvent.change(nativeTitle, {
      target: { value: 'Independent native title draft' },
    });
    api.state.pages.set(25, { ...f.page, offset: 25, tasks: [] });
    navigate('Team Tasks');
    await within(
      await screen.findByRole('region', { name: 'Team Tasks' }),
    ).findByText(
      'This page no longer contains Tasks. Go back or refresh the list.',
    );
    expect(draft).toHaveValue('  Unsaved literal Ж  ');
    expect(nativeTitle).toBeInTheDocument();
    expect(nativeTitle).toHaveValue('Independent native title draft');
    expect(
      api.calls
        .filter((u) => u.pathname === '/api/team-tasks')
        .map((u) => u.searchParams.get('offset')),
    ).toEqual(['0', '25', '25']);
    fireEvent.click(
      within(region()).getByRole('button', { name: 'Refresh Team Tasks' }),
    );
    await ready();
    expect(draft).toHaveValue('  Unsaved literal Ж  ');
  },
);
function regionHidden() {
  const el = document.getElementById('team-tasks');
  if (!el) throw new Error('Missing retained Team Tasks');
  return el;
}
it.each([
  'missing echo',
  'foreign Company',
  'bad final row',
  'wrong predicate',
  'duplicate id',
  'lookahead',
])(
  'withholds every row and Open for %s and retries the identical request',
  async (kind) => {
    const api = server();
    const page = { ...f.page, tasks: [f.task, { ...f.task, id: f.id('99') }] };
    if (kind === 'missing echo')
      api.state.page = { ...page, appliedFilters: { state: 'open' } };
    if (kind === 'foreign Company')
      api.state.page = { ...page, companyId: f.id('99') };
    if (kind === 'bad final row')
      api.state.page = {
        ...page,
        tasks: [f.task, { ...f.task, id: f.id('99'), createdBy: null }],
      };
    if (kind === 'wrong predicate')
      api.state.page = {
        ...page,
        tasks: [
          {
            ...f.task,
            status: 'cancelled',
            cancellation: {
              reason: 'Declared',
              actor: f.task.createdBy,
              occurredAt: f.task.createdAt,
            },
          },
        ],
      };
    if (kind === 'duplicate id')
      api.state.page = { ...page, tasks: [f.task, f.task] };
    if (kind === 'lookahead') api.state.page = { ...page, hasNextPage: true };
    render(<App identity={deterministicBrowserIdentity()} />);
    await within(
      await screen.findByRole('region', { name: 'Team Tasks' }),
    ).findByRole('alert');
    expect(
      within(region()).queryByRole('heading', { name: f.task.title }),
    ).toBeNull();
    expect(
      within(region()).queryByRole('button', { name: /^Open / }),
    ).toBeNull();
    api.state.page = f.page;
    fireEvent.click(
      within(region()).getByRole('button', { name: 'Retry Team Tasks' }),
    );
    await ready();
    const calls = api.calls.filter((u) => u.pathname === '/api/team-tasks');
    expect(calls[1]?.search).toBe(calls[0]?.search);
  },
);
it('keeps invalid/hidden drafts separate, resets offset deliberately and preserves all four locale controls/focus without I/O', async () => {
  const api = server();
  render(
    <>
      <CurrentWorkLocaleProbe />
      <App identity={deterministicBrowserIdentity()} />
    </>,
  );
  await ready();
  changeValue(
    within(region()).getByRole('combobox', { name: 'Responsibility' }),
    'name',
  );
  const draft = within(region()).getByLabelText('Responsible name contains');
  fireEvent.change(draft, { target: { value: '   ' } });
  const before = api.calls.length;
  fireEvent.click(
    within(region()).getByRole('button', { name: 'Apply criteria' }),
  );
  await within(region()).findByText(
    'Enter 1–200 valid characters for the recorded name.',
  );
  expect(api.calls).toHaveLength(before);
  fireEvent.change(draft, { target: { value: '  Unsubmitted literal ȘЖ  ' } });
  for (const locale of ['ro', 'ru', 'fr', 'en']) {
    draft.focus();
    fireEvent.click(
      screen.getByRole('button', { name: 'Change to ' + locale }),
    );
    expect(draft).toBeInTheDocument();
    expect(draft).toHaveValue('  Unsubmitted literal ȘЖ  ');
    expect(draft).toHaveFocus();
    expect(api.calls).toHaveLength(before);
  }
  changeValue(
    within(region()).getByRole('combobox', { name: 'Responsibility' }),
    'all',
  );
  fireEvent.click(
    within(region()).getByRole('button', { name: 'Apply criteria' }),
  );
  await ready();
  expect(api.calls.at(-1)?.searchParams.has('assigneeName')).toBe(false);
  changeValue(
    within(region()).getByRole('combobox', { name: 'Responsibility' }),
    'name',
  );
  expect(draft).toHaveValue('  Unsubmitted literal ȘЖ  ');
  const from = within(region()).getByLabelText('Due from'),
    through = within(region()).getByLabelText('Due through');
  fireEvent.change(from, { target: { value: '2099-12-31' } });
  fireEvent.change(through, { target: { value: '2000-01-01' } });
  const count = api.calls.length;
  fireEvent.click(
    within(region()).getByRole('button', { name: 'Apply criteria' }),
  );
  await within(region()).findByText('Enter valid calendar dates in order.');
  expect(api.calls).toHaveLength(count);
});
it('preserves an uncertain exact native edit body/key and a confirmed outcome through workboard failure and filter changes', async () => {
  const api = server();
  render(<App identity={deterministicBrowserIdentity()} />);
  await ready();
  fireEvent.click(
    within(region()).getByRole('button', { name: /^Open Exact team work/ }),
  );
  const projects = await screen.findByRole('region', { name: 'Projects' });
  const title = await within(projects).findByDisplayValue(f.task.title);
  fireEvent.change(title, { target: { value: 'Native edit exact literal' } });
  fireEvent.click(within(projects).getByRole('button', { name: 'Save Task' }));
  await waitFor(() => expect(api.state.writes).toHaveLength(1));
  const original = api.state.writes[0];
  navigate('Team Tasks');
  api.state.status = 503;
  fireEvent.click(
    within(region()).getByRole('button', { name: 'Refresh Team Tasks' }),
  );
  await within(region()).findByRole('alert');
  expect(title).toBeInTheDocument();
  expect(title).toHaveValue('Native edit exact literal');
  expect(api.state.writes).toHaveLength(1);
  navigate('Projects');
  api.state.writeStatus = 200;
  api.state.currentTask = {
    ...f.task,
    title: 'Native edit exact literal',
    version: 2,
  };
  fireEvent.click(
    await within(projects).findByRole('button', {
      name: 'Retry pending Task change',
    }),
  );
  await waitFor(() => expect(api.state.writes).toHaveLength(2));
  expect(api.state.writes[1]).toEqual(original);
  await within(projects).findByText('Task change recorded.');
  navigate('Team Tasks');
  await within(region()).findByRole('alert');
  navigate('Projects');
  expect(
    within(projects).getByText('Task change recorded.'),
  ).toBeInTheDocument();
  expect(api.state.writes).toHaveLength(2);
});
